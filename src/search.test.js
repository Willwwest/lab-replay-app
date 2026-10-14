import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_TAGS,
  cleanTags,
  hasTag,
  monthLabel,
  months,
  searchTakes,
  suggestTags,
  tagCounts,
} from "./search.js";

const takes = [
  {
    id: "a",
    member: "Theo Parker",
    createdAt: "2026-10-14T15:00:00Z",
    courseMap: {
      name: "LAB circuit",
      points: [{ label: "Rings", skill: "Swing transfer" }, { label: "Wall" }],
    },
    tags: ["Rings", "lache"],
    cue: "Eyes on the next ring",
    grade: "Developing",
  },
  {
    id: "b",
    member: "Maya Brooks",
    createdAt: "2026-09-02T15:00:00Z",
    course: "Warped wall",
    tags: ["wall", "Rings"],
    notes: "Fast feet on the wall.",
  },
  { id: "c", member: "Zoë Lin", createdAt: "2026-10-01T15:00:00Z" },
];
const ids = (list) => list.map((t) => t.id);

test("tags are trimmed, deduplicated ignoring case and limited", () => {
  assert.deepEqual(
    cleanTags(["  Rings ", "rings", "#lache", "", null, "a  b"]),
    ["Rings", "lache", "a b"],
  );
  assert.equal(cleanTags(["x".repeat(50)])[0].length, 30);
  assert.equal(
    cleanTags(Array.from({ length: 20 }, (_, i) => `t${i}`)).length,
    MAX_TAGS,
  );
  assert.deepEqual(cleanTags("Rings"), []);
  assert.ok(hasTag(takes[0], "RINGS"));
});

test("search matches every word across kid, course, obstacles, coaching and month", () => {
  assert.deepEqual(ids(searchTakes(takes, { query: "theo" })), ["a"]);
  assert.deepEqual(ids(searchTakes(takes, { query: "wall" })), ["a", "b"]);
  assert.deepEqual(ids(searchTakes(takes, { query: "wall maya" })), ["b"]);
  assert.deepEqual(ids(searchTakes(takes, { query: "swing" })), ["a"]);
  assert.deepEqual(ids(searchTakes(takes, { query: "next ring" })), ["a"]);
  assert.deepEqual(
    ids(searchTakes(takes, { query: "zoe" })),
    ["c"],
    "accents fold",
  );
  assert.deepEqual(ids(searchTakes(takes, { query: "september" })), ["b"]);
  assert.deepEqual(ids(searchTakes(takes, { query: "" })), ["a", "b", "c"]);
  assert.deepEqual(ids(searchTakes(takes, { query: "nobody" })), []);
});

test("#tag in the query, a picked tag and a month narrow the list", () => {
  assert.deepEqual(ids(searchTakes(takes, { query: "#lac" })), ["a"]);
  assert.deepEqual(ids(searchTakes(takes, { query: "#rings maya" })), ["b"]);
  assert.deepEqual(ids(searchTakes(takes, { tag: "rings" })), ["a", "b"]);
  assert.deepEqual(ids(searchTakes(takes, { month: "2026-10" })), ["a", "c"]);
  assert.deepEqual(
    ids(searchTakes(takes, { tag: "rings", month: "2026-09" })),
    ["b"],
  );
});

test("months and tags in use, for the filters", () => {
  assert.deepEqual(months(takes), ["2026-10", "2026-09"]);
  assert.match(monthLabel("2026-10"), /2026/);
  assert.deepEqual(tagCounts(takes), [
    { tag: "Rings", count: 2 },
    { tag: "lache", count: 1 },
    { tag: "wall", count: 1 },
  ]);
});

test("suggestions come from the course first, then tags in use, minus its own", () => {
  const take = {
    courseMap: {
      name: "LAB circuit",
      points: [{ label: "Rings", skill: "Lache" }],
    },
    attempt: { obstacles: [{ label: "Rings", result: "fail" }] },
    tags: ["lache"],
  };
  assert.deepEqual(suggestTags(take, takes), [
    "LAB circuit",
    "Rings",
    "Rings fail",
    "wall",
  ]);
});
