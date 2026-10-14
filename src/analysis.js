import { summarize } from "./domain.js";
import { asset } from "./paths.js";
import { loadImage } from "./stills.js";
function waitEvent(target, event, signal) {
  return new Promise((resolve, reject) => {
    const done = () => {
      clean();
      resolve();
    };
    const fail = () => {
      clean();
      reject(
        new Error(
          "This browser could not decode the video. Try an MP4 recording.",
        ),
      );
    };
    const abort = () => {
      clean();
      reject(new DOMException("Cancelled", "AbortError"));
    };
    const clean = () => {
      target.removeEventListener(event, done);
      target.removeEventListener("error", fail);
      signal.removeEventListener("abort", abort);
    };
    target.addEventListener(event, done, { once: true });
    target.addEventListener("error", fail, { once: true });
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}
// One request to the pose worker and its one reply.
function call(worker, message, transfer = [], signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => finish(new Error("Analysis timed out. Retry the clip.")),
      90000,
    );
    const abort = () => finish(new DOMException("Cancelled", "AbortError"));
    const finish = (error, result) => {
      clearTimeout(timer);
      worker.onmessage = null;
      worker.onerror = null;
      signal?.removeEventListener("abort", abort);
      error ? reject(error) : resolve(result);
    };
    worker.onmessage = ({ data }) =>
      data.type === "error"
        ? finish(new Error(data.message))
        : finish(null, data);
    worker.onerror = (e) => finish(new Error(e.message));
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    else worker.postMessage(message, transfer);
  });
}

export async function analyze(take, job, signal, onProgress) {
  const worker = new Worker(asset("processor.js"));
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  const url = URL.createObjectURL(take.blob);
  video.src = url;
  const rpc = (message, transfer) => call(worker, message, transfer, signal);
  try {
    await waitEvent(video, "loadeddata", signal);
    await rpc({ type: "init", models: asset("models/"), mode: "VIDEO" });
    const samples = [],
      frames = [];
    const step = Math.max(0.5, (job.end - job.start) / 600);
    let index = 0;
    for (let t = job.start; t < job.end; t += step) {
      signal.throwIfAborted();
      if (Math.abs(video.currentTime - t) > 0.001) {
        const seek = waitEvent(video, "seeked", signal);
        video.currentTime = t;
        await seek;
      }
      const bitmap = await createImageBitmap(video);
      const sample = await rpc({ type: "frame", bitmap, time: t }, [bitmap]);
      samples.push(sample);
      if (
        index % Math.max(1, Math.floor((job.end - job.start) / step / 6)) ===
          0 &&
        frames.length < 6
      ) {
        const canvas = document.createElement("canvas");
        canvas.width = 480;
        canvas.height = (480 * video.videoHeight) / video.videoWidth;
        canvas
          .getContext("2d")
          .drawImage(video, 0, 0, canvas.width, canvas.height);
        frames.push({
          id: crypto.randomUUID(),
          time: t,
          image: canvas.toDataURL("image/jpeg", 0.7),
          note: "Sampled frame — review with coach",
        });
      }
      index++;
      onProgress(
        Math.min(
          99,
          Math.round(((t - job.start) / (job.end - job.start)) * 100),
        ),
      );
    }
    return { summary: summarize(samples, job.start, job.end), samples, frames };
  } finally {
    worker.terminate();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

// The body on one still, on this device, when a coach asks for it. One
// worker serves every still in turn and closes after a minute unused.
let still = null;
let queue = Promise.resolve();
let idle = 0;
export function detectStill(image) {
  const run = async () => {
    clearTimeout(idle);
    if (!still) {
      const worker = new Worker(asset("processor.js"));
      still = call(worker, {
        type: "init",
        models: asset("models/"),
        mode: "IMAGE",
      }).then(
        () => worker,
        (e) => {
          worker.terminate();
          still = null;
          throw e;
        },
      );
    }
    const worker = await still;
    try {
      const bitmap = await createImageBitmap(await loadImage(image));
      const { landmarks } = await call(worker, { type: "still", bitmap }, [
        bitmap,
      ]);
      return landmarks;
    } finally {
      idle = setTimeout(() => {
        worker.terminate();
        still = null;
      }, 60000);
    }
  };
  const next = queue.then(run, run);
  queue = next.catch(() => {});
  return next;
}
