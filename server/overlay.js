// The timer drawn onto a rendered portfolio clip with ffmpeg's drawtext:
// a running clock from the first timed obstacle to the last, the final
// time after that, and the obstacle being run. Times are seconds into the
// rendered clip. Coach-typed labels are reduced to safe characters, so
// nothing a user types reaches ffmpeg's filter syntax.
import { existsSync } from "node:fs";

const FONTS = [
  process.env.REPLAY_FONT,
  "C:/Windows/Fonts/arialbd.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
].filter(Boolean);

export const findFont = (exists = existsSync) => FONTS.find((f) => exists(f));

export const safeLabel = (s) =>
  String(s ?? "")
    .replace(/[^A-Za-z0-9 .&+\-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);

const n = (x) => Math.max(0, Math.round(x * 100) / 100);

// The run's timed span inside the clip, or null when nothing is timed.
export function runSpan(body) {
  const timed = (body.attempt?.obstacles ?? []).filter(
    (o) => o.start != null && o.end != null,
  );
  if (!timed.length) return null;
  const from = n(timed[0].start - body.start);
  const to = n(timed.at(-1).end - body.start);
  return to > from ? { from, to, timed } : null;
}

// drawtext filters to append after the map overlay, or [] for no timer.
export function timerFilters(body, font) {
  if (body.timer === false || !font) return [];
  const span = runSpan(body);
  if (!span) return [];
  const { from, to } = span;
  // Quotes protect the filter graph; colons in a path (C:/) need their own
  // escape for the option parser underneath.
  const path = font.replace(/\\/g, "/").replace(/:/g, "\\:");
  const box = `fontfile='${path}':fontcolor=white:box=1:boxcolor=black@0.62:boxborderw=18`;
  const total = (to - from).toFixed(1);
  const clockText = `%{eif\\:max(0,t-${from})\\:d}.%{eif\\:mod(floor(max(0,t-${from})*10),10)\\:d}`;
  const out = [
    `drawtext=${box}:fontsize=64:x=32:y=h-th-48:text='${clockText}':enable='between(t,${from},${to})'`,
    `drawtext=${box}:fontsize=64:x=32:y=h-th-48:text='${total}':enable='gte(t,${to})'`,
  ];
  const points = body.attempt.obstacles;
  points.forEach((o, i) => {
    if (o.start == null || o.end == null) return;
    const label = safeLabel(`${i + 1} of ${points.length} ${o.label}`);
    if (!label) return;
    out.push(
      `drawtext=${box}:fontsize=30:x=32:y=h-th-148:text='${label}':enable='between(t,${n(o.start - body.start)},${n(o.end - body.start)})'`,
    );
  });
  return out;
}
