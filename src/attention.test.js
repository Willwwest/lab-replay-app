import test from "node:test";
import assert from "node:assert/strict";
import { allRuns, attention } from "./attention.js";

const now = Date.parse("2026-10-14T18:00:00Z");
const ago = (days) => new Date(now - days * 864e5).toISOString();
const members = [
  { id: "theo", name: "Theo Parker" },
  { id: "maya", name: "Maya Brooks" },
  { id: "ava", name: "Ava Chen" },
  { id: "eli", name: "Eli Ford" },
  { id: "new", name: "New Kid" },
];
const take = (memberId, days, extra = {}) => ({
  id: `${memberId}-${days}`,
  memberId,
  createdAt: ago(days),
  grade: "Not reviewed",
  cue: "",
  ...extra,
});
const run = (memberId, days, completed, key = "k1") => ({
  id: `r-${memberId}-${days}`,
  memberId,
  courseKey: key,
  course: "LAB circuit",
  completed,
  createdAt: ago(days),
});

test("one reason per kid, the most useful, kids in the gym first", () => {
  const takes = [
    take("theo", 2, { grade: "Developing", cue: "Eyes on the next ring" }),
    take("theo", 5),
    take("maya", 3),
    take("ava", 30),
    take("eli", 0.1, { grade: "Consistent", cue: "Faster feet" }),
    take("eli", 0),
  ];
  const runs = [
    run("maya", 3, false),
    run("maya", 4, false),
    run("ava", 30, true),
  ];
  const list = attention({ members, here: ["maya", "eli"], takes, runs, now });
  assert.deepEqual(
    list.map((x) => [x.memberId, x.kind]),
    [
      ["maya", "noClean"], // in the gym; also not filmed today
      ["theo", "retry"],
      ["ava", "quiet"],
    ],
  );
  assert.equal(list[0].text, "2 tries on LAB circuit, no clean run yet");
  assert.equal(list[0].also, 1);
  assert.equal(list[1].text, "Next: Eyes on the next ring");
  assert.equal(list[1].takeId, "theo-2");
  assert.equal(list[2].text, "Not filmed in 4 weeks");
  // Eli was coached today and filmed again since: nothing waiting.
  assert.ok(!list.some((x) => x.memberId === "eli"));
  // A kid with nothing recorded and not in the gym isn't flagged.
  assert.ok(!list.some((x) => x.memberId === "new"));
});

test("in the gym but not filmed today, until a take is recorded", () => {
  const here = ["new"];
  assert.equal(
    attention({ members, here, takes: [], now })[0].kind,
    "notFilmed",
  );
  assert.deepEqual(
    attention({ members, here, takes: [take("new", 0)], now }),
    [],
  );
});

test("a clean run on the course clears it", () => {
  const runs = [run("maya", 3, false), run("maya", 2, true)];
  assert.deepEqual(
    attention({ members, takes: [take("maya", 2)], runs, now }),
    [],
  );
});

test("runs from this device and the service count once", () => {
  const shared = [
    { id: "a", memberId: "theo" },
    { id: "b", memberId: "theo" },
  ];
  const takes = [{ attempt: { id: "a", memberId: "theo", local: true } }, {}];
  const all = allRuns(takes, shared);
  assert.equal(all.length, 2);
  assert.ok(all.find((r) => r.id === "a").local, "this device's copy wins");
});
