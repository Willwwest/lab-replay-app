import test from "node:test";
import assert from "node:assert/strict";
import { boardFor, courseList, leaderboard, validateRun } from "./runs.js";

const members = [
  { id: "theo", name: "Theo Parker" },
  { id: "maya", name: "Maya Brooks" },
  { id: "leo", name: "Leo Rivera" },
];
const run = (memberId, seconds, completed, daysAgo, extra = {}) => ({
  id: `${memberId}-${seconds}-${daysAgo}`,
  memberId,
  member: members.find((m) => m.id === memberId).name,
  course: "LAB circuit",
  courseKey: "k",
  createdAt: new Date(
    Date.parse("2026-10-14T19:00:00Z") - daysAgo * 864e5,
  ).toISOString(),
  seconds,
  completed,
  ...extra,
});
const now = new Date("2026-10-14T19:00:00Z");

test("a valid run is stored with the server's own clean flag", () => {
  const body = {
    id: "r1",
    memberId: "theo",
    course: " LAB circuit ",
    courseKey: "k",
    createdAt: "2026-10-14T19:00:00Z",
    seconds: 12.345,
    completed: true,
    ended: "stopped",
    source: "timer",
    obstacles: [{ label: "Rings", result: "pass", seconds: 4 }],
  };
  const r = validateRun(body, members);
  assert.equal(r.member, "Theo Parker");
  assert.equal(r.course, "LAB circuit");
  assert.equal(r.seconds, 12.35);
  assert.equal(r.completed, false, "a stopped run isn't clean");
  assert.equal(
    validateRun({ ...body, ended: "finished" }, members).completed,
    true,
  );
  assert.equal(
    validateRun(
      {
        ...body,
        ended: undefined,
        obstacles: [{ label: "x", result: "fail" }],
      },
      members,
    ).completed,
    false,
  );
});

test("malformed runs are refused", () => {
  const ok = {
    id: "r1",
    memberId: "theo",
    course: "c",
    courseKey: "k",
    createdAt: "2026-10-14T19:00:00Z",
    seconds: 5,
    obstacles: [{ label: "a", result: "pass" }],
  };
  assert.doesNotThrow(() => validateRun(ok, members));
  for (const bad of [
    { memberId: "nobody" },
    { seconds: -1 },
    { seconds: 99999 },
    { obstacles: [] },
    { obstacles: [{ label: "a", result: "maybe" }] },
    { createdAt: "yesterday" },
    { ended: "exploded" },
    { course: "" },
  ])
    assert.throws(
      () => validateRun({ ...ok, ...bad }, members),
      JSON.stringify(bad),
    );
});

test("the leaderboard keeps each member's best clean run, fastest first", () => {
  const runs = [
    run("theo", 20, true, 10),
    run("theo", 18, true, 2),
    run("theo", 15, false, 1),
    run("maya", 17, true, 3),
    run("leo", 25, false, 1),
  ];
  const rows = leaderboard(runs, "k", "all", now);
  assert.deepEqual(
    rows.map((r) => [r.rank, r.memberId, r.seconds, r.runs]),
    [
      [1, "maya", 17, 1],
      [2, "theo", 18, 3],
    ],
  );
});

test("periods limit which runs count, and ties share a rank", () => {
  const runs = [
    run("theo", 16, true, 20),
    run("theo", 19, true, 2),
    run("maya", 19, true, 5),
    run("leo", 21, true, 40),
  ];
  assert.deepEqual(
    leaderboard(runs, "k", "week", now).map((r) => [r.rank, r.memberId]),
    // Equal times share first place; the earlier run lists first.
    [
      [1, "maya"],
      [1, "theo"],
    ],
  );
  assert.equal(leaderboard(runs, "k", "month", now)[0].seconds, 16);
  assert.equal(leaderboard(runs, "k", "all", now).length, 3);
  assert.throws(() => leaderboard(runs, "k", "decade", now));
});

test("families see their own kids by name and everyone else as a time", () => {
  const rows = leaderboard(
    [run("theo", 18, true, 1), run("maya", 17, true, 1)],
    "k",
    "all",
    now,
  );
  const family = boardFor({ kind: "guardian", kids: ["theo"] }, rows);
  assert.deepEqual(family[0], {
    rank: 1,
    seconds: 17,
    at: rows[0].at,
    mine: false,
  });
  assert.equal(family[1].name, "Theo Parker");
  assert.equal(family[1].mine, true);
  assert.equal(boardFor({ kind: "staff" }, rows)[0].name, "Maya Brooks");
});

test("courses list most-run first with member counts", () => {
  const list = courseList([
    run("theo", 1, true, 1),
    run("maya", 1, true, 1),
    run("theo", 2, true, 1, { courseKey: "w", course: "Wall" }),
  ]);
  assert.deepEqual(
    list.map((c) => [c.courseKey, c.runs, c.members]),
    [
      ["k", 2, 2],
      ["w", 1, 1],
    ],
  );
});
