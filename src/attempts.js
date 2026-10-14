export const courseKey = (map) =>
  JSON.stringify(
    map.points.map((p) => [p.label.trim(), (p.skill || "").trim(), p.x, p.y]),
  );
export function buildAttempt(take, rows, start, end) {
  if (!take.memberId)
    throw Error("Assign a roster member before saving an attempt.");
  if (!take.courseMap?.points?.length)
    throw Error("Add course obstacles first.");
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end <= start ||
    end > take.duration + 0.05
  )
    throw Error("Choose a valid clip interval.");
  const obstacles = take.courseMap.points.map((p, i) => {
    const r = rows[i] || {};
    if (!["pass", "fail", "skip"].includes(r.result))
      throw Error(`Choose a result for obstacle ${i + 1}.`);
    const a = r.start === "" || r.start == null ? null : Number(r.start),
      b = r.end === "" || r.end == null ? null : Number(r.end);
    if (
      (a === null) !== (b === null) ||
      (a !== null &&
        (!Number.isFinite(a) ||
          !Number.isFinite(b) ||
          a < start ||
          b <= a ||
          b > end))
    )
      throw Error(
        `Obstacle ${i + 1}: set both times within the selected clip, with finish after start.`,
      );
    return {
      label: p.label,
      skill: p.skill || "",
      result: r.result,
      start: a,
      end: b,
      seconds: a === null ? null : b - a,
    };
  });
  const timed = obstacles.filter((o) => o.start !== null);
  if (timed.some((o, i) => i > 0 && o.start < timed[i - 1].end))
    throw Error(
      "Obstacle timings must follow course order without overlapping.",
    );
  return {
    id: take.id,
    takeId: take.id,
    memberId: take.memberId,
    member: take.member,
    course: take.courseMap.name,
    courseKey: courseKey(take.courseMap),
    createdAt: take.createdAt,
    savedAt: new Date().toISOString(),
    start,
    end,
    seconds: end - start,
    completed: obstacles.every((o) => o.result === "pass"),
    obstacles,
  };
}
export function progressFor(attempts, memberId, key) {
  const history = attempts
    .filter((a) => a.memberId === memberId && (!key || a.courseKey === key))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const completed = history.filter((a) => a.completed);
  return {
    history,
    completed: completed.length,
    best: completed.length
      ? Math.min(...completed.map((a) => a.seconds))
      : null,
  };
}
