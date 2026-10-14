// Marks a coach draws on a key frame: arrows, lines, circles, angles, text
// and freehand. Points are stored as fractions of the image (0–1 across,
// 0–1 down) so a drawing fits the frame at any size; lengths and angles are
// measured in pixels, so a wide frame doesn't skew them. Rendering takes a
// 2D canvas context, the same for the editor and for the flattened still.
import { color, zone, alpha } from "./ds/tokens.js";

export const TOOLS = [
  "move",
  "arrow",
  "line",
  "circle",
  "angle",
  "text",
  "pen",
];
export const SHAPES = ["arrow", "line", "circle", "angle", "text", "pen"];

// Ink colors that read on gym footage, from the design tokens.
export const INKS = [
  { value: "cyan", label: "Cyan", hex: color.cyan },
  { value: "gold", label: "Gold", hex: zone.class },
  { value: "red", label: "Red", hex: zone.paused },
  { value: "green", label: "Green", hex: zone.open },
  { value: "white", label: "White", hex: color.white },
];
const inkHex = (ink) => (INKS.find((i) => i.value === ink) ?? INKS[0]).hex;

export const MAX_SHAPES = 60;
export const MAX_TEXT = 60;
const MAX_PEN = 400;

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const pt = (p) => ({ x: clamp01(p.x), y: clamp01(p.y) });
const px = (p, w, h) => ({ x: p.x * w, y: p.y * h });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// The angle at b between b→a and b→c, in whole degrees, measured on the
// image as shown (w × h), not in fractions.
export function angleDegrees(a, b, c, w = 1, h = 1) {
  const u = { x: (a.x - b.x) * w, y: (a.y - b.y) * h };
  const v = { x: (c.x - b.x) * w, y: (c.y - b.y) * h };
  const lu = Math.hypot(u.x, u.y);
  const lv = Math.hypot(v.x, v.y);
  if (!lu || !lv) return 0;
  const cos = Math.min(1, Math.max(-1, (u.x * v.x + u.y * v.y) / (lu * lv)));
  return Math.round((Math.acos(cos) * 180) / Math.PI);
}

// Distance from p to the segment a–b (all in pixels).
function toSegment(p, a, b) {
  const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  if (!l2) return dist(p, a);
  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2),
  );
  return dist(p, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
}

// Sizes in pixels, scaled to the image so a 640px still and a full-screen
// editor look the same.
export const metrics = (w) => ({
  line: Math.max(3, w / 170),
  font: Math.max(14, Math.round(w / 32)),
  handle: Math.max(9, w / 70),
});

// A new mark. With a drag (from a to b) it spans the drag; with a tap it
// gets a default size around the tap.
export function create(
  type,
  a,
  b,
  { ink = "cyan", text = "", w = 1, h = 1 } = {},
) {
  const id = crypto.randomUUID();
  const L = 0.14 * Math.min(w, h); // default length, pixels
  const off = (dx, dy) => pt({ x: a.x + (dx * L) / w, y: a.y + (dy * L) / h });
  const dragged = b && dist(px(a, w, h), px(b, w, h)) > 8;
  switch (type) {
    case "arrow":
    case "line":
      return { id, type, ink, a: pt(a), b: dragged ? pt(b) : off(1, -0.6) };
    case "circle":
      return { id, type, ink, a: pt(a), b: dragged ? pt(b) : off(0.5, 0) };
    case "angle":
      // Vertex at the tap, arms up-left and right.
      return { id, type, ink, a: off(-0.7, -0.8), b: pt(a), c: off(1, 0) };
    case "text":
      return { id, type, ink, a: pt(a), text: String(text).slice(0, MAX_TEXT) };
    case "pen":
      return { id, type, ink, points: [pt(a)] };
    default:
      throw Error(`Unknown mark: ${type}`);
  }
}

// Adds a point to a freehand stroke, skipping ones too close to the last.
export function extend(shape, p, w = 1, h = 1) {
  const last = shape.points[shape.points.length - 1];
  if (shape.points.length >= MAX_PEN || dist(px(last, w, h), px(p, w, h)) < 3)
    return shape;
  return { ...shape, points: [...shape.points, pt(p)] };
}

// The points a coach can drag on a mark.
export function handles(shape) {
  if (shape.type === "angle")
    return [
      ["a", shape.a],
      ["b", shape.b],
      ["c", shape.c],
    ];
  if (shape.type === "text") return [["a", shape.a]];
  if (shape.type === "pen") return [];
  return [
    ["a", shape.a],
    ["b", shape.b],
  ];
}

// Rough text box, in pixels, for hit testing without a canvas.
function textBox(shape, w, h) {
  const { font } = metrics(w);
  const p = px(shape.a, w, h);
  const width = Math.max(1, shape.text.length) * font * 0.6 + font;
  return { x: p.x, y: p.y - font, w: width, h: font * 2 };
}

// The mark (and handle, if any) under p, topmost first; null if none.
// `selected` gets its handles checked before anything else.
export function hit(shapes, p, w, h, selected = null) {
  const at = px(p, w, h);
  const tol = Math.max(14, metrics(w).handle * 1.6);
  const sel = shapes.find((s) => s.id === selected);
  if (sel)
    for (const [key, q] of handles(sel))
      if (dist(at, px(q, w, h)) <= tol) return { id: sel.id, handle: key };
  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i];
    let near = false;
    if (s.type === "arrow" || s.type === "line")
      near = toSegment(at, px(s.a, w, h), px(s.b, w, h)) <= tol;
    else if (s.type === "circle") {
      const r = dist(px(s.a, w, h), px(s.b, w, h));
      near = Math.abs(dist(at, px(s.a, w, h)) - r) <= tol;
    } else if (s.type === "angle")
      near =
        toSegment(at, px(s.b, w, h), px(s.a, w, h)) <= tol ||
        toSegment(at, px(s.b, w, h), px(s.c, w, h)) <= tol;
    else if (s.type === "text") {
      const b = textBox(s, w, h);
      near =
        at.x >= b.x - tol / 2 &&
        at.x <= b.x + b.w + tol / 2 &&
        at.y >= b.y - tol / 2 &&
        at.y <= b.y + b.h + tol / 2;
    } else if (s.type === "pen")
      near = s.points.some(
        (q, j) =>
          j > 0 && toSegment(at, px(s.points[j - 1], w, h), px(q, w, h)) <= tol,
      );
    if (near) return { id: s.id, handle: null };
  }
  return null;
}

// Moves a whole mark by (dx, dy) in fractions, keeping it on the image.
export function move(shape, dx, dy) {
  const all =
    shape.type === "pen" ? shape.points : handles(shape).map(([, q]) => q);
  const minX = Math.min(...all.map((q) => q.x));
  const maxX = Math.max(...all.map((q) => q.x));
  const minY = Math.min(...all.map((q) => q.y));
  const maxY = Math.max(...all.map((q) => q.y));
  const ddx = Math.min(Math.max(dx, -minX), 1 - maxX);
  const ddy = Math.min(Math.max(dy, -minY), 1 - maxY);
  const shift = (q) => ({ x: q.x + ddx, y: q.y + ddy });
  if (shape.type === "pen")
    return { ...shape, points: shape.points.map(shift) };
  const next = { ...shape };
  for (const [key, q] of handles(shape)) next[key] = shift(q);
  return next;
}

export const setHandle = (shape, key, p) => ({ ...shape, [key]: pt(p) });

// What a mark says, for the list beside the editor and screen readers.
export function describe(shape, w = 1, h = 1) {
  const ink = (INKS.find((i) => i.value === shape.ink) ?? INKS[0]).label;
  if (shape.type === "angle")
    return `${ink} angle, ${angleDegrees(shape.a, shape.b, shape.c, w, h)}°`;
  if (shape.type === "text") return `${ink} label “${shape.text}”`;
  return `${ink} ${{ arrow: "arrow", line: "line", circle: "circle", pen: "freehand" }[shape.type]}`;
}

// A stored drawing, checked: known marks only, points on the image, within
// the limits. Anything else is dropped rather than trusted.
export function clean(shapes) {
  if (!Array.isArray(shapes)) return [];
  const ok = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y);
  return shapes
    .filter((s) => s && SHAPES.includes(s.type) && typeof s.id === "string")
    .map((s) => {
      const ink = INKS.some((i) => i.value === s.ink) ? s.ink : "cyan";
      if (s.type === "pen")
        return {
          id: s.id,
          type: s.type,
          ink,
          points: (s.points ?? []).filter(ok).slice(0, MAX_PEN).map(pt),
        };
      const keys =
        s.type === "angle"
          ? ["a", "b", "c"]
          : s.type === "text"
            ? ["a"]
            : ["a", "b"];
      if (!keys.every((k) => ok(s[k]))) return null;
      const out = { id: s.id, type: s.type, ink };
      for (const k of keys) out[k] = pt(s[k]);
      if (s.type === "text") out.text = String(s.text ?? "").slice(0, MAX_TEXT);
      return out;
    })
    .filter((s) => s && (s.type !== "pen" || s.points.length > 1))
    .slice(0, MAX_SHAPES);
}

/* ---------- Drawing on a canvas ---------- */

// Every stroke is laid twice: a dark halo, then the ink, so it reads on a
// bright wall or a dark mat.
function stroke(ctx, path, ink, lw) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = alpha(color.ink, 0.55);
  ctx.lineWidth = lw + 3;
  path();
  ctx.stroke();
  ctx.strokeStyle = inkHex(ink);
  ctx.lineWidth = lw;
  path();
  ctx.stroke();
}

// A label in a dark pill: text marks and angle readings.
export function pill(ctx, text, x, y, w, ink = "white", anchor = "left") {
  const { font } = metrics(w);
  ctx.font = `700 ${font}px 'Work Sans', Arial, sans-serif`;
  ctx.textBaseline = "middle";
  const tw = ctx.measureText(text).width;
  const pad = font * 0.45;
  const bw = tw + pad * 2;
  const bh = font * 1.6;
  const left = anchor === "center" ? x - bw / 2 : x;
  ctx.fillStyle = alpha(color.ink, 0.78);
  ctx.beginPath();
  ctx.roundRect(left, y - bh / 2, bw, bh, bh / 2);
  ctx.fill();
  ctx.fillStyle = inkHex(ink);
  ctx.fillText(text, left + pad, y + 1);
}

function arrowHead(ctx, a, b, lw) {
  const size = lw * 4;
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  return () => {
    ctx.beginPath();
    ctx.moveTo(
      b.x - size * Math.cos(ang - 0.45),
      b.y - size * Math.sin(ang - 0.45),
    );
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(
      b.x - size * Math.cos(ang + 0.45),
      b.y - size * Math.sin(ang + 0.45),
    );
  };
}

function drawOne(ctx, s, w, h) {
  const { line } = metrics(w);
  if (s.type === "arrow" || s.type === "line") {
    const a = px(s.a, w, h);
    const b = px(s.b, w, h);
    stroke(
      ctx,
      () => {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      },
      s.ink,
      line,
    );
    if (s.type === "arrow")
      stroke(ctx, arrowHead(ctx, a, b, line), s.ink, line);
  } else if (s.type === "circle") {
    const c = px(s.a, w, h);
    const r = dist(c, px(s.b, w, h));
    stroke(
      ctx,
      () => {
        ctx.beginPath();
        ctx.arc(c.x, c.y, Math.max(r, 2), 0, Math.PI * 2);
      },
      s.ink,
      line,
    );
  } else if (s.type === "angle") {
    const a = px(s.a, w, h);
    const b = px(s.b, w, h);
    const c = px(s.c, w, h);
    stroke(
      ctx,
      () => {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(c.x, c.y);
      },
      s.ink,
      line,
    );
    const r = Math.min(dist(a, b), dist(c, b), metrics(w).font * 2.2) * 0.6;
    const t1 = Math.atan2(a.y - b.y, a.x - b.x);
    const t2 = Math.atan2(c.y - b.y, c.x - b.x);
    let d = t2 - t1;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    stroke(
      ctx,
      () => {
        ctx.beginPath();
        ctx.arc(b.x, b.y, Math.max(r, 4), t1, t1 + d, d < 0);
      },
      s.ink,
      Math.max(2, line * 0.6),
    );
    // The reading sits on the far side of the vertex from the arms' middle.
    const mid = t1 + d / 2;
    const out = metrics(w).font * 1.6;
    pill(
      ctx,
      `${angleDegrees(s.a, s.b, s.c, w, h)}°`,
      Math.min(Math.max(b.x - Math.cos(mid) * out, out), w - out),
      Math.min(Math.max(b.y - Math.sin(mid) * out, out / 2), h - out / 2),
      w,
      s.ink,
      "center",
    );
  } else if (s.type === "text") {
    const p = px(s.a, w, h);
    pill(ctx, s.text || " ", p.x, p.y, w, s.ink);
  } else if (s.type === "pen" && s.points.length > 1) {
    stroke(
      ctx,
      () => {
        ctx.beginPath();
        s.points.forEach((q, i) => {
          const p = px(q, w, h);
          i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
        });
      },
      s.ink,
      line,
    );
  }
}

// Draws every mark, and the selected one's handles, onto ctx at w × h.
export function render(ctx, shapes, w, h, { selected = null } = {}) {
  for (const s of shapes) drawOne(ctx, s, w, h);
  const sel = shapes.find((s) => s.id === selected);
  if (!sel) return;
  const { handle } = metrics(w);
  for (const [, q] of handles(sel)) {
    const p = px(q, w, h);
    ctx.beginPath();
    ctx.arc(p.x, p.y, handle, 0, Math.PI * 2);
    ctx.fillStyle = color.white;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = color.navy;
    ctx.stroke();
  }
}
