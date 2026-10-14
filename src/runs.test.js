import test from "node:test";
import assert from "node:assert/strict";
import { courseKey, buildAttempt, progressFor } from "./attempts.js";
import {
  capWarning,
  createRun,
  current,
  fails,
  finish,
  mark,
  pace,
  runKey,
  splits,
  tick,
  toAttempt,
  undo,
} from "./runs.js";

const course = {
  name: "LAB circuit",
  points: [
    { label: "Rings", skill: "Swing transfer", x: 0.2, y: 0.3 },
    { label: "Wall", skill: "Wall run", x: 0.5, y: 0.5 },
    { label: "Bars", skill: "", x: 0.7, y: 0.2 },
  ],
};
const who = { memberId: "theo", member: "Theo Parker" };

test("a run needs a course with obstacles unless it's a quick run", () => {
  assert.throws(() => createRun({ course: { name: "x", points: [] } }));
  assert.equal(createRun({ quick: true }).course.name, "Quick run");
});

test("marking every obstacle finishes the run at the last mark", () => {
  let run = createRun({ course });
  assert.equal(current(run), 0);
  run = mark(run, "pass", 3.2);
  run = mark(run, "fail", 7.9);
  assert.equal(current(run), 2);
  assert.equal(fails(run), 1);
  run = mark(run, "pass", 12.4);
  assert.deepEqual(run.ended, { reason: "finished", at: 12.4 });
  assert.equal(current(run), null);
  assert.throws(() => mark(run, "pass", 13));
  const rows = splits(run);
  assert.deepEqual(
    rows.map((r) => [r.start, r.end]),
    [
      [0, 3.2],
      [3.2, 7.9],
      [7.9, 12.4],
    ],
  );
});

test("the fail limit ends the run", () => {
  let run = createRun({ course, rules: { failLimit: 2 } });
  run = mark(run, "fail", 2);
  assert.equal(run.ended, null);
  run = mark(run, "fail", 4);
  assert.equal(run.ended.reason, "fail-limit");
});

test("the time cap ends the run exactly at the cap and warns before", () => {
  let run = createRun({ course, rules: { timeCap: 30 } });
  assert.equal(capWarning(run, 19.9), false);
  assert.equal(capWarning(run, 20), true);
  run = tick(run, 29.9);
  assert.equal(run.ended, null);
  run = tick(run, 30.07);
  assert.deepEqual(run.ended, { reason: "time-cap", at: 30 });
});

test("undo removes the last mark while running, not after", () => {
  let run = mark(createRun({ course }), "pass", 1);
  run = undo(run);
  assert.equal(run.marks.length, 0);
  run = finish(mark(run, "pass", 1), 2);
  assert.equal(run.ended.reason, "stopped");
  assert.equal(undo(run), run);
});

test("marks never go back in time", () => {
  let run = mark(createRun({ course }), "pass", 5);
  run = mark(run, "pass", 4);
  assert.equal(run.marks[1].at, 5);
});

test("a stopped run scores unreached obstacles as skipped with no time", () => {
  let run = mark(createRun({ course }), "pass", 3);
  run = finish(run, 6);
  const a = toAttempt(run, who);
  assert.equal(a.ended, "stopped");
  assert.equal(a.completed, false);
  assert.deepEqual(
    a.obstacles.map((o) => [o.result, o.start, o.end]),
    [
      ["pass", 0, 3],
      ["skip", null, null],
      ["skip", null, null],
    ],
  );
  assert.equal(a.seconds, 6);
});

test("a finished clean run is completed and compares with Review attempts", () => {
  let run = createRun({ course });
  for (const t of [3, 6, 9]) run = mark(run, "pass", t);
  const a = toAttempt(run, who);
  assert.ok(a.completed);
  assert.equal(a.courseKey, courseKey(course));
  const stats = progressFor([a], "theo", courseKey(course));
  assert.equal(stats.best, 9);
});

test("finish-screen corrections override the marks", () => {
  let run = createRun({ course });
  for (const t of [3, 6, 9]) run = mark(run, "pass", t);
  const a = toAttempt(run, { ...who, results: [, "fail"] });
  assert.equal(a.obstacles[1].result, "fail");
  assert.equal(a.completed, false);
});

test("a filmed run fits its recording and passes Review's validation", () => {
  let run = createRun({ course });
  for (const t of [3, 6, 9.4]) run = mark(run, "pass", t);
  const a = toAttempt(run, { ...who, takeId: "t1", clipEnd: 9.3 });
  assert.equal(a.id, "t1");
  assert.equal(a.end, 9.3);
  assert.equal(a.obstacles[2].end, 9.3);
  const take = {
    id: "t1",
    memberId: "theo",
    courseMap: course,
    duration: 9.3,
  };
  const again = buildAttempt(take, a.obstacles, 0, 9.3);
  assert.equal(again.obstacles.length, 3);
});

test("quick runs are laps compared by name", () => {
  let run = createRun({ quick: true, course: { name: "Warped wall" } });
  assert.equal(current(run), null);
  run = mark(run, "pass", 4);
  run = finish(run, 9);
  assert.equal(run.ended.reason, "finished");
  const rows = splits(run);
  assert.deepEqual(
    rows.map((r) => r.label),
    ["Lap 1", "Lap 2"],
  );
  const a = toAttempt(run, who);
  assert.ok(a.completed);
  assert.equal(a.courseKey, runKey(run));
  assert.equal(
    runKey(createRun({ quick: true, course: { name: " warped WALL" } })),
    a.courseKey,
  );
});

test("pace reads split times from a previous attempt", () => {
  let run = createRun({ course });
  for (const t of [3, 6, 9]) run = mark(run, "pass", t);
  assert.deepEqual(pace(toAttempt(run, who)), [3, 6, 9]);
  assert.deepEqual(pace(null), []);
});
