import test from "node:test";
import assert from "node:assert/strict";
import {
  BONES,
  angleMark,
  found,
  jointAngles,
  nearestJoint,
  poseRecord,
  renderSkeleton,
} from "./pose.js";

// A standing kid facing the camera: straight legs, elbows bent to 90°.
function standing() {
  const p = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    visibility: 0.9,
  }));
  const set = (i, x, y) => (p[i] = { x, y, visibility: 0.95 });
  set(11, 0.46, 0.3); // shoulders
  set(12, 0.54, 0.3);
  set(13, 0.46, 0.4); // elbows straight down
  set(14, 0.54, 0.4);
  set(15, 0.36, 0.4); // wrists out sideways: a right angle
  set(16, 0.64, 0.4);
  set(23, 0.46, 0.55); // hips
  set(24, 0.54, 0.55);
  set(25, 0.46, 0.7); // knees under hips
  set(26, 0.54, 0.7);
  set(27, 0.46, 0.85); // ankles under knees
  set(28, 0.54, 0.85);
  return p;
}

test("reads each joint's angle on the picture", () => {
  const joints = Object.fromEntries(
    jointAngles(standing(), 1, 1).map((j) => [j.key, j.degrees]),
  );
  assert.equal(joints.kneeL, 180, "a straight leg");
  assert.equal(joints.kneeR, 180);
  assert.equal(joints.hipL, 180);
  assert.equal(joints.elbowL, 90, "a bent elbow");
  assert.equal(Object.keys(joints).length, 8);
});

test("a joint the camera can't see clearly isn't read", () => {
  const p = standing();
  p[27] = { ...p[27], visibility: 0.2 }; // left ankle hidden
  const keys = jointAngles(p).map((j) => j.key);
  assert.ok(!keys.includes("kneeL"));
  assert.ok(keys.includes("kneeR"));
  assert.deepEqual(jointAngles([]), []);
  assert.deepEqual(jointAngles(null), []);
});

test("a tap near a joint finds it; far away finds nothing", () => {
  const joints = jointAngles(standing(), 1280, 720);
  assert.equal(
    nearestJoint(joints, { x: 0.461, y: 0.701 }, 1280, 720).key,
    "kneeL",
  );
  assert.equal(nearestJoint(joints, { x: 0.9, y: 0.1 }, 1280, 720), null);
});

test("a reading becomes an ordinary angle mark at the joint", () => {
  const [knee] = jointAngles(standing()).filter((j) => j.key === "kneeL");
  const mark = angleMark(knee, "gold");
  assert.equal(mark.type, "angle");
  assert.deepEqual(mark.b, { x: 0.46, y: 0.7 });
  assert.equal("visibility" in mark.b, false, "only the point is kept");
});

test("a stored detection is rounded and says whether a body was found", () => {
  const rec = poseRecord([
    { x: 0.123456, y: 0.98765, visibility: 0.55555, z: 3 },
  ]);
  assert.deepEqual(rec.landmarks[0], {
    x: 0.1235,
    y: 0.9877,
    visibility: 0.5556,
  });
  assert.equal(found(rec), false);
  assert.equal(found(poseRecord(standing())), true);
  assert.equal(found(poseRecord([])), false);
  assert.equal(found(null), false);
});

test("the skeleton draws only bones it can see", () => {
  const strokes = [];
  const ctx = new Proxy(
    {},
    {
      get: (o, k) => (k === "stroke" ? () => strokes.push(1) : () => {}),
      set: () => true,
    },
  );
  renderSkeleton(ctx, standing(), 640, 360);
  const all = strokes.length;
  const p = standing();
  p[27] = { ...p[27], visibility: 0 };
  strokes.length = 0;
  renderSkeleton(ctx, p, 640, 360);
  assert.ok(strokes.length < all, "the hidden ankle's bones are left out");
  assert.ok(BONES.length > 10);
});
