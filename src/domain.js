export function validateClip(take, start, end) {
  if (!take?.blob?.size) throw new Error("Choose a recording first.");
  if (!take.member?.trim())
    throw new Error("Assign a kid before sending this for analysis.");
  if (
    ![start, end, take.duration].every(Number.isFinite) ||
    start < 0 ||
    end <= start ||
    end > take.duration + 0.05
  )
    throw new Error("Choose a valid start and end within this recording.");
}
export function requestJob(
  take,
  start,
  end,
  existing,
  destination = "browser",
) {
  validateClip(take, start, end);
  if (!["browser", "onsite", "remote"].includes(destination))
    throw new Error("Unknown processing destination.");
  if (
    existing.some(
      (j) =>
        j.takeId === take.id &&
        j.start === start &&
        j.end === end &&
        j.destination === destination &&
        ["queued", "running", "completed"].includes(j.status),
    )
  )
    throw new Error("This clip already has an analysis request.");
  return {
    id: crypto.randomUUID(),
    takeId: take.id,
    member: take.member,
    course: take.courseMap?.name || take.course || "Recording",
    start,
    end,
    destination,
    status: "queued",
    requestedAt: new Date().toISOString(),
    progress: 0,
    version: 1,
  };
}
export function transition(job, status) {
  const allowed = {
    queued: ["running", "cancelled"],
    running: ["completed", "failed", "cancelled"],
    completed: [],
    failed: [],
    cancelled: [],
  };
  if (!allowed[job.status]?.includes(status))
    throw new Error(`Cannot change ${job.status} to ${status}`);
  return { ...job, status };
}
export function recoverJob(job) {
  return job.status === "running"
    ? {
        ...job,
        status: "failed",
        error: "Processing was interrupted. Request this clip again to retry.",
      }
    : job;
}
export function summarize(samples, start, end) {
  const visible = samples.filter((s) => s.visible);
  return {
    duration: end - start,
    framesSampled: samples.length,
    trackedFrames: visible.length,
    coverage: samples.length
      ? Math.round((100 * visible.length) / samples.length)
      : 0,
    method:
      "MediaPipe Pose Landmarker; sampled at approximately 2 frames/second",
    assessment:
      "Movement grades require coach review. Tracking coverage is not a performance score.",
  };
}
