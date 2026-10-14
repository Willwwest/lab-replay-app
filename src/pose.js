// The body on a key frame: MediaPipe's 33 pose landmarks, drawn as a
// skeleton, and the angles at the joints a coach reads (elbows, shoulders,
// hips, knees). Angles are measured on the picture, so they change with
// where the camera stood; they help a coach point, they don't grade.
// Left and right are the kid's own.
import { color, alpha } from "./ds/tokens.js";
import { angleDegrees, metrics } from "./drawing.js";

// Landmark indices (MediaPipe Pose).
const L = {
  shoulderL: 11,
  shoulderR: 12,
  elbowL: 13,
  elbowR: 14,
  wristL: 15,
  wristR: 16,
  hipL: 23,
  hipR: 24,
  kneeL: 25,
  kneeR: 26,
  ankleL: 27,
  ankleR: 28,
  heelL: 29,
  heelR: 30,
  toeL: 31,
  toeR: 32,
};

export const BONES = [
  [L.shoulderL, L.shoulderR],
  [L.shoulderL, L.elbowL],
  [L.elbowL, L.wristL],
  [L.shoulderR, L.elbowR],
  [L.elbowR, L.wristR],
  [L.shoulderL, L.hipL],
  [L.shoulderR, L.hipR],
  [L.hipL, L.hipR],
  [L.hipL, L.kneeL],
  [L.kneeL, L.ankleL],
  [L.ankleL, L.heelL],
  [L.heelL, L.toeL],
  [L.hipR, L.kneeR],
  [L.kneeR, L.ankleR],
  [L.ankleR, L.heelR],
  [L.heelR, L.toeR],
];

// Each joint: the landmark it's at and the two it's measured between.
export const JOINTS = [
  { key: "elbowL", label: "Left elbow", at: [L.shoulderL, L.elbowL, L.wristL] },
  {
    key: "elbowR",
    label: "Right elbow",
    at: [L.shoulderR, L.elbowR, L.wristR],
  },
  {
    key: "shoulderL",
    label: "Left shoulder",
    at: [L.hipL, L.shoulderL, L.elbowL],
  },
  {
    key: "shoulderR",
    label: "Right shoulder",
    at: [L.hipR, L.shoulderR, L.elbowR],
  },
  { key: "hipL", label: "Left hip", at: [L.shoulderL, L.hipL, L.kneeL] },
  { key: "hipR", label: "Right hip", at: [L.shoulderR, L.hipR, L.kneeR] },
  { key: "kneeL", label: "Left knee", at: [L.hipL, L.kneeL, L.ankleL] },
  { key: "kneeR", label: "Right knee", at: [L.hipR, L.kneeR, L.ankleR] },
];

export const VISIBLE = 0.5;
const seen = (p) => !!p && (p.visibility ?? 1) >= VISIBLE;

// A detection as it's stored on a frame: 33 points, rounded, or none.
export function poseRecord(landmarks, model = "pose_landmarker_lite") {
  const round = (v) => Math.round(v * 1e4) / 1e4;
  return {
    landmarks: (landmarks ?? []).map((p) => ({
      x: round(p.x),
      y: round(p.y),
      visibility: round(p.visibility ?? 0),
    })),
    model,
    at: new Date().toISOString(),
  };
}

export const found = (pose) => (pose?.landmarks?.length ?? 0) >= 33;

// The joints whose three points are all clearly visible, with their angle
// on a w × h picture.
export function jointAngles(landmarks, w = 1, h = 1) {
  if (!landmarks || landmarks.length < 33) return [];
  return JOINTS.filter((j) => j.at.every((i) => seen(landmarks[i]))).map(
    (j) => {
      const [a, b, c] = j.at.map((i) => landmarks[i]);
      return {
        key: j.key,
        label: j.label,
        a,
        b,
        c,
        degrees: angleDegrees(a, b, c, w, h),
      };
    },
  );
}

// The joint nearest p (fractions), within reach of a fingertip; or null.
export function nearestJoint(joints, p, w, h) {
  const reach = Math.max(22, metrics(w).handle * 2.5);
  let best = null;
  let d = Infinity;
  for (const j of joints) {
    const dj = Math.hypot((j.b.x - p.x) * w, (j.b.y - p.y) * h);
    if (dj < d && dj <= reach) {
      best = j;
      d = dj;
    }
  }
  return best;
}

// A joint's angle as an ordinary angle mark, so the coach can adjust it.
export const angleMark = (joint, ink = "gold") => ({
  id: crypto.randomUUID(),
  type: "angle",
  ink,
  a: { x: joint.a.x, y: joint.a.y },
  b: { x: joint.b.x, y: joint.b.y },
  c: { x: joint.c.x, y: joint.c.y },
});

// The skeleton: visible bones as thin lines, joints as dots.
export function renderSkeleton(ctx, landmarks, w, h) {
  if (!landmarks || landmarks.length < 33) return;
  const lw = Math.max(2, metrics(w).line * 0.6);
  const at = (p) => [p.x * w, p.y * h];
  ctx.lineCap = "round";
  for (const [i, j] of BONES) {
    const p = landmarks[i];
    const q = landmarks[j];
    if (!seen(p) || !seen(q)) continue;
    ctx.beginPath();
    ctx.moveTo(...at(p));
    ctx.lineTo(...at(q));
    ctx.strokeStyle = alpha(color.ink, 0.5);
    ctx.lineWidth = lw + 2;
    ctx.stroke();
    ctx.strokeStyle = alpha(color.white, 0.85);
    ctx.lineWidth = lw;
    ctx.stroke();
  }
  const dots = new Set(BONES.flat());
  for (const i of dots) {
    const p = landmarks[i];
    if (!seen(p)) continue;
    ctx.beginPath();
    ctx.arc(...at(p), lw * 1.6, 0, Math.PI * 2);
    ctx.fillStyle = color.cyan;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = color.ink;
    ctx.stroke();
  }
}
