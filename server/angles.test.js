import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_CAMERAS,
  addClip,
  clipFor,
  close,
  code,
  createSession,
  discard,
  dropClip,
  join,
  leave,
  live,
  seen,
  start,
  stop,
  view,
} from "./angles.js";

const host = { kind: "staff", id: "jordan", name: "Coach Jordan" };
const other = { kind: "staff", id: "sam", name: "Coach Sam" };
const T = 1_800_000_000_000;

test("codes are five unambiguous characters", () => {
  const c = code();
  assert.match(c, /^[A-HJ-NP-Z2-9]{5}$/);
});

test("phones join as cameras, once each, up to the limit", () => {
  let s = createSession(host, T, () => "ABCDE");
  const a = join(s, other, { label: "Wall side<script>" }, T);
  assert.equal(a.camera.label, "Wall sidescript");
  s = a.session;
  const again = join(s, other, { camera: a.camera.id }, T + 5);
  assert.equal(again.session.cameras.length, 1, "rejoining isn't a new camera");
  for (let i = 1; i < MAX_CAMERAS; i++) s = join(s, other, {}, T).session;
  assert.equal(s.cameras.length, MAX_CAMERAS);
  assert.equal(s.cameras[1].label, "Camera 3", "unnamed cameras are numbered");
  assert.throws(() => join(s, other, {}, T));
  assert.equal(leave(s, a.camera.id).cameras.length, MAX_CAMERAS - 1);
});

test("only the host starts and stops; a camera sees it running", () => {
  let s = createSession(host, T);
  const { session, camera } = join(s, other, {}, T);
  s = session;
  assert.throws(() => start(s, other, {}, T));
  assert.throws(() => start(s, host, { startedAt: T + 120000 }, T), /too far/);
  s = start(
    s,
    host,
    { startedAt: T + 20, memberId: "theo", member: "Theo Parker" },
    T,
  );
  assert.ok(live(s, T + 1000));
  assert.equal(
    view(seen(s, camera.id, T + 500), T + 1000).cameras[0].online,
    true,
  );
  assert.equal(view(s, T + 20000).cameras[0].online, false);
  assert.ok(!live(s, T + 11 * 60000), "a forgotten recording times out");
  assert.throws(() => stop(s, other, {}, T));
  const stopped = stop(s, host, { recordingId: s.recording.id }, T + 4000);
  assert.equal(stopped.recording.stoppedAt, T + 4000);
  assert.ok(!live(stopped, T + 4001));
  assert.equal(
    stop(s, host, { recordingId: "old" }, T),
    s,
    "an old stop is ignored",
  );
});

test("a camera's clip is checked against the recording", () => {
  const { session, camera } = join(createSession(host, T), other, {}, T);
  const s = start(session, host, { startedAt: T }, T);
  const q = {
    camera: camera.id,
    recording: s.recording.id,
    startedAt: String(T + 180),
    duration: "4.2",
    type: "video/mp4",
  };
  const clip = clipFor(s, q, 1000, T);
  assert.equal(clip.startedAt, T + 180);
  assert.equal(clip.label, "Camera 2");
  assert.equal(
    clipFor(s, { ...q, type: "text/html" }, 1, T).type,
    "video/webm",
  );
  assert.throws(() => clipFor(addClip(s, clip), q, 1000, T), /already sent/);
  for (const [bad, why] of [
    [{ camera: "nobody" }, /Join/],
    [{ recording: "old" }, /isn't wanted/],
    [{ startedAt: String(T + 60000) }, /start time/],
    [{ duration: "0" }, /length/],
    [{ duration: "9999" }, /length/],
  ])
    assert.throws(() => clipFor(s, { ...q, ...bad }, 1000, T), why);
  assert.throws(() => clipFor(s, q, 0, T), /empty/);
});

test("discarding the host's take drops the cameras' clips of it", () => {
  let s = createSession(host, T);
  const { session, camera } = join(s, other, {}, T);
  s = start(session, host, { startedAt: T }, T);
  const r = s.recording.id;
  s = addClip(s, { id: "c1", recordingId: r, camera: camera.id });
  s = discard(s, host, r, T + 10);
  assert.equal(s.clips.length, 0);
  assert.ok(s.recording.discarded);
  assert.throws(() =>
    clipFor(
      s,
      { camera: camera.id, recording: r, startedAt: T, duration: 1 },
      1,
      T,
    ),
  );
  assert.equal(dropClip(addClip(s, { id: "x" }), "x").clips.length, 0);
  assert.throws(() => close(s, other));
  const ended = close(s, host);
  assert.throws(() => join(ended, other, {}, T), /ended/);
});
