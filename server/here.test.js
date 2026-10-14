import test from "node:test";
import assert from "node:assert/strict";
import { validateHere } from "./here.js";

const members = [{ id: "theo", name: "Theo Parker" }];

test("marking a kid here needs a day, a roster member and a yes or no", () => {
  assert.deepEqual(
    validateHere({ date: "2026-10-14", memberId: "theo", here: true }, members),
    { date: "2026-10-14", memberId: "theo", here: true },
  );
  for (const bad of [
    { date: "14/10/2026", memberId: "theo", here: true },
    { date: "2026-10-14", memberId: "nobody", here: true },
    { date: "2026-10-14", memberId: "theo", here: "yes" },
    null,
  ])
    assert.throws(() => validateHere(bad, members), JSON.stringify(bad));
});
