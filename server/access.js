import { buildAttempt, courseKey } from "../src/attempts.js";
export function accountFor(roster, phone) {
  const staff = roster.staff.find((s) => s.phone === phone);
  if (staff) return { kind: "staff", id: staff.id, name: staff.name };
  const family = roster.families.find((f) =>
    f.guardians.some((g) => g.phone === phone),
  );
  if (!family) return null;
  // The guardian's own name, from the roster, for the messages they send.
  const guardian = family.guardians.find((g) => g.phone === phone);
  return {
    kind: "guardian",
    id: family.id,
    name: guardian.name ?? "Family",
    kids: family.kids,
  };
}
export function canRead(account, memberId) {
  return (
    account?.kind === "staff" || account?.kids?.includes(memberId) === true
  );
}
export function validateReview(body, members) {
  if (!members.some((m) => m.id === body.memberId))
    throw Error("Select a roster member.");
  if (
    !Number.isFinite(body.start) ||
    !Number.isFinite(body.end) ||
    body.start < 0 ||
    body.end <= body.start
  )
    throw Error("Invalid clip interval.");
  if (!body.course?.name?.trim() || body.course.points?.length < 2)
    throw Error("Attach a course with at least two points.");
  if (
    !Array.isArray(body.course.points) ||
    body.course.points.length > 100 ||
    body.course.points.some(
      (p) =>
        !Number.isFinite(p.x) ||
        !Number.isFinite(p.y) ||
        p.x < 0 ||
        p.x > 1 ||
        p.y < 0 ||
        p.y > 1 ||
        typeof p.label !== "string" ||
        p.label.length > 100,
    )
  )
    throw Error("Invalid course points.");
  if (
    body.analysis?.status !== "completed" ||
    body.analysis.start !== body.start ||
    body.analysis.end !== body.end
  )
    throw Error("Complete analysis for this exact clip first.");
  if (!body.grade || ["Not reviewed", "Not assessable"].includes(body.grade))
    throw Error(
      "Complete the coach assessment before preparing the portfolio.",
    );
  if (!body.cue?.trim()) throw Error("Add a next-attempt cue.");
  if (
    body.voiceoverAssetId != null &&
    (typeof body.voiceoverAssetId !== "string" || !body.voiceoverAssetId)
  )
    throw Error("Invalid voice-over.");
  // Only the service's own render says a review has a voice-over.
  delete body.voiceover;
  if (body.attempt) {
    const a = body.attempt;
    if (
      a.memberId !== body.memberId ||
      a.courseKey !== courseKey(body.course) ||
      a.start !== body.start ||
      a.end !== body.end
    )
      throw Error("Attempt must match the member, course and clip.");
    const checked = buildAttempt(
      {
        id: body.takeId,
        memberId: body.memberId,
        courseMap: body.course,
        duration: body.end,
      },
      a.obstacles,
      body.start,
      body.end,
    );
    body.attempt = {
      ...a,
      seconds: checked.seconds,
      completed: checked.completed,
      obstacles: checked.obstacles,
    };
  }
}
