// Kids who need a coach's attention, for the Floor: a cue given and not
// tried since, tries on a course without a clean run, in the gym today but
// not filmed, or not filmed for a while. One reason per kid, the most
// useful first, and kids in the gym ahead of everyone else. It only
// points; it never messages anyone.
export const QUIET_DAYS = 14;
const DAY = 864e5;

export const REASONS = ["retry", "noClean", "notFilmed", "quiet"];

const sameDay = (iso, now) =>
  new Date(iso).toDateString() === new Date(now).toDateString();

const coached = (t) =>
  !!t.cue?.trim() && !["Not reviewed", "Not assessable"].includes(t.grade);

// Course runs from takes on this device and from the service, once each.
export function allRuns(takes, shared = []) {
  const byId = new Map();
  for (const r of shared) byId.set(r.id, r);
  for (const t of takes) if (t.attempt) byId.set(t.attempt.id, t.attempt);
  return [...byId.values()];
}

export function attention({
  members,
  here = [],
  takes,
  runs = [],
  now = Date.now(),
}) {
  const inGym = new Set(here);
  const out = [];
  for (const m of members) {
    const own = takes
      .filter((t) => t.memberId === m.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const tries = runs.filter((r) => r.memberId === m.id);
    const last = [own[0]?.createdAt, ...tries.map((r) => r.createdAt)]
      .filter(Boolean)
      .sort()
      .at(-1);
    const reasons = [];

    // The newest coached take with nothing filmed after it.
    const cued = own.find(coached);
    if (cued && own[0] === cued)
      reasons.push({
        kind: "retry",
        text: `Next: ${cued.cue.trim()}`,
        takeId: cued.id,
      });

    // A course tried twice or more without a clean run.
    const byCourse = new Map();
    for (const r of tries) {
      const c = byCourse.get(r.courseKey) ?? {
        course: r.course,
        n: 0,
        clean: false,
      };
      c.n++;
      c.clean ||= !!r.completed;
      byCourse.set(r.courseKey, c);
    }
    const stuck = [...byCourse.values()].filter((c) => c.n >= 2 && !c.clean);
    if (stuck.length)
      reasons.push({
        kind: "noClean",
        text: `${stuck[0].n} tries on ${stuck[0].course}, no clean run yet`,
      });

    if (inGym.has(m.id) && !own.some((t) => sameDay(t.createdAt, now)))
      reasons.push({ kind: "notFilmed", text: "Here today, not filmed yet" });

    if (last && now - Date.parse(last) > QUIET_DAYS * DAY) {
      const days = Math.floor((now - Date.parse(last)) / DAY);
      reasons.push({
        kind: "quiet",
        text: `Not filmed in ${days >= 21 ? `${Math.floor(days / 7)} weeks` : `${days} days`}`,
      });
    }

    if (reasons.length)
      out.push({
        memberId: m.id,
        name: m.name,
        here: inGym.has(m.id),
        ...reasons.sort(
          (a, b) => REASONS.indexOf(a.kind) - REASONS.indexOf(b.kind),
        )[0],
        also: reasons.length - 1,
      });
  }
  return out.sort(
    (a, b) =>
      Number(b.here) - Number(a.here) ||
      REASONS.indexOf(a.kind) - REASONS.indexOf(b.kind) ||
      a.name.localeCompare(b.name),
  );
}
