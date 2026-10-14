// Course runs shared through the service: checking a run a coach sends,
// and ranking members on a course. A run is an attempt record (a timed
// live run, or a scored video) for a roster member.
const RESULTS = ["pass", "fail", "skip"];
const PERIODS = { week: 7, month: 30, all: Infinity };
const text = (v, max) => typeof v === "string" && v.trim() && v.length <= max;

// Throws on anything malformed; returns the run as stored. Whether a run
// is clean is worked out here, not taken from the client.
export function validateRun(body, members) {
  const member = members.find((m) => m.id === body?.memberId);
  if (!member) throw Error("Choose a roster member.");
  if (!text(body.id, 80)) throw Error("Missing run ID.");
  if (!text(body.course, 100)) throw Error("Name the course.");
  if (!text(body.courseKey, 20000)) throw Error("Missing course key.");
  if (
    !Number.isFinite(body.seconds) ||
    body.seconds <= 0 ||
    body.seconds > 3600
  )
    throw Error("Run time must be between 0 and 3600 seconds.");
  if (
    !Array.isArray(body.obstacles) ||
    !body.obstacles.length ||
    body.obstacles.length > 100 ||
    body.obstacles.some(
      (o) =>
        !text(o?.label, 100) ||
        !RESULTS.includes(o.result) ||
        (o.seconds != null && !(Number.isFinite(o.seconds) && o.seconds >= 0)),
    )
  )
    throw Error("Each obstacle needs a label and a pass, fail or skip.");
  if (!Number.isFinite(Date.parse(body.createdAt)))
    throw Error("Missing run date.");
  const ended = body.ended ?? "finished";
  if (!["finished", "time-cap", "fail-limit", "stopped"].includes(ended))
    throw Error("Unknown run ending.");
  return {
    id: body.id,
    takeId: typeof body.takeId === "string" ? body.takeId : null,
    memberId: member.id,
    member: member.name,
    course: body.course.trim(),
    courseKey: body.courseKey,
    createdAt: new Date(body.createdAt).toISOString(),
    seconds: Math.round(body.seconds * 100) / 100,
    ended,
    source: body.source === "timer" ? "timer" : "review",
    rules: {
      timeCap: Number(body.rules?.timeCap) || 0,
      failLimit: Number(body.rules?.failLimit) || 0,
    },
    obstacles: body.obstacles.map((o) => ({
      label: o.label.trim(),
      skill: typeof o.skill === "string" ? o.skill.slice(0, 100) : "",
      result: o.result,
      seconds: o.seconds ?? null,
    })),
    completed:
      ended === "finished" && body.obstacles.every((o) => o.result === "pass"),
  };
}

// Courses that have runs, most-run first.
export function courseList(runs) {
  const map = new Map();
  for (const r of runs) {
    const c = map.get(r.courseKey) ?? {
      courseKey: r.courseKey,
      course: r.course,
      runs: 0,
      members: new Set(),
      last: r.createdAt,
    };
    c.runs++;
    c.members.add(r.memberId);
    if (r.createdAt > c.last) {
      c.last = r.createdAt;
      c.course = r.course;
    }
    map.set(r.courseKey, c);
  }
  return [...map.values()]
    .map((c) => ({ ...c, members: c.members.size }))
    .sort((a, b) => b.runs - a.runs || b.last.localeCompare(a.last));
}

// Each member's best clean run on a course within the period, fastest
// first. Ties share a rank. `now` is a Date.
export function leaderboard(runs, courseKey, period = "all", now = new Date()) {
  const days = PERIODS[period];
  if (days === undefined) throw Error("Choose week, month or all.");
  const since =
    days === Infinity ? "" : new Date(now - days * 864e5).toISOString();
  const best = new Map();
  const tries = new Map();
  for (const r of runs) {
    if (r.courseKey !== courseKey || r.createdAt < since) continue;
    tries.set(r.memberId, (tries.get(r.memberId) ?? 0) + 1);
    if (!r.completed) continue;
    const b = best.get(r.memberId);
    if (!b || r.seconds < b.seconds) best.set(r.memberId, r);
  }
  const rows = [...best.values()].sort(
    (a, b) => a.seconds - b.seconds || a.createdAt.localeCompare(b.createdAt),
  );
  let rank = 0;
  return rows.map((r, i) => {
    if (i === 0 || r.seconds !== rows[i - 1].seconds) rank = i + 1;
    return {
      rank,
      memberId: r.memberId,
      name: r.member,
      seconds: r.seconds,
      at: r.createdAt,
      runs: tries.get(r.memberId),
    };
  });
}

// What a family sees: their own kids by name, everyone else as a rank and
// a time. Staff see everything.
export function boardFor(account, rows) {
  if (account?.kind === "staff")
    return rows.map((r) => ({ ...r, mine: false }));
  const kids = new Set(account?.kids ?? []);
  return rows.map((r) =>
    kids.has(r.memberId)
      ? { ...r, mine: true }
      : { rank: r.rank, seconds: r.seconds, at: r.at, mine: false },
  );
}
