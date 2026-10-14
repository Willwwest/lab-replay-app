// A voice-over: the coach talks through a take while it plays, pausing,
// scrubbing and drawing on it, optionally with their own face in a corner.
// Everything is drawn onto one 16:9 canvas each frame, and the canvas plus
// the microphone is what's recorded, so the family sees exactly what the
// coach saw. Recordings stay on this device until shared.
import { alpha, color } from "./ds/tokens.js";
import { render } from "./drawing.js";
import { clock } from "./format.js";

export const W = 1280;
export const H = 720;
export const MAX_SECONDS = 180;

// Containers that carry sound as well as picture, best first.
export const VOICE_TYPES = [
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];
export const voiceType = (
  supported = (t) => MediaRecorder.isTypeSupported(t),
) => VOICE_TYPES.find(supported) ?? "";

// The largest box of the source's shape that fits w × h, centered.
export function fit(sw, sh, w = W, h = H) {
  if (!sw || !sh) return { x: 0, y: 0, w, h };
  const s = Math.min(w / sw, h / sh);
  const fw = sw * s;
  const fh = sh * s;
  return { x: (w - fw) / 2, y: (h - fh) / 2, w: fw, h: fh };
}

// The coach's camera, a circle in the bottom right.
export const bubble = (w = W, h = H) => {
  const r = Math.round(h * 0.15);
  return { x: w - r - h * 0.04, y: h - r - h * 0.04, r };
};

// Playback stays inside the clip the coach chose.
export const within = (t, take) =>
  Math.min(Math.max(t, take.start ?? 0), take.end ?? take.duration ?? t);

// One frame of the voice-over: the take's picture, the marks, the coach's
// camera, and a small line with whose take it is and where in it we are.
export function compose(ctx, { video, cam, shapes = [], caption = "", t = 0 }) {
  ctx.fillStyle = color.ink;
  ctx.fillRect(0, 0, W, H);
  if (video?.videoWidth) {
    const r = fit(video.videoWidth, video.videoHeight);
    ctx.drawImage(video, r.x, r.y, r.w, r.h);
  }
  render(ctx, shapes, W, H);
  if (cam?.videoWidth) {
    const b = bubble();
    const side = Math.min(cam.videoWidth, cam.videoHeight);
    ctx.save();
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.clip();
    // The selfie camera, mirrored like a mirror, cropped to a square.
    ctx.translate(b.x + b.r, b.y - b.r);
    ctx.scale(-1, 1);
    ctx.drawImage(
      cam,
      (cam.videoWidth - side) / 2,
      (cam.videoHeight - side) / 2,
      side,
      side,
      0,
      0,
      b.r * 2,
      b.r * 2,
    );
    ctx.restore();
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.lineWidth = 6;
    ctx.strokeStyle = color.white;
    ctx.stroke();
  }
  const text = [caption, clock(t)].filter(Boolean).join(" · ");
  ctx.font = "700 24px 'Work Sans', Arial, sans-serif";
  ctx.textBaseline = "middle";
  const tw = ctx.measureText(text).width;
  ctx.fillStyle = alpha(color.ink, 0.66);
  ctx.beginPath();
  ctx.roundRect(24, 24, tw + 36, 48, 24);
  ctx.fill();
  ctx.fillStyle = color.white;
  ctx.fillText(text, 42, 49);
}

// How loud the microphone is, 0–1, from an analyser's time-domain samples.
export function level(samples) {
  if (!samples?.length) return 0;
  let sum = 0;
  for (const s of samples) {
    const v = (s - 128) / 128;
    sum += v * v;
  }
  return Math.min(1, Math.sqrt(sum / samples.length) * 4);
}

// What's kept on the device.
export const voiceRecord = ({ takeId, blob, duration, coach, camera }) => ({
  id: crypto.randomUUID(),
  takeId,
  blob,
  duration,
  coach: coach ?? "",
  camera: !!camera,
  createdAt: new Date().toISOString(),
});
