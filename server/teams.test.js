import test from "node:test";
import assert from "node:assert/strict";
import {
  addResult,
  applyLive,
  closeTeam,
  createTeam,
  nextUp,
  standings,
  teamView,
} from "./teams.js";

const members = [
  { id: "theo", name: "Theo Parker" },
  { id: "maya", name: "Maya Brooks" },
  { id: "leo", name: "Leo Rivera" },
];
const coach = { kind: "staff", id: "jordan", name: "Coach Jordan" };
const course = {
  name: "Circuit",
  courseKey: "k",
  points: [{ label: "Rings" }, { label: "Wall" }],
};
const make = () =>
  createTeam(
    { course, rules: { timeCap: 60 }, athletes: ["theo", "maya", "leo"] },
    members,
    coach,
    1000,
  );
const run = (id, memberId, seconds, completed) => ({
  id,
  memberId,
  seconds,
  completed,
  ended: completed ? "finished" : "fail-limit",
  obstacles: [
    { label: "Rings", result: "pass" },
    { label: "Wall", result: completed ? "pass" : "fail" },
  ],
});

test("a team run needs a course and two or more distinct roster athletes", () => {
  const t = make();
  assert.equal(t.athletes.length, 3);
  assert.equal(t.code.length, 6);
  assert.equal(t.status, "open");
  for (const bad of [
    { athletes: ["theo"] },
    { athletes: ["theo", "theo"] },
    { athletes: ["theo", "nobody"] },
    { course: { ...course, points: [] } },
  ])
    assert.throws(() =>
      createTeam(
        { course, athletes: ["theo", "maya"], ...bad },
        members,
        coach,
      ),
    );
});

test("live state turns device seconds into a server start time", () => {
  let t = make();
  t = applyLive(t, { memberId: "theo", phase: "countdown" }, 5000);
  assert.equal(t.live.startedAt, null);
  t = applyLive(t, { memberId: "theo", phase: "running", elapsed: 0.5 }, 10000);
  assert.equal(t.live.startedAt, 9500);
  // Later updates keep the first start time, so marks don't drift it.
  t = applyLive(
    t,
    {
      memberId: "theo",
      phase: "running",
      elapsed: 3,
      marks: [{ result: "pass", at: 2.9 }],
    },
    12600,
  );
  assert.equal(t.live.startedAt, 9500);
  assert.equal(t.live.marks.length, 1);
  assert.throws(() => applyLive(t, { memberId: "zoe", phase: "running" }));
  assert.throws(() =>
    applyLive(t, {
      memberId: "theo",
      phase: "running",
      marks: [{ result: "x", at: 1 }],
    }),
  );
  assert.equal(applyLive(t, { clear: true }).live, null);
});

test("results clear the runner, never duplicate, and move the queue on", () => {
  let t = make();
  assert.equal(nextUp(t).memberId, "theo");
  t = applyLive(t, { memberId: "theo", phase: "running", elapsed: 0 });
  t = addResult(t, { memberId: "theo", runId: "r1" });
  assert.equal(t.live, null);
  assert.equal(
    addResult(t, { memberId: "theo", runId: "r1" }).results.length,
    1,
  );
  assert.equal(nextUp(t).memberId, "maya");
  assert.throws(() => addResult(t, { memberId: "zoe", runId: "r9" }));
  const closed = closeTeam(t);
  assert.throws(() => addResult(closed, { memberId: "maya", runId: "r2" }));
  assert.throws(() => applyLive(closed, { memberId: "maya", phase: "ready" }));
});

test("standings rank clean bests, then runs without a clean finish, then waiting", () => {
  let t = make();
  t = addResult(t, { memberId: "theo", runId: "a" });
  t = addResult(t, { memberId: "maya", runId: "b" });
  t = addResult(t, { memberId: "theo", runId: "c" });
  t = applyLive(t, { memberId: "leo", phase: "running", elapsed: 1 });
  const rows = standings(t, [
    run("a", "theo", 20, true),
    run("b", "maya", 15, false),
    run("c", "theo", 18, true),
  ]);
  assert.deepEqual(
    rows.map((r) => [r.memberId, r.rank ?? null, r.best, r.status]),
    [
      ["theo", 1, 18, "clean"],
      ["maya", null, null, "no clean run"],
      ["leo", null, null, "on course"],
    ],
  );
  assert.equal(rows[0].runs, 2);
  assert.equal(rows[1].last.passed, 1);
});

test("families see their own kid by name and others as LAB ninja", () => {
  let t = make();
  t = addResult(t, { memberId: "maya", runId: "b" });
  t = applyLive(t, { memberId: "maya", phase: "running", elapsed: 0 });
  const runs = [run("b", "maya", 15, true)];
  const family = teamView({ kind: "guardian", kids: ["theo"] }, t, runs, 5);
  assert.equal(family.live.name, "LAB ninja");
  assert.equal(family.live.memberId, null);
  assert.equal(family.standings[0].name, "LAB ninja");
  assert.equal(family.standings.find((r) => r.mine).name, "Theo Parker");
  assert.equal(family.athletes, undefined);
  assert.equal(teamView(coach, t, runs).live.name, "Maya Brooks");
  assert.throws(() => teamView({ kind: "guardian", kids: ["nora"] }, t, runs));
});
