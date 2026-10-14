import test from "node:test";
import assert from "node:assert/strict";
import { accountFor, canRead, validateReview } from "./access.js";
const roster = {
  staff: [{ id: "coach", phone: "staff", name: "Coach" }],
  families: [{ id: "a", kids: ["theo"], guardians: [{ phone: "parent" }] }],
};
test("family scope is derived from roster and staff has gym-wide access", () => {
  const a = accountFor(roster, "parent");
  assert.equal(canRead(a, "theo"), true);
  assert.equal(canRead(a, "maya"), false);
  assert.equal(canRead(accountFor(roster, "staff"), "maya"), true);
  assert.equal(accountFor(roster, "unknown"), null);
  assert.equal(a.name, "Family", "a guardian without a name on file");
});
const review = {
  memberId: "theo",
  start: 1,
  end: 3,
  course: {
    name: "Course",
    points: [
      { x: 0.1, y: 0.1, label: "Start" },
      { x: 0.8, y: 0.8, label: "Finish" },
    ],
  },
  analysis: { status: "completed", start: 1, end: 3 },
  grade: "Consistent",
  cue: "Settle before the next step",
};
test("portfolio requires matching analyzed interval, roster identity, route and coach review", () => {
  const members = [{ id: "theo" }];
  validateReview(review, members);
  for (const change of [
    { memberId: "other" },
    { start: 2 },
    { grade: "Not reviewed" },
    { cue: "" },
    { course: { name: "Course", points: [] } },
    { analysis: { status: "queued", start: 1, end: 3 } },
    { voiceoverAssetId: 5 },
    { voiceoverAssetId: "" },
  ])
    assert.throws(() => validateReview({ ...review, ...change }, members));
});
test("a voice-over is only claimed by the service's render, not the coach", () => {
  const body = {
    ...review,
    voiceoverAssetId: "v1",
    voiceover: { duration: 9 },
  };
  validateReview(body, [{ id: "theo" }]);
  assert.equal(body.voiceover, undefined);
  assert.equal(body.voiceoverAssetId, "v1");
});
