// Two takes side by side: which takes make sense to compare, where to line
// them up, where B should be when A is at a given moment, and how the
// obstacle times differ. Times are seconds in each take's own video.
import { courseKey } from "./attempts.js";

export const takeKey = (take) =>
  take.attempt?.courseKey ??
  (take.courseMap?.points?.length ? courseKey(take.courseMap) : "");

// Other takes, best matches first: same course and member, same course,
// same member, then the rest; newest first within each group.
export function candidates(take, takes) {
  const key = takeKey(take);
  const rank = (t) =>
    (key && takeKey(t) === key ? 0 : 2) +
    (take.memberId && t.memberId === take.memberId ? 0 : 1);
  return takes
    .filter((t) => t.id !== take.id)
    .map((t) => ({ take: t, rank: rank(t) }))
    .sort(
      (x, y) =>
        x.rank - y.rank || y.take.createdAt.localeCompare(x.take.createdAt),
    )
    .map((x) => x.take);
}

// The default partner: the fastest clean run of the same course by the
// same member, else the closest candidate.
export function partner(take, takes) {
  const list = candidates(take, takes);
  const key = takeKey(take);
  const clean = list.filter(
    (t) =>
      key &&
      takeKey(t) === key &&
      t.memberId === take.memberId &&
      t.attempt?.completed,
  );
  clean.sort((a, b) => a.attempt.seconds - b.attempt.seconds);
  return clean[0] ?? list[0] ?? null;
}

// Moments both takes share: the clip start, and each obstacle start that
// both attempts timed on the same course.
export function alignments(a, b) {
  const out = [{ value: "clip", label: "Clip start", a: a.start, b: b.start }];
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

// The best default: the first obstacle both timed, else the clip start.
export const defaultAlignment = (list) => list[1] ?? list[0];

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
  `${t.member || "Unassigned"} · ${t.courseMap?.name || t.course || t.name}`;
