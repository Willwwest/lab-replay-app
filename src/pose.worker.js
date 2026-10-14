import { PoseLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
// MediaPipe's WASM prints routine "INFO:" lines through console.error;
// send those to console.info so real errors stand out.
const report = console.error.bind(console);
console.error = (...args) =>
  typeof args[0] === "string" && args[0].startsWith("INFO:")
    ? console.info(...args)
    : report(...args);

let landmarker;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === "init") {
      const files = await FilesetResolver.forVisionTasks(`${data.models}wasm`);
      landmarker = await PoseLandmarker.createFromOptions(files, {
        baseOptions: {
          modelAssetPath: `${data.models}pose_landmarker_lite.task`,
        },
        // VIDEO for a clip's frames in order; IMAGE for one still.
        runningMode: data.mode ?? "VIDEO",
        numPoses: 1,
      });
      self.postMessage({ type: "ready" });
    } else if (data.type === "still") {
      try {
        const result = landmarker.detect(data.bitmap);
        self.postMessage({
          type: "still",
          landmarks: result.landmarks[0] || [],
        });
      } finally {
        data.bitmap.close();
      }
    } else {
      try {
        const result = landmarker.detectForVideo(data.bitmap, data.time * 1000);
        const landmarks = result.landmarks[0] || [];
        self.postMessage({
          type: "frame",
          time: data.time,
          landmarks,
          visible:
            landmarks.length > 0 &&
            landmarks.filter((p) => p.visibility > 0.5).length >= 20,
        });
      } finally {
        data.bitmap.close();
      }
    }
  } catch (e) {
    self.postMessage({ type: "error", message: e.message });
  }
};
