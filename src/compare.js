// Two takes side by side: which takes make sense to compare, where to line
// them up, where B should be when A is at a given moment, and how the
// obstacle times differ. Times are seconds in each take's own video.
import { courseKey } from "./attempts.js";

export const takeKey = (take) =>
  take.attempt?.courseKey ??
  (take.courseMap?.points?.length ? courseKey(take.courseMap) : "");

// Other takes, best matches first: same course and member, a model clip of
// the same course, same course, same member, then the rest; newest first
// within each group.
export function candidates(take, takes) {
  const key = takeKey(take);
  const rank = (t) =>
    (together(take, t) ? -2 : 0) +
    (key && takeKey(t) === key ? 0 : 2) +
    (take.memberId && t.memberId === take.memberId ? 0 : t.model ? 0.5 : 1);
  return takes
    .filter((t) => t.id !== take.id)
    .map((t) => ({ take: t, rank: rank(t) }))
    .sort(
      (x, y) =>
        x.rank - y.rank || y.take.createdAt.localeCompare(x.take.createdAt),
    )
    .map((x) => x.take);
}

// Two takes of the same recording from different cameras.
export const together = (a, b) =>
  !!a.sync?.group && a.sync.group === b.sync?.group && a.id !== b.id;

// The default partner: another camera's angle of the same recording, else
// the fastest clean run of the same course by the same member, else a
// model clip of the same course or with a tag in common, else the closest
// candidate.
export function partner(take, takes) {
  const list = candidates(take, takes);
  const angle = list.find((t) => together(take, t));
  if (angle) return angle;
  const key = takeKey(take);
  const clean = list.filter(
    (t) =>
      key &&
      takeKey(t) === key &&
      t.memberId === take.memberId &&
      t.attempt?.completed,
  );
  clean.sort((a, b) => a.attempt.seconds - b.attempt.seconds);
  const tags = new Set((take.tags ?? []).map((t) => t.toLowerCase()));
  const model =
    list.find((t) => t.model && key && takeKey(t) === key) ??
    list.find(
      (t) => t.model && (t.tags ?? []).some((x) => tags.has(x.toLowerCase())),
    );
  return clean[0] ?? model ?? list[0] ?? null;
}

// Moments both takes share: the same instant when they're two cameras'
// takes of one recording, the clip start, and each obstacle start that
// both attempts timed on the same course.
export function alignments(a, b) {
  const out = [{ value: "clip", label: "Clip start", a: a.start, b: b.start }];
  if (together(a, b)) {
    // The later first frame is the first moment both cameras saw.
    const t = Math.max(a.sync.start, b.sync.start);
    out.push({
      value: "sync",
      label: "Recorded together",
      a: (t - a.sync.start) / 1000,
      b: (t - b.sync.start) / 1000,
    });
  }
  const same =
    a.attempt && b.attempt && a.attempt.courseKey === b.attempt.courseKey;
  if (!same) return out;
  a.attempt.obstacles.forEach((o, i) => {
    const p = b.attempt.obstacles[i];
    if (o.start != null && p?.start != null)
      out.push({
        value: `o${i}`,
        label: `${i + 1}. ${o.label}`,
        a: o.start,
        b: p.start,
      });
  });
  return out;
}

// The best default: the same instant for two cameras, else the first
// obstacle both timed, else the clip start.
export const defaultAlignment = (list) =>
  list.find((x) => x.value === "sync") ?? list[1] ?? list[0];

// The shared timeline runs over A's video, measured from the anchor.
export const span = (durA, anchorA) => ({ from: -anchorA, to: durA - anchorA });

// Where B's video should be when the shared timeline is at t. Outside B's
// video, B holds its first or last frame.
export function bAt(t, anchorB, nudge, durB) {
  const raw = anchorB + nudge + t;
  return {
    time: Math.min(Math.max(raw, 0), durB),
    inside: raw >= 0 && raw <= durB,
  };
}

// Obstacle-by-obstacle times and differences, when both attempts ran the
// same course. Negative delta: A was faster.
export function splitDeltas(a, b) {
  if (!a?.attempt || !b?.attempt) return null;
  if (a.attempt.courseKey !== b.attempt.courseKey) return null;
  const rows = a.attempt.obstacles.map((o, i) => {
    const p = b.attempt.obstacles[i];
    const sa = o.seconds;
    const sb = p?.seconds ?? null;
    return {
      label: o.label,
      resultA: o.result,
      resultB: p?.result,
      a: sa,
      b: sb,
      delta: sa != null && sb != null ? sa - sb : null,
    };
  });
  const total =
    a.attempt.completed && b.attempt.completed
      ? a.attempt.seconds - b.attempt.seconds
      : null;
  return { rows, total, a: a.attempt, b: b.attempt };
}

export const takeLabel = (t) =>
  t.angle
    ? `${t.angle} · ${t.member || "Unassigned"}`
    : t.model
      ? `Model · ${t.model.title}${t.member ? ` (${t.member})` : ""}`
      : `${t.member || "Unassigned"} · ${t.courseMap?.name || t.course || t.name}`;

// Who or what a take is, for a caption under its picture.
export const whose = (t, fallback) =>
  t.model
    ? `Model: ${t.model.title}`
    : t.angle
      ? [t.member, t.angle].filter(Boolean).join(" · ")
      : t.member || fallback;
