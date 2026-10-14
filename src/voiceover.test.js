import test from "node:test";
import assert from "node:assert/strict";
import {
  H,
  W,
  bubble,
  compose,
  fit,
  level,
  voiceRecord,
  voiceType,
  within,
} from "./voiceover.js";

test("the take is letterboxed into the 16:9 frame, keeping its shape", () => {
  assert.deepEqual(fit(1920, 1080), { x: 0, y: 0, w: W, h: H });
  const tall = fit(1080, 1920); // a phone held upright
  assert.equal(tall.h, H);
  assert.ok(Math.abs(tall.w / tall.h - 1080 / 1920) < 1e-9);
  assert.equal(tall.x, (W - tall.w) / 2);
  assert.deepEqual(fit(0, 0), { x: 0, y: 0, w: W, h: H });
});

test("the coach's camera sits inside the frame, bottom right", () => {
  const b = bubble();
  assert.ok(b.x + b.r < W && b.y + b.r < H && b.x - b.r > W / 2);
});

test("playback stays inside the clip", () => {
  const take = { start: 1, end: 3, duration: 5 };
  assert.equal(within(0.2, take), 1);
  assert.equal(within(4, take), 3);
  assert.equal(within(2, take), 2);
});

test("the meter reads silence as 0 and a loud signal as 1", () => {
  assert.equal(level(new Uint8Array(64).fill(128)), 0);
  assert.equal(
    level(Uint8Array.from({ length: 64 }, (_, i) => (i % 2 ? 255 : 0))),
    1,
  );
  assert.equal(level([]), 0);
});

test("a recording format with sound is chosen when there is one", () => {
  assert.equal(
    voiceType((t) => t.startsWith("video/webm")),
    "video/webm;codecs=vp9,opus",
  );
  assert.equal(
    voiceType(() => false),
    "",
  );
});

test("a frame draws the take, the camera and the caption", () => {
  const calls = [];
  const ctx = new Proxy(
    { measureText: () => ({ width: 100 }) },
    {
      get: (o, k) => (k in o ? o[k] : (...a) => calls.push([k, a])),
      set: () => true,
    },
  );
  const video = { videoWidth: 640, videoHeight: 360 };
  const cam = { videoWidth: 640, videoHeight: 480 };
  compose(ctx, { video, cam, caption: "Theo · Rings", t: 2.4 });
  const drawn = calls.filter(([k]) => k === "drawImage");
  assert.equal(drawn.length, 2, "the take and the camera");
  assert.deepEqual(drawn[0][1].slice(1), [0, 0, W, H]);
  assert.ok(
    calls.some(([k, a]) => k === "fillText" && a[0] === "Theo · Rings · 2.4"),
  );
  const rec = voiceRecord({ takeId: "t", blob: {}, duration: 3, camera: 1 });
  assert.equal(rec.camera, true);
  assert.equal(rec.coach, "");
});
