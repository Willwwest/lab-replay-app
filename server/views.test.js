import test from "node:test";
import assert from "node:assert/strict";
import { viewSummary } from "./views.js";
import { familySeenAt } from "./messages.js";

test("views add up per clip, latest viewer first", () => {
  assert.deepEqual(viewSummary([]), {
    count: 0,
    first: null,
    last: null,
    names: [],
  });
  const s = viewSummary([
    {
      name: "Dana Parker",
      first: "2026-10-14T10:00:00Z",
      last: "2026-10-14T12:00:00Z",
      count: 2,
    },
    {
      name: "Jamie Parker",
      first: "2026-10-14T11:00:00Z",
      last: "2026-10-14T13:00:00Z",
      count: 1,
    },
  ]);
  assert.equal(s.count, 3);
  assert.equal(s.first, "2026-10-14T10:00:00Z");
  assert.equal(s.last, "2026-10-14T13:00:00Z");
  assert.deepEqual(s.names, ["Jamie Parker", "Dana Parker"]);
});

test("a thread is seen when the kid's own family last opened it", () => {
  const families = [
    { id: "parker", kids: ["theo"] },
    { id: "brooks", kids: ["maya"] },
  ];
  const rows = [
    { account: "guardian:parker", member: "theo", at: "2026-10-14T10:00:00Z" },
    { account: "staff:jordan", member: "theo", at: "2026-10-14T12:00:00Z" },
    { account: "guardian:brooks", member: "theo", at: "2026-10-14T13:00:00Z" },
    { account: "guardian:parker", member: "maya", at: "2026-10-14T14:00:00Z" },
  ];
  assert.equal(familySeenAt(rows, families, "theo"), "2026-10-14T10:00:00Z");
  assert.equal(familySeenAt(rows, families, "maya"), null);
  assert.equal(familySeenAt([], families, "theo"), null);
});
