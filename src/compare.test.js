import test from "node:test";
import assert from "node:assert/strict";
import { courseKey } from "./attempts.js";
import {
  alignments,
  bAt,
  candidates,
  defaultAlignment,
  partner,
  span,
  splitDeltas,
  takeLabel,
  whose,
} from "./compare.js";

const map = {
  name: "Circuit",
  points: [
    { label: "Rings", skill: "", x: 0.1, y: 0.1 },
    { label: "Wall", skill: "", x: 0.5, y: 0.5 },
  ],
};
const key = courseKey(map);
const attempt = (starts, ends, completed = true) => ({
  courseKey: key,
  completed,
  seconds: ends.at(-1) - starts[0],
  obstacles: starts.map((s, i) => ({
    label: map.points[i].label,
    result: "pass",
    start: s,
    end: ends[i],
    seconds: s == null ? null : ends[i] - s,
  })),
});
const take = (id, extra) => ({
  id,
  memberId: "theo",
  member: "Theo",
  createdAt: `2026-10-0${id.length}T10:00:00Z`,
  start: 0,
  end: 10,
  courseMap: map,
  ...extra,
});

const a = take("a", { attempt: attempt([2, 5], [5, 9]) });
const b = take("bb", { attempt: attempt([1, 3], [3, 6]) });
const slow = take("ccc", { attempt: attempt([1, 4], [4, 9]) });
const other = take("dddd", {
  memberId: "maya",
  courseMap: null,
  attempt: undefined,
});
const fail = take("eeeee", { attempt: attempt([1, 2], [2, 3], false) });

test("candidates rank same course and member first", () => {
  const list = candidates(a, [other, b, a, slow]);
  assert.deepEqual(
    list.map((t) => t.id),
    ["ccc", "bb", "dddd"],
  );
});

test("the default partner is the fastest clean run of the same course", () => {
  assert.equal(partner(a, [other, slow, b, fail]).id, "bb");
  assert.equal(partner(other, [other]), null);
});

test("alignments offer the clip and each obstacle both timed", () => {
  const list = alignments(a, b);
  assert.deepEqual(
    list.map((x) => [x.value, x.a, x.b]),
    [
      ["clip", 0, 0],
      ["o0", 2, 1],
      ["o1", 5, 3],
    ],
  );
  assert.equal(defaultAlignment(list).value, "o0");
  assert.deepEqual(
    alignments(a, other).map((x) => x.value),
    ["clip"],
  );
});

test("B follows A from the anchor and holds at its ends", () => {
  assert.deepEqual(span(10, 2), { from: -2, to: 8 });
  assert.deepEqual(bAt(1.5, 1, 0, 6), { time: 2.5, inside: true });
  assert.deepEqual(bAt(-3, 1, 0, 6), { time: 0, inside: false });
  assert.deepEqual(bAt(7, 1, 0, 6), { time: 6, inside: false });
  assert.deepEqual(bAt(1, 1, 0.5, 6), { time: 2.5, inside: true });
});

test("split deltas compare obstacle times and totals", () => {
  const d = splitDeltas(a, b);
  assert.deepEqual(
    d.rows.map((r) => r.delta),
    [1, 1],
  );
  assert.equal(d.total, 2);
  assert.equal(splitDeltas(a, other), null);
  assert.equal(splitDeltas(a, fail).total, null);
});

test("a model clip of the same course is the partner when there's no clean run of the kid's own", () => {
  const mine = take("m1", { attempt: undefined, tags: ["Lache"] });
  const model = take("m22", {
    memberId: "coach",
    member: "",
    attempt: undefined,
    model: { title: "Clean rings", note: "" },
  });
  const maya = take("m333", { memberId: "maya", attempt: undefined });
  assert.equal(partner(mine, [maya, model]).id, "m22");
  // Ranked after the kid's own runs of the course, before other kids'.
  assert.deepEqual(
    candidates(mine, [maya, model, b]).map((t) => t.id),
    ["bb", "m22", "m333"],
  );
  // On another course, a shared tag still finds it.
  const elsewhere = { ...model, courseMap: null, tags: ["lache"] };
  const off = take("m4444", {
    courseMap: null,
    attempt: undefined,
    tags: ["Lache"],
  });
  assert.equal(partner(off, [other, elsewhere]).id, "m22");
  assert.equal(takeLabel(model), "Model · Clean rings");
  assert.equal(whose(model, "x"), "Model: Clean rings");
  assert.equal(whose(maya, "x"), "Theo");
});

test("two cameras' takes of one recording line up at the same instant", () => {
  const host = take("h", { sync: { group: "r1", start: 1_000_000 } });
  const side = take("s", {
    sync: { group: "r1", start: 1_000_350 },
    angle: "Wall side",
    angleOf: "h",
  });
  const elsewhere = take("x", { sync: { group: "r2", start: 1_000_000 } });
  assert.equal(
    partner(host, [b, slow, elsewhere, side]).id,
    "s",
    "the angle first",
  );
  const list = alignments(host, side);
  const sync = list.find((x) => x.value === "sync");
  // The side camera started 0.35s later: host 0.35s in matches side's 0s.
  assert.ok(Math.abs(sync.a - 0.35) < 1e-9 && sync.b === 0);
  assert.equal(defaultAlignment(list).value, "sync");
  const back = alignments(side, host).find((x) => x.value === "sync");
  assert.ok(back.a === 0 && Math.abs(back.b - 0.35) < 1e-9);
  assert.ok(!alignments(host, elsewhere).some((x) => x.value === "sync"));
  assert.equal(takeLabel(side), "Wall side · Theo");
});
