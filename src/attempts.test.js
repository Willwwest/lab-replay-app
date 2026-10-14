import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAttempt, progressFor, courseKey } from "./attempts.js";
const take = {
  id: "t",
  memberId: "m",
  duration: 10,
  createdAt: "2026-10-14",
  courseMap: {
    name: "Route",
    points: [
      { label: "Rings", skill: "Swing", x: 0.2, y: 0.3 },
      { label: "Wall", x: 0.4, y: 0.5 },
    ],
  },
};
test("attempt requires complete scoring and valid ordered timing", () => {
  assert.throws(() => buildAttempt(take, [], 0, 10), /Choose a result/);
  assert.throws(
    () =>
      buildAttempt(
        take,
        [
          { result: "pass", start: 0, end: 6 },
          { result: "pass", start: 5, end: 8 },
        ],
        0,
        10,
      ),
    /overlapping/,
  );
  assert.throws(
    () =>
      buildAttempt(
        take,
        [{ result: "pass", start: 0 }, { result: "skip" }],
        0,
        10,
      ),
    /both times/,
  );
});
test("best times exclude failures, other members and changed courses", () => {
  const a = buildAttempt(take, [{ result: "pass" }, { result: "pass" }], 0, 10);
  const b = { ...a, id: "b", seconds: 2, completed: false };
  const c = { ...a, id: "c", memberId: "other", seconds: 1 };
  assert.equal(progressFor([a, b, c], "m", a.courseKey).best, 10);
  assert.notEqual(
    courseKey({
      ...take.courseMap,
      points: [...take.courseMap.points].reverse(),
    }),
    a.courseKey,
  );
});
