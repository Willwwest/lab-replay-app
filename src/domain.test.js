import test from "node:test";
import assert from "node:assert/strict";
import { requestJob, transition, recoverJob, summarize } from "./domain.js";
const take = {
  id: "take-1",
  blob: new Blob(["video"]),
  duration: 30,
  member: "Member",
  course: "Course",
};
test("submission freezes clip boundaries and member context", () => {
  const j = requestJob(take, 3, 12, []);
  take.course = "Updated course";
  assert.equal(j.course, "Course");
  assert.equal(j.start, 3);
  assert.equal(j.end, 12);
  assert.equal(j.status, "queued");
});
test("invalid and unassigned clips cannot enter the queue", () => {
  for (const [s, e] of [
    [-1, 5],
    [5, 5],
    [5, 31],
    [NaN, 8],
  ])
    assert.throws(() => requestJob(take, s, e, []));
  assert.throws(() => requestJob({ ...take, member: "" }, 0, 5, []));
  assert.throws(() => requestJob({ ...take, blob: null }, 0, 5, []));
});
test("duplicate jobs blocked while active or completed; cancelled requests can be retried", () => {
  const j = requestJob(take, 0, 5, []);
  for (const status of ["queued", "running", "completed"])
    assert.throws(() => requestJob(take, 0, 5, [{ ...j, status }]));
  assert.equal(
    requestJob(take, 0, 5, [{ ...j, status: "cancelled" }]).status,
    "queued",
  );
});
test("drafts are never accepted as jobs and cancellation cannot be resurrected", () => {
  assert.throws(() => transition({ status: "draft" }, "running"));
  const j = requestJob(take, 0, 5, []);
  const cancelled = transition(j, "cancelled");
  assert.throws(() => transition(cancelled, "running"));
  assert.throws(() => transition(j, "completed"));
});
test("interrupted work requires another explicit request", () => {
  assert.equal(recoverJob({ status: "running" }).status, "failed");
  assert.equal(recoverJob({ status: "queued" }).status, "queued");
});
test("missing poses do not create a movement grade", () => {
  const result = summarize([{ visible: false }, { visible: false }], 0, 5);
  assert.equal(result.coverage, 0);
  assert.equal(result.trackedFrames, 0);
  assert.equal(result.grade, undefined);
});
