import test from "node:test";
import assert from "node:assert/strict";
import { findFont, runSpan, safeLabel, timerFilters } from "./overlay.js";

const body = {
  start: 0.5,
  end: 3.5,
  attempt: {
    obstacles: [
      { label: "Rings", start: 0.8, end: 1.9 },
      { label: "Wall", start: null, end: null },
      { label: "Bars", start: 2.2, end: 3.1 },
    ],
  },
};

test("labels lose anything ffmpeg could read as syntax", () => {
  assert.equal(
    safeLabel("Rings'; drawtext=evil:x=1,[out]"),
    "Rings drawtextevilx1out",
  );
  assert.equal(safeLabel("Track  wall - 2"), "Track wall - 2");
  assert.equal(safeLabel("x".repeat(80)).length, 40);
});

test("the timed span runs from the first timed obstacle to the last", () => {
  assert.deepEqual((({ from, to }) => ({ from, to }))(runSpan(body)), {
    from: 0.3,
    to: 2.6,
  });
  assert.equal(runSpan({ start: 0, attempt: { obstacles: [] } }), null);
  assert.equal(runSpan({ start: 0 }), null);
});

test("filters: a running clock, the final time, a label per timed obstacle", () => {
  const f = timerFilters(body, "C:\\Windows\\Fonts\\arialbd.ttf");
  assert.equal(f.length, 4);
  assert.ok(f[0].includes("fontfile='C\\:/Windows/Fonts/arialbd.ttf'"));
  assert.ok(f[0].includes("enable='between(t,0.3,2.6)'"));
  assert.ok(f[1].includes("text='2.3'") && f[1].includes("gte(t,2.6)"));
  assert.ok(f[2].includes("text='1 of 3 Rings'"));
  assert.ok(f[3].includes("text='3 of 3 Bars'"));
});

test("no timer when it's filmed in, untimed, or there's no font", () => {
  assert.deepEqual(timerFilters({ ...body, timer: false }, "f.ttf"), []);
  assert.deepEqual(timerFilters({ start: 0, attempt: null }, "f.ttf"), []);
  assert.deepEqual(timerFilters(body, undefined), []);
  assert.equal(
    findFont(() => false),
    undefined,
  );
});
