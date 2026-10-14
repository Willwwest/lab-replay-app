import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_SHAPES,
  angleDegrees,
  clean,
  create,
  describe,
  extend,
  hit,
  move,
  render,
  setHandle,
} from "./drawing.js";

const W = 1280;
const H = 720;

test("angles are read in pixels, so a wide frame doesn't skew them", () => {
  // A right angle on a square image.
  assert.equal(
    angleDegrees({ x: 0, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0 }),
    90,
  );
  // 45° up-right in fractions is flatter on a 16:9 frame.
  const a = { x: 0.4, y: 0.5 };
  const b = { x: 0.5, y: 0.5 };
  const c = { x: 0.6, y: 0.4 };
  assert.equal(angleDegrees(a, b, c), 135);
  const wide = angleDegrees(a, b, c, W, H);
  assert.equal(
    wide,
    Math.round(180 - (Math.atan2(0.1 * H, 0.1 * W) * 180) / Math.PI),
  );
  assert.notEqual(wide, 135);
  // Arms of zero length read 0, not NaN.
  assert.equal(angleDegrees(b, b, c, W, H), 0);
});

test("a tap makes a default-size mark; a drag spans the drag", () => {
  const at = { x: 0.5, y: 0.5 };
  const tap = create("arrow", at, at, { w: W, h: H });
  assert.ok(tap.b.x > at.x, "a tapped arrow points somewhere");
  const drag = create("arrow", at, { x: 0.8, y: 0.2 }, { w: W, h: H });
  assert.deepEqual(drag.b, { x: 0.8, y: 0.2 });
  const angle = create("angle", at, null, { w: W, h: H });
  assert.deepEqual(angle.b, at, "the vertex is where you tapped");
  const deg = angleDegrees(angle.a, angle.b, angle.c, W, H);
  assert.ok(deg > 20 && deg < 160, `a usable default angle (${deg}°)`);
  // Marks never leave the image.
  const edge = create("line", { x: 0.99, y: 0.01 }, null, { w: W, h: H });
  assert.ok(edge.b.x <= 1 && edge.b.y >= 0);
  assert.throws(() => create("star", at));
});

test("text is cut to its limit; freehand skips points too close together", () => {
  const t = create("text", { x: 0.2, y: 0.2 }, null, { text: "x".repeat(99) });
  assert.equal(t.text.length, 60);
  let pen = create("pen", { x: 0.1, y: 0.1 });
  pen = extend(pen, { x: 0.1005, y: 0.1 }, W, H);
  assert.equal(pen.points.length, 1, "under three pixels is the same point");
  pen = extend(pen, { x: 0.2, y: 0.1 }, W, H);
  assert.equal(pen.points.length, 2);
});

test("hit finds the topmost mark near the pointer, handles first", () => {
  const line = {
    id: "l",
    type: "line",
    ink: "cyan",
    a: { x: 0.1, y: 0.5 },
    b: { x: 0.9, y: 0.5 },
  };
  const ring = {
    id: "r",
    type: "circle",
    ink: "gold",
    a: { x: 0.5, y: 0.5 },
    b: { x: 0.6, y: 0.5 },
  };
  const shapes = [line, ring];
  assert.deepEqual(hit(shapes, { x: 0.3, y: 0.505 }, W, H), {
    id: "l",
    handle: null,
  });
  assert.equal(hit(shapes, { x: 0.3, y: 0.8 }, W, H), null);
  // On the ring, which is drawn over the line.
  assert.equal(hit(shapes, { x: 0.6, y: 0.5 }, W, H).id, "r");
  // Inside the ring but away from its edge is not the ring.
  assert.equal(hit([ring], { x: 0.5, y: 0.45 }, W, H), null);
  // The selected mark's handle wins over the mark on top.
  assert.deepEqual(hit(shapes, { x: 0.9, y: 0.5 }, W, H, "l"), {
    id: "l",
    handle: "b",
  });
  const label = {
    id: "t",
    type: "text",
    ink: "white",
    a: { x: 0.2, y: 0.2 },
    text: "Hips up",
  };
  assert.equal(hit([label], { x: 0.23, y: 0.2 }, W, H).id, "t");
});

test("moving a mark keeps all of it on the image", () => {
  const line = {
    id: "l",
    type: "line",
    ink: "cyan",
    a: { x: 0.7, y: 0.5 },
    b: { x: 0.9, y: 0.6 },
  };
  const moved = move(line, 0.5, 0);
  assert.equal(moved.b.x, 1);
  assert.ok(Math.abs(moved.a.x - 0.8) < 1e-9, "both ends move together");
  const pen = {
    id: "p",
    type: "pen",
    ink: "red",
    points: [
      { x: 0.1, y: 0.1 },
      { x: 0.2, y: 0.3 },
    ],
  };
  assert.equal(move(pen, -1, 0).points[0].x, 0);
  assert.deepEqual(setHandle(line, "a", { x: -2, y: 0.4 }).a, { x: 0, y: 0.4 });
});

test("stored drawings are checked before they're drawn", () => {
  const ok = {
    id: "a",
    type: "arrow",
    ink: "cyan",
    a: { x: 0.1, y: 0.1 },
    b: { x: 2, y: 0.5 },
  };
  const shapes = clean([
    ok,
    { id: "b", type: "script", a: { x: 0, y: 0 } },
    { id: "c", type: "line", ink: "cyan", a: { x: 0.1, y: 0.1 } },
    { id: "d", type: "text", ink: "pink", a: { x: 0.5, y: 0.5 }, text: 5 },
    { id: "e", type: "pen", ink: "cyan", points: [{ x: 0.1, y: 0.1 }] },
    null,
  ]);
  assert.deepEqual(
    shapes.map((s) => s.id),
    ["a", "d"],
  );
  assert.equal(shapes[0].b.x, 1, "points are kept on the image");
  assert.equal(shapes[1].ink, "cyan", "an unknown ink falls back");
  assert.equal(shapes[1].text, "5");
  assert.deepEqual(clean("nope"), []);
  const many = Array.from({ length: 80 }, (_, i) => ({ ...ok, id: String(i) }));
  assert.equal(clean(many).length, MAX_SHAPES);
});

test("every mark renders, and says what it is", () => {
  const calls = [];
  const ctx = new Proxy(
    { measureText: (t) => ({ width: t.length * 10 }) },
    {
      get: (o, k) => (k in o ? o[k] : (...args) => calls.push([k, args])),
      set: () => true,
    },
  );
  const at = { x: 0.5, y: 0.5 };
  const shapes = ["arrow", "line", "circle", "angle", "pen"].map((type) =>
    create(type, at, { x: 0.7, y: 0.3 }, { w: W, h: H }),
  );
  shapes[4] = extend(shapes[4], { x: 0.6, y: 0.6 }, W, H);
  shapes.push(create("text", at, null, { text: "Hips up", ink: "gold" }));
  render(ctx, shapes, W, H, { selected: shapes[3].id });
  assert.ok(calls.some(([k]) => k === "stroke"));
  assert.ok(
    calls.some(([k, a]) => k === "fillText" && /°$/.test(a[0])),
    "the angle prints its reading",
  );
  assert.equal(
    calls.filter(([k]) => k === "arc").length,
    // circle and angle arc (halo and ink each), three angle handles
    7,
  );
  assert.match(describe(shapes[3], W, H), /^Cyan angle, \d+°$/);
  assert.equal(describe(shapes[5]), "Gold label “Hips up”");
});
