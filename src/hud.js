// The timer overlay burned into a filmed run: who and which course at the
// top, the running clock and the obstacle at the bottom, a flash for each
// mark, and the result at the end. Drawn onto a canvas over each camera
// frame; the canvas is what gets recorded. Sizes scale with the frame.
import { alpha, color, data } from "./ds/tokens.js";
import { clock } from "./format.js";

const DISPLAY = `Argentum, "Work Sans", Arial, sans-serif`;
const BODY = `"Work Sans", Arial, sans-serif`;
const FLASH = 1.6; // seconds a mark stays on screen
const WORD = { pass: "Pass", fail: "Fail", skip: "Skip" };
const TONE = { pass: data.goal, fail: data.alert, skip: color.gray500 };

function panel(ctx, x, y, w, h, r, fill) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
}

// hud: { t, member, course, index, total, label, marks[], ended }
export function drawHud(ctx, w, h, hud) {
  const s = Math.min(w, h * (16 / 9)) / 1280;
  const pad = 28 * s;
  ctx.save();
  ctx.textBaseline = "alphabetic";

  // Who and which course, top left.
  if (hud.member || hud.course) {
    ctx.font = `700 ${22 * s}px ${BODY}`;
    const text = [hud.member, hud.course].filter(Boolean).join(" · ");
    const tw = ctx.measureText(text).width;
    panel(ctx, pad, pad, tw + 32 * s, 44 * s, 22 * s, alpha(color.ink, 0.62));
    ctx.fillStyle = color.white;
    ctx.fillText(text, pad + 16 * s, pad + 30 * s);
  }

  // The clock and the obstacle, bottom left.
  const big = 76 * s;
  ctx.font = `800 ${big}px ${DISPLAY}`;
  const time = clock(hud.t);
  const cw = Math.max(ctx.measureText(time).width, 180 * s);
  const lines = hud.total ? 1 : 0;
  const ph = big + 34 * s + lines * 34 * s;
  const py = h - pad - ph;
  panel(ctx, pad, py, cw + 48 * s, ph, 22 * s, alpha(color.ink, 0.7));
  ctx.fillStyle = hud.warn ? data.alert : color.white;
  ctx.fillText(time, pad + 24 * s, py + 16 * s + big * 0.86);
  if (hud.total) {
    ctx.font = `600 ${22 * s}px ${BODY}`;
    ctx.fillStyle = color.sky;
    const where = hud.ended
      ? `${hud.marks.filter((m) => m.result === "pass").length} of ${hud.total} passed`
      : `${Math.min(hud.index + 1, hud.total)} of ${hud.total} · ${hud.label ?? ""}`;
    ctx.fillText(where, pad + 24 * s, py + ph - 20 * s, cw);
  }

  // The latest mark, top right, for a moment after it's made.
  const last = hud.marks.at(-1);
  if (last && !hud.ended && hud.t - last.at < FLASH) {
    ctx.font = `800 ${28 * s}px ${BODY}`;
    const text = `${last.label} · ${WORD[last.result]} ${clock(last.at)}`;
    const tw = ctx.measureText(text).width;
    panel(
      ctx,
      w - pad - tw - 40 * s,
      pad,
      tw + 40 * s,
      56 * s,
      28 * s,
      TONE[last.result],
    );
    ctx.fillStyle = color.white;
    ctx.fillText(text, w - pad - tw - 20 * s, pad + 38 * s);
  }

  // The result, across the middle, once the run ends.
  if (hud.ended) {
    ctx.font = `800 ${56 * s}px ${DISPLAY}`;
    const text = hud.ended;
    const tw = ctx.measureText(text).width;
    const bw = tw + 80 * s;
    const bh = 104 * s;
    panel(
      ctx,
      (w - bw) / 2,
      (h - bh) / 2,
      bw,
      bh,
      28 * s,
      alpha(color.navy, 0.86),
    );
    ctx.fillStyle = color.white;
    ctx.fillText(text, (w - tw) / 2, h / 2 + 20 * s);
  }
  ctx.restore();
}

// Whether this browser can record a canvas (Chrome, Firefox, Safari 15+).
export const canBurn = () =>
  typeof HTMLCanvasElement !== "undefined" &&
  typeof HTMLCanvasElement.prototype.captureStream === "function" &&
  typeof CanvasRenderingContext2D !== "undefined" &&
  typeof CanvasRenderingContext2D.prototype.roundRect === "function";
