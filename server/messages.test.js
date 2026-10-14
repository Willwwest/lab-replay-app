import test from "node:test";
import assert from "node:assert/strict";
import { MAX_TEXT, threads, validateMessage } from "./messages.js";

const members = [
  { id: "theo", name: "Theo Parker" },
  { id: "maya", name: "Maya Brooks" },
];
const coach = { kind: "staff", id: "jordan", name: "Coach Jordan" };
const dana = {
  kind: "guardian",
  id: "parker",
  name: "Dana Parker",
  kids: ["theo"],
};
const run = {
  id: "r1",
  memberId: "theo",
  course: "Circuit",
  seconds: 12.4,
  completed: true,
  ended: "finished",
  createdAt: "2026-10-14T19:00:00Z",
  obstacles: [
    { label: "A", result: "pass" },
    { label: "B", result: "pass" },
  ],
};

test("coaches and the kid's own family can write to the kid's thread", () => {
  const m = validateMessage({ text: " Great run! " }, coach, members[0], []);
  assert.equal(m.text, "Great run!");
  assert.equal(m.author.name, "Coach Jordan");
  // The name comes from the account; a name the client sends is ignored.
  const reply = validateMessage(
    { text: "Thanks", from: "Coach Jordan" },
    dana,
    members[0],
    [],
  );
  assert.equal(reply.author.name, "Dana Parker");
  assert.throws(() => validateMessage({ text: "hi" }, dana, members[1], []));
  assert.throws(() => validateMessage({ text: "hi" }, coach, undefined, []));
});

test("messages need text or a run, within the length limit", () => {
  assert.throws(() => validateMessage({ text: "  " }, coach, members[0], []));
  assert.throws(() =>
    validateMessage({ text: "x".repeat(MAX_TEXT + 1) }, coach, members[0], []),
  );
});

test("an attached run must be that member's shared run", () => {
  const m = validateMessage({ runId: "r1" }, coach, members[0], [run]);
  assert.deepEqual(
    [m.run.course, m.run.seconds, m.run.passed, m.run.obstacles],
    ["Circuit", 12.4, 2, 2],
  );
  assert.throws(() =>
    validateMessage({ runId: "r1" }, coach, members[1], [run]),
  );
  assert.throws(() =>
    validateMessage({ runId: "nope" }, coach, members[0], [run]),
  );
});

test("threads show unread messages from others, newest activity first", () => {
  const at = (h) => `2026-10-14T${String(h).padStart(2, "0")}:00:00Z`;
  const msgs = [
    {
      memberId: "theo",
      author: { kind: "staff", id: "jordan" },
      createdAt: at(10),
    },
    {
      memberId: "theo",
      author: { kind: "guardian", id: "parker" },
      createdAt: at(11),
    },
    {
      memberId: "maya",
      author: { kind: "staff", id: "priya" },
      createdAt: at(12),
    },
  ];
  const coachView = threads(coach, members, msgs, { theo: at(10) });
  assert.deepEqual(
    coachView.map((t) => [t.memberId, t.unread, t.count]),
    [
      ["maya", 1, 1],
      ["theo", 1, 2],
    ],
  );
  const family = threads(dana, members, msgs, {});
  assert.deepEqual(
    family.map((t) => [t.memberId, t.unread]),
    [["theo", 1]],
  );
  // A family sees its kid's thread even before anyone writes.
  assert.equal(threads(dana, members, [], {}).length, 1);
  assert.equal(threads(coach, members, [], {}).length, 0);
});
