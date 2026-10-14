// Where a take stands on the way to the member's portfolio: one check per
// step, the next thing to do, and whether the portfolio clip can be made.
// The service repeats the portfolio checks; these drive the screen.
import { courseKey } from "./attempts.js";

export const GRADES = [
  "Not reviewed",
  "Developing",
  "Consistent",
  "Ready for next challenge",
  "Not assessable",
];

export const DESTINATIONS = [
  { value: "browser", label: "This browser" },
  { value: "onsite", label: "Onsite worker" },
  { value: "remote", label: "Remote GPU" },
];

export const destinationLabel = (value) =>
  DESTINATIONS.find((d) => d.value === value)?.label ?? value;

// The newest finished analysis of exactly this clip.
export const analysisFor = (jobs, start, end) =>
  [...jobs]
    .reverse()
    .find(
      (j) => j.status === "completed" && j.start === start && j.end === end,
    );

const pendingFor = (jobs, start, end) =>
  jobs.find(
    (j) =>
      ["queued", "running"].includes(j.status) &&
      j.start === start &&
      j.end === end,
  );

export const attemptMatches = (take) =>
  !!take.attempt &&
  !!take.courseMap?.points?.length &&
  take.attempt.courseKey === courseKey(take.courseMap) &&
  take.attempt.start === take.start &&
  take.attempt.end === take.end &&
  take.attempt.memberId === take.memberId;

// Each step: id (also the section it lives in), label, done, and for the
// optional attempt step, whether a stale saved attempt blocks the portfolio.
export function steps(take, jobs, review) {
  const analysis = analysisFor(jobs, take.start, take.end);
  const pending = pendingFor(jobs, take.start, take.end);
  const coached =
    !["Not reviewed", "Not assessable"].includes(take.grade) &&
    !!take.cue?.trim();
  return [
    { id: "member", label: "Assign a member", done: !!take.memberId },
    {
      id: "course",
      label: "Draw the course",
      done: (take.courseMap?.points?.length ?? 0) >= 2,
    },
    {
      id: "analysis",
      label: "Analyze this clip",
      done: !!analysis,
      pending: pending?.status,
    },
    { id: "coaching", label: "Write the coaching", done: coached },
    {
      id: "attempt",
      label: take.attempt ? "Update the attempt" : "Score the attempt",
      done: attemptMatches(take),
      optional: !take.attempt,
    },
    {
      id: "portfolio",
      label: "Publish to the portfolio",
      done: review?.status === "published",
    },
  ];
}

// The portfolio clip needs every step before it except an unsaved attempt.
export function portfolioBlockers(take, jobs) {
  return steps(take, jobs, null)
    .filter((s) => s.id !== "portfolio" && !s.done && !s.optional)
    .map((s) => s.label);
}

const COPY = {
  member: {
    title: "Assign a member",
    lead: "Pick who this take belongs to. Their portfolio is where it ends up.",
    action: "Choose a member",
  },
  course: {
    title: "Draw the course",
    lead: "Tap the gym layout in course order and name each obstacle.",
    action: "Open the course map",
  },
  analysis: {
    title: "Analyze the clip",
    lead: "Set the clip, then request analysis. Only that interval is processed.",
    action: "Set the clip",
  },
  coaching: {
    title: "Write the coaching",
    lead: "Choose an assessment and one cue for the next attempt.",
    action: "Write the coaching",
  },
  attempt: {
    title: "Update the attempt",
    lead: "The saved attempt no longer matches this member, course or clip.",
    action: "Update the attempt",
  },
  portfolio: {
    title: "Prepare the portfolio clip",
    lead: "Render the clip with the course map, check it, then publish.",
    action: "Go to the portfolio",
  },
};

export function nextStep(take, jobs, review) {
  const all = steps(take, jobs, review);
  const required = all.filter((s) => !s.optional);
  const done = required.filter((s) => s.done).length;
  const step = required.find((s) => !s.done);
  if (!step)
    return {
      id: "portfolio",
      done,
      total: required.length,
      title: "Published",
      lead: "The member can watch this review in their LAB portfolio.",
      action: "View the portfolio",
      complete: true,
    };
  let copy = COPY[step.id];
  if (step.id === "analysis" && step.pending)
    copy = {
      title:
        step.pending === "running" ? "Analysis running" : "Analysis requested",
      lead:
        step.pending === "running"
          ? "Sampling the clip on this device. You can keep coaching meanwhile."
          : "The request is waiting in Requests. Start it when this device is ready.",
      action: "Open requests",
      target: "requests",
    };
  if (step.id === "portfolio" && review?.status === "rendering")
    copy = {
      title: "Rendering the clip",
      lead: "Clipping the video and adding the course map.",
      action: "Go to the portfolio",
    };
  if (step.id === "portfolio" && review?.status === "ready")
    copy = {
      title: "Check and publish",
      lead: "Watch the prepared clip, then publish it to the member's portfolio.",
      action: "Go to the portfolio",
    };
  return { id: step.id, done, total: required.length, ...copy };
}
