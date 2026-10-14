// A live course run, timed as it happens: the coach marks each obstacle
// pass, fail or skip, and the run ends on the last obstacle, at the time
// cap, at the fail limit, or when the coach stops it. A quick run has no
// obstacles, only laps. Times are seconds since Go.
import { courseKey } from "./attempts.js";

export const FAIL_LIMITS = [0, 1, 2, 3];
export const CAP_WARNING = 10; // seconds before the cap

export const ENDINGS = {
  finished: "Finished",
  "time-cap": "Time cap",
  "fail-limit": "Fail limit",
  stopped: "Stopped",
};

export function createRun({ course, rules = {}, quick = false }) {
  if (!quick && !(course?.points?.length >= 1))
    throw Error("Choose a course with at least one obstacle.");
  const timeCap = Number(rules.timeCap) || 0;
  if (timeCap < 0) throw Error("The time cap can't be negative.");
  return {
    id: crypto.randomUUID(),
    quick,
    course: quick
      ? { name: course?.name?.trim() || "Quick run", points: [] }
      : {
          name: course.name,
          points: course.points.map((p) => ({
            label: p.label,
            skill: p.skill || "",
            x: p.x,
            y: p.y,
          })),
        },
    rules: { timeCap, failLimit: Number(rules.failLimit) || 0 },
    marks: [],
    ended: null,
  };
}

export const fails = (run) =>
  run.marks.filter((m) => m.result === "fail").length;

// The obstacle the athlete is on now (index into the course), or null.
export const current = (run) =>
  run.quick || run.ended || run.marks.length >= run.course.points.length
    ? null
    : run.marks.length;

function end(run, reason, at) {
  return { ...run, ended: { reason, at } };
}

// Marks the current obstacle (or a lap on a quick run).
export function mark(run, result, at) {
  if (run.ended) throw Error("This run has ended.");
  if (!run.quick && !["pass", "fail", "skip"].includes(result))
    throw Error("Unknown result.");
  const last = run.marks.at(-1)?.at ?? 0;
  const time = Math.max(at, last);
  const next = {
    ...run,
    marks: [...run.marks, { result: run.quick ? "pass" : result, at: time }],
  };
  if (!run.quick && next.marks.length === run.course.points.length)
    return end(next, "finished", time);
  if (run.rules.failLimit && fails(next) >= run.rules.failLimit)
    return end(next, "fail-limit", time);
  return next;
}

export function undo(run) {
  if (run.ended || !run.marks.length) return run;
  return { ...run, marks: run.marks.slice(0, -1) };
}

// Ends a quick run (its last lap runs to here) or stops a course run.
export function finish(run, at) {
  if (run.ended) return run;
  return end(run, run.quick ? "finished" : "stopped", at);
}

// Called on every clock tick; ends the run at the cap.
export function tick(run, at) {
  if (run.ended || !run.rules.timeCap || at < run.rules.timeCap) return run;
  return end(run, "time-cap", run.rules.timeCap);
}

export const capWarning = (run, at) =>
  !!run.rules.timeCap && !run.ended && at >= run.rules.timeCap - CAP_WARNING;

// One row per obstacle (or lap): the time at the split and how long it took.
export function splits(run) {
  const rows = run.marks.map((m, i) => {
    const from = i ? run.marks[i - 1].at : 0;
    const p = run.course.points[i];
    return {
      label: run.quick ? `Lap ${i + 1}` : p.label,
      skill: run.quick ? "" : p.skill,
      result: m.result,
      start: from,
      end: m.at,
      seconds: m.at - from,
    };
  });
  // A quick run's last lap runs from the last mark to the finish.
  if (run.quick && run.ended) {
    const from = run.marks.at(-1)?.at ?? 0;
    if (run.ended.at > from)
      rows.push({
        label: `Lap ${rows.length + 1}`,
        skill: "",
        result: "pass",
        start: from,
        end: run.ended.at,
        seconds: run.ended.at - from,
      });
  }
  return rows;
}

// A quick run compares with quick runs of the same name.
export const runKey = (run) =>
  run.quick
    ? `quick:${run.course.name.trim().toLowerCase()}`
    : courseKey(run.course);

// Seconds into the run at which a previous attempt reached each split, for
// pace against the personal best. Null where that attempt had no timing.
export function pace(best) {
  if (!best) return [];
  const zero = best.start ?? 0;
  return best.obstacles.map((o) => (o.end == null ? null : o.end - zero));
}

// The run as an attempt record, the same shape Review saves, so member
// progress and the portfolio treat timed runs and scored videos alike.
// `results` overrides marks (corrections on the finish screen). `clipEnd`
// is the recording's length when the run was filmed.
export function toAttempt(
  run,
  { memberId, member, takeId = null, results = [], clipEnd },
) {
  if (!run.ended) throw Error("Finish the run first.");
  if (!memberId && !member?.trim()) throw Error("Choose who ran.");
  const end = clipEnd ?? run.ended.at;
  const clamp = (t) => (t == null ? null : Math.min(t, end));
  const rows = splits(run);
  const obstacles = run.quick
    ? rows.map((r) => ({ ...r, start: clamp(r.start), end: clamp(r.end) }))
    : run.course.points.map((p, i) => {
        const r = rows[i];
        const result = results[i] ?? r?.result ?? "skip";
        if (!r)
          return {
            label: p.label,
            skill: p.skill,
            result,
            start: null,
            end: null,
            seconds: null,
          };
        const a = clamp(r.start);
        const b = clamp(r.end);
        return {
          label: p.label,
          skill: p.skill,
          result,
          start: b > a ? a : null,
          end: b > a ? b : null,
          seconds: b > a ? b - a : null,
        };
      });
  const now = new Date().toISOString();
  return {
    id: takeId ?? run.id,
    takeId,
    memberId: memberId || "",
    member: member || "",
    course: run.course.name,
    courseKey: runKey(run),
    createdAt: now,
    savedAt: now,
    start: 0,
    end,
    seconds: Math.min(run.ended.at, end),
    completed:
      run.ended.reason === "finished" &&
      obstacles.every((o) => o.result === "pass"),
    obstacles,
    source: "timer",
    ended: run.ended.reason,
    rules: run.rules,
  };
}
