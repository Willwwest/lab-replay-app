import test from "node:test";
import assert from "node:assert/strict";
import { courseKey } from "./attempts.js";
import {
  analysisFor,
  attemptMatches,
  nextStep,
  portfolioBlockers,
  steps,
} from "./workflow.js";

const map = {
  name: "Circuit",
  points: [
    { label: "Rings", skill: "Swing", x: 0.2, y: 0.3 },
    { label: "Wall", skill: "", x: 0.6, y: 0.5 },
  ],
};
const base = {
  id: "t1",
  member: "Theo Parker",
  memberId: "theo",
  course: "Circuit",
  courseMap: map,
  start: 1,
  end: 3,
  duration: 4,
  grade: "Not reviewed",
  cue: "",
  frames: [],
};
const done = { takeId: "t1", status: "completed", start: 1, end: 3 };

test("a fresh take starts at the member step", () => {
  const step = nextStep({ ...base, memberId: "", courseMap: null }, [], null);
  assert.equal(step.id, "member");
  assert.equal(step.done, 0);
  assert.equal(step.total, 6);
});

test("analysis must cover exactly the selected clip", () => {
  const other = { ...done, end: 2.5 };
  assert.equal(analysisFor([other], 1, 3), undefined);
  assert.equal(analysisFor([other, done], 1, 3), done);
  assert.equal(nextStep(base, [other], null).id, "checked");
  const checked = { ...base, checked: { start: 1, end: 3 } };
  assert.equal(nextStep(checked, [other], null).id, "analysis");
});

test("a pending analysis shows as running or waiting", () => {
  const checked = { ...base, checked: { start: 1, end: 3 } };
  const step = nextStep(checked, [{ ...done, status: "queued" }], null);
  assert.equal(step.id, "analysis");
  assert.equal(step.title, "Analysis requested");
  assert.equal(
    nextStep(checked, [{ ...done, status: "running" }], null).title,
    "Analysis running",
  );
});

test("coaching needs an assessment and a cue", () => {
  assert.equal(nextStep(base, [done], null).id, "coaching");
  assert.equal(
    nextStep({ ...base, grade: "Consistent" }, [done], null).id,
    "coaching",
  );
  assert.equal(
    nextStep({ ...base, grade: "Not assessable", cue: "x" }, [done], null).id,
    "coaching",
  );
});

test("an unscored attempt is optional, a stale one blocks", () => {
  const coached = { ...base, grade: "Consistent", cue: "Settle first." };
  assert.deepEqual(portfolioBlockers(coached, [done]), []);
  const attempt = {
    courseKey: courseKey(map),
    start: 1,
    end: 3,
    memberId: "theo",
  };
  assert.ok(attemptMatches({ ...coached, attempt }));
  const stale = { ...coached, attempt: { ...attempt, end: 2 } };
  assert.equal(attemptMatches(stale), false);
  assert.deepEqual(portfolioBlockers(stale, [done]), ["Update the attempt"]);
  assert.equal(nextStep(stale, [done], null).id, "attempt");
});

test("ready takes move through rendering to published", () => {
  const ready = { ...base, grade: "Consistent", cue: "Settle first." };
  assert.equal(nextStep(ready, [done], null).id, "portfolio");
  assert.equal(
    nextStep(ready, [done], { status: "rendering" }).title,
    "Rendering the clip",
  );
  assert.equal(
    nextStep(ready, [done], { status: "ready" }).title,
    "Check and publish",
  );
  const published = nextStep(ready, [done], { status: "published" });
  assert.ok(published.complete);
  assert.equal(published.done, published.total);
  assert.ok(
    steps(ready, [done], { status: "published" }).every(
      (s) => s.done || s.optional,
    ),
  );
});

test("a moved clip needs checking again; status reads in one word", async () => {
  const { isChecked, takeStatus } = await import("./workflow.js");
  const checked = { ...base, checked: { start: 1, end: 3 } };
  assert.ok(isChecked(checked));
  assert.equal(isChecked({ ...checked, end: 3.5 }), false);
  assert.equal(takeStatus({ ...base, memberId: "" }).id, "assign");
  assert.equal(takeStatus(base).id, "check");
  assert.equal(takeStatus(checked).id, "checked");
  assert.equal(
    takeStatus(checked, [{ ...done, takeId: "t1", status: "running" }]).id,
    "analyzing",
  );
  assert.equal(takeStatus(base, [done]).id, "analyzed");
  assert.equal(takeStatus({ ...base, portfolioId: "p" }, [done]).id, "shared");
});
