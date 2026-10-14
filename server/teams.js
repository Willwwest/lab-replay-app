// Team runs: athletes run the same course one after another while
// everyone watches. The session holds the course, the rules, the running
// order, whoever is on the course right now (and their marks), and the runs
// each athlete saved. Times are server milliseconds, so every screen's
// clock agrees however far apart the devices' own clocks are.
const RESULTS = ["pass", "fail", "skip"];
const text = (v, max) => typeof v === "string" && v.trim() && v.length <= max;

export function createTeam(body, members, account, now = Date.now()) {
  const course = body?.course;
  if (!text(course?.name, 100)) throw Error("Name the course.");
  if (!text(course.courseKey, 20000)) throw Error("Missing course key.");
  if (
    !Array.isArray(course.points) ||
    !course.points.length ||
    course.points.length > 100 ||
    course.points.some((p) => !text(p?.label, 100))
  )
    throw Error("The course needs its obstacles.");
  const ids = Array.isArray(body.athletes) ? body.athletes : [];
  if (ids.length < 2 || ids.length > 40)
    throw Error("Pick between 2 and 40 athletes.");
  if (new Set(ids).size !== ids.length) throw Error("Each athlete runs once.");
  const athletes = ids.map((id) => {
    const m = members.find((x) => x.id === id);
    if (!m) throw Error("Choose roster members.");
    return { memberId: m.id, name: m.name };
  });
  return {
    id: crypto.randomUUID(),
    code: Math.random().toString(36).slice(2, 8).toUpperCase(),
    course: {
      name: course.name.trim(),
      courseKey: course.courseKey,
      // Positions too, so any device rebuilds the same course key.
      points: course.points.map((p) => ({
        label: p.label.trim(),
        skill: typeof p.skill === "string" ? p.skill.slice(0, 100) : "",
        x: Number.isFinite(p.x) ? p.x : 0,
        y: Number.isFinite(p.y) ? p.y : 0,
      })),
    },
    rules: {
      timeCap: Number(body.rules?.timeCap) || 0,
      failLimit: Number(body.rules?.failLimit) || 0,
    },
    athletes,
    results: [],
    live: null,
    status: "open",
    coach: account.name,
    owner: account.id,
    createdAt: new Date(now).toISOString(),
    updated: now,
  };
}

// The runner's state from the timing device. `elapsed` is seconds since Go
// on that device; the server turns it into its own start time.
export function applyLive(team, body, now = Date.now()) {
  if (team.status !== "open") throw Error("This team run has ended.");
  if (body?.clear) return { ...team, live: null, updated: now };
  const athlete = team.athletes.find((a) => a.memberId === body?.memberId);
  if (!athlete) throw Error("That athlete isn't in this team run.");
  const phase = body.phase;
  if (!["ready", "countdown", "running", "done"].includes(phase))
    throw Error("Unknown phase.");
  const marks = Array.isArray(body.marks) ? body.marks : [];
  if (
    marks.length > team.course.points.length ||
    marks.some((m) => !RESULTS.includes(m?.result) || !Number.isFinite(m.at))
  )
    throw Error("Bad marks.");
  const elapsed = Number(body.elapsed) || 0;
  const keep = team.live?.memberId === athlete.memberId && phase !== "ready";
  return {
    ...team,
    live: {
      memberId: athlete.memberId,
      phase,
      startedAt:
        phase === "running" || phase === "done"
          ? keep && team.live.startedAt
            ? team.live.startedAt
            : now - elapsed * 1000
          : null,
      marks: marks.map((m) => ({ result: m.result, at: m.at })),
      ended:
        phase === "done" && body.ended
          ? { reason: String(body.ended.reason), at: Number(body.ended.at) }
          : null,
    },
    updated: now,
  };
}

export function addResult(team, { memberId, runId }, now = Date.now()) {
  if (team.status !== "open") throw Error("This team run has ended.");
  if (!team.athletes.some((a) => a.memberId === memberId))
    throw Error("That athlete isn't in this team run.");
  if (!text(runId, 80)) throw Error("Missing run.");
  if (team.results.some((r) => r.runId === runId)) return team;
  return {
    ...team,
    results: [...team.results, { memberId, runId }],
    live: team.live?.memberId === memberId ? null : team.live,
    updated: now,
  };
}

export const closeTeam = (team, now = Date.now()) => ({
  ...team,
  status: "closed",
  live: null,
  updated: now,
});

// Standings: each athlete's best clean time from their runs in this
// session, then those who ran without a clean finish, then who's waiting.
export function standings(team, runs) {
  const byId = new Map(runs.map((r) => [r.id, r]));
  const rows = team.athletes.map((a, order) => {
    const mine = team.results
      .filter((r) => r.memberId === a.memberId)
      .map((r) => byId.get(r.runId))
      .filter(Boolean);
    const clean = mine.filter((r) => r.completed);
    const best = clean.length ? Math.min(...clean.map((r) => r.seconds)) : null;
    const last = mine.at(-1);
    return {
      memberId: a.memberId,
      name: a.name,
      order,
      runs: mine.length,
      best,
      last: last
        ? {
            seconds: last.seconds,
            completed: last.completed,
            passed: last.obstacles.filter((o) => o.result === "pass").length,
            ended: last.ended,
          }
        : null,
      onCourse: team.live?.memberId === a.memberId,
      status:
        team.live?.memberId === a.memberId
          ? "on course"
          : best != null
            ? "clean"
            : mine.length
              ? "no clean run"
              : "waiting",
    };
  });
  const placed = rows
    .filter((r) => r.best != null)
    .sort((a, b) => a.best - b.best);
  let rank = 0;
  placed.forEach((r, i) => {
    if (i === 0 || r.best !== placed[i - 1].best) rank = i + 1;
    r.rank = rank;
  });
  return [
    ...placed,
    ...rows
      .filter((r) => r.best == null && r.runs)
      .sort((a, b) => a.order - b.order),
    ...rows
      .filter((r) => r.best == null && !r.runs)
      .sort((a, b) => a.order - b.order),
  ];
}

// The next athlete who hasn't run, in running order.
export const nextUp = (team) =>
  team.athletes.find(
    (a) => !team.results.some((r) => r.memberId === a.memberId),
  ) ?? null;

// What one account sees. Families see their own kids by name; other kids
// appear as a place and a time. Staff see it all.
export function teamView(account, team, runs, now = Date.now()) {
  const rows = standings(team, runs);
  const staff = account?.kind === "staff";
  const kids = new Set(account?.kids ?? []);
  if (!staff && !team.athletes.some((a) => kids.has(a.memberId)))
    throw Error("No access to this team run.");
  const named = (id) => staff || kids.has(id);
  const live = team.live && {
    ...team.live,
    name: named(team.live.memberId)
      ? team.athletes.find((a) => a.memberId === team.live.memberId).name
      : "LAB ninja",
    memberId: named(team.live.memberId) ? team.live.memberId : null,
  };
  return {
    id: team.id,
    code: team.code,
    course: team.course,
    rules: team.rules,
    status: team.status,
    coach: team.coach,
    createdAt: team.createdAt,
    now,
    live,
    next: staff ? nextUp(team) : null,
    athletes: staff ? team.athletes : undefined,
    results: staff ? team.results : undefined,
    standings: rows.map((r) =>
      named(r.memberId)
        ? { ...r, mine: !staff }
        : { ...r, memberId: null, name: "LAB ninja", mine: false },
    ),
  };
}
