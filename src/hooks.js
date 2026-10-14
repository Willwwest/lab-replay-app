// State for the Replay screen, one hook per concern: the local library,
// the editing draft of a take, the camera, analysis jobs, the roster
// connection, a take's portfolio review and the toast.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { all, put, remove } from "./storage.js";
import { recoverJob, requestJob, transition } from "./domain.js";
import { analyze } from "./analysis.js";
import { api, connect, disconnect, savedAccount } from "./service.js";

const replace = (list, item) =>
  list.some((x) => x.id === item.id)
    ? list.map((x) => (x.id === item.id ? item : x))
    : [item, ...list];

/* ---------- Takes and jobs in IndexedDB ---------- */

export function useLibrary(onError) {
  const [takes, setTakes] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [ready, setReady] = useState(false);
  // Jobs change from async analysis runs; the ref is the latest list.
  const jobState = useRef([]);

  useEffect(() => {
    Promise.all([all("takes"), all("jobs")])
      .then(async ([t, j]) => {
        // A job left running by a reload or crash can't resume.
        const fixed = j.map(recoverJob);
        await Promise.all(fixed.map((x) => put("jobs", x)));
        setTakes(t.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
        jobState.current = fixed;
        setJobs(fixed);
        setReady(true);
      })
      .catch((e) => onError(`Could not open local storage: ${e.message}`));
  }, []);

  const saveTake = useCallback(async (next) => {
    await put("takes", next);
    setTakes((old) => replace(old, next));
    return next;
  }, []);

  const saveJob = useCallback(async (next) => {
    await put("jobs", next);
    jobState.current = jobState.current.some((j) => j.id === next.id)
      ? jobState.current.map((j) => (j.id === next.id ? next : j))
      : [...jobState.current, next];
    setJobs(jobState.current);
  }, []);

  async function removeTake(take) {
    const own = jobState.current.filter((j) => j.takeId === take.id);
    if (own.some((j) => ["queued", "running"].includes(j.status)))
      throw Error("Cancel this take's pending requests before deleting it.");
    for (const j of own) await remove("jobs", j.id);
    jobState.current = jobState.current.filter((j) => j.takeId !== take.id);
    setJobs(jobState.current);
    await remove("attempts", take.id);
    await remove("takes", take.id);
    setTakes((old) => old.filter((t) => t.id !== take.id));
  }

  return { takes, jobs, ready, saveTake, saveJob, removeTake, jobState };
}

/* ---------- The take being edited ---------- */

// Everything a coach edits on a take. Edits stay in the draft until Save;
// requests and the portfolio save the draft first.
export const DRAFT_FIELDS = [
  "member",
  "memberId",
  "course",
  "start",
  "end",
  "grade",
  "notes",
  "cue",
  "courseMap",
  "frames",
];

const pick = (take) =>
  take ? Object.fromEntries(DRAFT_FIELDS.map((k) => [k, take[k]])) : null;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function useDraft(take, saveTake) {
  const [draft, setDraft] = useState(() => pick(take));
  const id = take?.id;
  const saved = useMemo(() => pick(take), [take]);
  const dirty = !!draft && !same(draft, saved);

  // A different take, or a save from elsewhere while nothing is pending.
  const last = useRef(id);
  useEffect(() => {
    if (last.current !== id || !dirty) setDraft(pick(take));
    last.current = id;
  }, [id, take]);

  // Leaving the page with unsaved edits asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e) => e.preventDefault();
    addEventListener("beforeunload", warn);
    return () => removeEventListener("beforeunload", warn);
  }, [dirty]);

  const patch = useCallback(
    (fields) =>
      setDraft((d) => ({
        ...d,
        ...(typeof fields === "function" ? fields(d) : fields),
      })),
    [],
  );

  // Saves the draft and returns the saved take. Course map edits bump its
  // version so prepared reviews can tell which map they froze.
  async function commit() {
    if (!take) return null;
    if (!dirty) return take;
    const courseMap =
      draft.courseMap && !same(draft.courseMap, take.courseMap)
        ? {
            ...draft.courseMap,
            version: (take.courseMap?.version || 0) + 1,
          }
        : draft.courseMap;
    return saveTake({ ...take, ...draft, courseMap });
  }

  return {
    view: take && draft ? { ...take, ...draft } : null,
    patch,
    dirty,
    commit,
    discard: () => setDraft(pick(take)),
  };
}

/* ---------- Camera and recorder ---------- */

export const RECORD_TYPES = [
  "video/mp4",
  "video/webm;codecs=vp9",
  "video/webm",
];

export function useCapture({ onTake, onError }) {
  const [open, setOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const stream = useRef(null);
  const recorder = useRef(null);
  const chunks = useRef([]);
  const discard = useRef(false);
  const started = useRef(0);
  const preview = useRef(null);

  useEffect(() => {
    if (open && preview.current) preview.current.srcObject = stream.current;
  }, [open]);
  useEffect(() => () => stopTracks(), []);

  function stopTracks() {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }

  async function openCamera() {
    if (!navigator.mediaDevices?.getUserMedia)
      throw Error(
        "Camera access needs HTTPS or localhost. You can import a video instead.",
      );
    stream.current = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });
    setOpen(true);
  }

  function close() {
    stopTracks();
    setOpen(false);
  }

  function start() {
    chunks.current = [];
    discard.current = false;
    const type = RECORD_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
    const r = new MediaRecorder(stream.current, type ? { mimeType: type } : {});
    recorder.current = r;
    r.ondataavailable = (e) => {
      if (e.data.size) chunks.current.push(e.data);
    };
    r.onstop = () => {
      setRecording(false);
      if (!discard.current)
        onTake(
          new Blob(chunks.current, { type: r.mimeType }),
          `Take ${new Date().toLocaleTimeString()}`,
          (performance.now() - started.current) / 1000,
        );
      chunks.current = [];
    };
    r.onerror = () => {
      onError("Recording failed. Try again.");
      setRecording(false);
      close();
    };
    started.current = performance.now();
    r.start(1000);
    setRecording(true);
  }

  function keep() {
    recorder.current.stop();
    close();
  }

  function restart() {
    discard.current = true;
    recorder.current.onstop = () => {
      chunks.current = [];
      start();
    };
    recorder.current.stop();
  }

  function throwAway() {
    discard.current = true;
    recorder.current.stop();
    close();
  }

  return {
    open,
    recording,
    preview,
    openCamera,
    close,
    start,
    keep,
    restart,
    throwAway,
  };
}

// Reads a video's length; a recording's own timer is the fallback.
export async function videoDuration(blob, hint) {
  if (!blob.size) throw Error("The recording is empty. Try recording again.");
  const v = document.createElement("video");
  const url = URL.createObjectURL(blob);
  v.preload = "metadata";
  v.src = url;
  try {
    const duration = await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(Error("Could not read this video. Try an MP4 file.")),
        15000,
      );
      v.onloadedmetadata = () => {
        clearTimeout(timer);
        resolve(Number.isFinite(v.duration) ? v.duration : hint);
      };
      v.onerror = () => {
        clearTimeout(timer);
        reject(Error("Unsupported video. Try an MP4 file."));
      };
    });
    if (!duration || !Number.isFinite(duration))
      throw Error(
        "Video duration is unavailable. Export it as MP4 and import again.",
      );
    return duration;
  } finally {
    v.removeAttribute("src");
    v.load();
    URL.revokeObjectURL(url);
  }
}

/* ---------- Analysis requests ---------- */

export function useAnalysis(library, onDone) {
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const active = useRef(null);
  const abort = useRef(null);
  useEffect(() => () => abort.current?.abort(), []);

  async function request(take, destination) {
    const job = requestJob(
      take,
      take.start,
      take.end,
      library.jobState.current,
      destination,
    );
    await library.saveJob(job);
    return job;
  }

  async function run(job) {
    if (active.current) return;
    active.current = job.id;
    abort.current = new AbortController();
    setBusy(true);
    setProgress(0);
    try {
      await library.saveJob(transition(job, "running"));
      const source = library.takes.find((t) => t.id === job.takeId);
      if (!source) throw Error("Recording is missing.");
      const result = await analyze(
        source,
        job,
        abort.current.signal,
        setProgress,
      );
      abort.current.signal.throwIfAborted();
      await library.saveJob({
        ...transition({ ...job, status: "running" }, "completed"),
        result,
        progress: 100,
        completedAt: new Date().toISOString(),
      });
      onDone(job);
    } catch (e) {
      const cancelled = e.name === "AbortError";
      await library.saveJob({
        ...job,
        status: cancelled ? "cancelled" : "failed",
        error: cancelled ? "" : e.message,
      });
    } finally {
      active.current = null;
      setBusy(false);
    }
  }

  async function cancel(job) {
    if (active.current === job.id) abort.current?.abort();
    else await library.saveJob(transition(job, "cancelled"));
  }

  return { request, run, cancel, busy, progress };
}

/* ---------- Roster connection ---------- */

export const DEMO_COACHES = [
  { name: "Coach Jordan", phone: "+16025550150" },
  { name: "Coach Priya", phone: "+16025550152" },
  { name: "Coach Alex", phone: "+16025550153" },
];

export function useRoster(onError) {
  const [account, setAccount] = useState(savedAccount);
  const [members, setMembers] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!account) return;
    api("/members")
      .then(setMembers)
      .catch((e) => {
        // The service restarted and forgot the session.
        if (e.status === 401) signOut();
      });
  }, [account?.id]);

  async function signIn(phone) {
    setBusy(true);
    try {
      setAccount(await connect(phone));
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function signOut() {
    disconnect();
    setAccount(null);
    setMembers([]);
  }

  return { account, members, busy, signIn, signOut };
}

/* ---------- A take's portfolio review on the service ---------- */

export function usePortfolio(take) {
  const [review, setReview] = useState(null);
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");
  const id = take?.portfolioId;

  useEffect(() => {
    setReview(null);
    setError("");
    if (id)
      api("/reviews/" + id)
        .then(setReview)
        .catch((e) => setError(e.message));
  }, [take?.id, id]);

  // Poll while the service renders.
  useEffect(() => {
    if (review?.status !== "rendering") return;
    const timer = setInterval(
      () =>
        api("/reviews/" + review.id)
          .then(setReview)
          .catch((e) => setError(e.message)),
      2000,
    );
    return () => clearInterval(timer);
  }, [review?.id, review?.status]);

  // The prepared MP4, once there is one.
  useEffect(() => {
    let live = true;
    let u;
    setUrl("");
    if (["ready", "published", "withdrawn"].includes(review?.status))
      api("/reviews/" + review.id + "/video", { video: true })
        .then((blob) => {
          u = URL.createObjectURL(blob);
          if (live) setUrl(u);
          else URL.revokeObjectURL(u);
        })
        .catch((e) => setError(e.message));
    return () => {
      live = false;
      if (u) URL.revokeObjectURL(u);
    };
  }, [review?.id, review?.status]);

  return { review, setReview, error, setError, url };
}

/* ---------- Toast ---------- */

export function useToast() {
  const [toast, setToast] = useState(null);
  useEffect(() => {
    if (!toast || toast.error) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);
  const say = useCallback(
    (message) => setToast({ id: Date.now(), message }),
    [],
  );
  const fail = useCallback(
    (message) => setToast({ id: Date.now(), message, error: true }),
    [],
  );
  return { toast, say, fail, clear: () => setToast(null) };
}

// The app bar turns into an ink capsule once the page scrolls.
export function useScrolled() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(scrollY > 8);
    on();
    addEventListener("scroll", on, { passive: true });
    return () => removeEventListener("scroll", on);
  }, []);
  return scrolled;
}
