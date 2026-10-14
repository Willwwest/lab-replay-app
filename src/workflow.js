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

// A coach has watched the clip they set and confirmed it's usable. Moving
// the clip afterwards un-checks it: what's analyzed is what was checked.
export const isChecked = (take) =>
  !!take.checked &&
  take.checked.start === take.start &&
  take.checked.end === take.end;

// A take waiting for a kid. A model clip may have none: it shows how a
// skill should look, whoever did it.
export const needsKid = (take) => !take.memberId && !take.model;

// Where a take is, in one word, for lists: who it belongs to first, then
// whether it's been checked, analyzed and shared.
export function takeStatus(take, jobs = []) {
  const own = jobs.filter((j) => j.takeId === take.id);
  if (!take.memberId && take.model)
    return { id: "model", label: "Model", tone: "brand" };
  if (!take.memberId) return { id: "assign", label: "To assign", tone: "warn" };
  if (own.some((j) => ["queued", "running"].includes(j.status)))
    return { id: "analyzing", label: "Analyzing", tone: "info" };
  if (take.portfolioId) return { id: "shared", label: "Shared", tone: "good" };
  if (analysisFor(own, take.start, take.end))
    return { id: "analyzed", label: "Analyzed", tone: "good" };
  if (isChecked(take)) return { id: "checked", label: "Checked", tone: "info" };
  return { id: "check", label: "To check", tone: "outline" };
}

// Each step: id (also the section it lives in), label, done, and for the
// optional attempt step, whether a stale saved attempt blocks the portfolio.
export function steps(take, jobs, review) {
  const analysis = analysisFor(jobs, take.start, take.end);
  const pending = pendingFor(jobs, take.start, take.end);
  const coached =
    !["Not reviewed", "Not assessable"].includes(take.grade) &&
    !!take.cue?.trim();
  return [
    { id: "member", label: "Assign a kid", done: !!take.memberId },
    {
      id: "checked",
      label: "Check the recording",
      done: isChecked(take) || !!analysis,
    },
    {
      id: "analysis",
      label: "Analyze this clip",
      done: !!analysis,
      pending: pending?.status,
    },
    {
      id: "course",
      label: "Draw the course",
      done: (take.courseMap?.points?.length ?? 0) >= 2,
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
    title: "Assign a kid",
    lead: "Pick who this take belongs to. Their portfolio is where it ends up.",
    action: "Choose a kid",
  },
  checked: {
    title: "Check the recording",
    lead: "Trim it to the run and make sure it's usable before it goes for analysis.",
    action: "Check it",
  },
  course: {
    title: "Draw the course",
    lead: "Tap the gym layout in course order and name each obstacle.",
    action: "Open the course map",
  },
  analysis: {
    title: "Analyze the clip",
    lead: "Send the checked clip for analysis. Only that interval is processed.",
    action: "Send for analysis",
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
          : "It starts as soon as this device finishes the one before it.",
      action: "Open the analysis",
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
