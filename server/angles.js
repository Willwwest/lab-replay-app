// Camera angles: one coach's phone (the host) films a run while other
// phones joined to its session film the same run from elsewhere. The host
// says when a recording starts and stops; each phone records its own clip
// and says when, in service time, its first frame was, so the clips line up
// afterwards whatever each phone's start delay. Clips wait on the service
// until the host's phone takes them.
export const MAX_CAMERAS = 4;
export const MAX_RECORDING = 10 * 60 * 1000; // ms
const CODE = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const code = (random = Math.random) =>
  Array.from(
    { length: 5 },
    () => CODE[Math.floor(random() * CODE.length)],
  ).join("");

export function createSession(account, now = Date.now(), makeCode = code) {
  return {
    id: crypto.randomUUID(),
    code: makeCode(),
    host: { id: account.id, name: account.name },
    status: "open",
    cameras: [],
    recording: null,
    clips: [],
    createdAt: new Date(now).toISOString(),
    updated: now,
  };
}

const open = (s) => {
  if (s.status !== "open") throw Error("This camera session has ended.");
};
const label = (v) =>
  String(v ?? "")
    .replace(/[^\p{L}\p{N} .'-]/gu, "")
    .trim()
    .slice(0, 30);

// Another phone joins as a camera; joining again under the same id is fine.
export function join(s, account, body = {}, now = Date.now()) {
  open(s);
  const id =
    typeof body.camera === "string" && body.camera ? body.camera : null;
  const known = id && s.cameras.find((c) => c.id === id);
  if (known) return { session: { ...s, updated: now }, camera: known };
  if (s.cameras.length >= MAX_CAMERAS)
    throw Error(`Up to ${MAX_CAMERAS} cameras can join one session.`);
  const camera = {
    id: crypto.randomUUID(),
    label: label(body.label) || `Camera ${s.cameras.length + 2}`,
    coach: account.name,
    joinedAt: new Date(now).toISOString(),
    seen: now,
  };
  return {
    session: { ...s, cameras: [...s.cameras, camera], updated: now },
    camera,
  };
}

export const leave = (s, camera, now = Date.now()) => ({
  ...s,
  cameras: s.cameras.filter((c) => c.id !== camera),
  updated: now,
});

export const seen = (s, camera, now = Date.now()) => ({
  ...s,
  cameras: s.cameras.map((c) => (c.id === camera ? { ...c, seen: now } : c)),
});

const isHost = (s, account) => s.host.id === account.id;

// The host starts a recording at `startedAt` (service ms). The kid, if
// any, goes with it so each camera's clip belongs to the same kid.
export function start(s, account, body = {}, now = Date.now()) {
  open(s);
  if (!isHost(s, account))
    throw Error("Only the host phone starts recordings.");
  const startedAt = Number.isFinite(body.startedAt) ? body.startedAt : now;
  if (Math.abs(startedAt - now) > 60000)
    throw Error("That start time is too far from the service's clock.");
  return {
    ...s,
    recording: {
      id: crypto.randomUUID(),
      startedAt,
      stoppedAt: null,
      discarded: false,
      memberId: typeof body.memberId === "string" ? body.memberId : "",
      member: typeof body.member === "string" ? body.member.slice(0, 80) : "",
    },
    updated: now,
  };
}

export function stop(s, account, body = {}, now = Date.now()) {
  if (!isHost(s, account)) throw Error("Only the host phone stops recordings.");
  const r = s.recording;
  if (!r || (body.recordingId && body.recordingId !== r.id)) return s;
  return {
    ...s,
    recording: { ...r, stoppedAt: r.stoppedAt ?? now },
    updated: now,
  };
}

// The host threw its take away: the cameras' clips of it go too.
export function discard(s, account, recordingId, now = Date.now()) {
  if (!isHost(s, account)) throw Error("Only the host phone can discard.");
  const r = s.recording;
  return {
    ...s,
    recording:
      r && r.id === recordingId
        ? { ...r, stoppedAt: r.stoppedAt ?? now, discarded: true }
        : r,
    clips: s.clips.filter((c) => c.recordingId !== recordingId),
    updated: now,
  };
}

export const close = (s, account, now = Date.now()) => {
  if (!isHost(s, account)) throw Error("Only the host phone ends the session.");
  return { ...s, status: "closed", updated: now };
};

// Whether the recording is running now: started, not stopped, within the
// longest allowed.
export const live = (s, now = Date.now()) =>
  !!s.recording &&
  !s.recording.stoppedAt &&
  !s.recording.discarded &&
  now - s.recording.startedAt < MAX_RECORDING;

// A camera's clip of a recording, checked before it's kept.
export function clipFor(s, query, size, now = Date.now()) {
  open(s);
  const camera = s.cameras.find((c) => c.id === query.camera);
  if (!camera) throw Error("Join the session before sending clips.");
  const r = s.recording;
  if (!r || r.id !== query.recording || r.discarded)
    throw Error("That recording isn't wanted any more.");
  if (s.clips.some((c) => c.recordingId === r.id && c.camera === camera.id))
    throw Error("This camera already sent its clip of that recording.");
  const startedAt = Number(query.startedAt);
  const duration = Number(query.duration);
  if (!Number.isFinite(startedAt) || Math.abs(startedAt - r.startedAt) > 30000)
    throw Error("The clip's start time doesn't match the recording.");
  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > MAX_RECORDING / 1000
  )
    throw Error("The clip's length is out of range.");
  if (!size) throw Error("The clip is empty.");
  return {
    id: crypto.randomUUID(),
    recordingId: r.id,
    camera: camera.id,
    label: camera.label,
    memberId: r.memberId,
    member: r.member,
    startedAt,
    duration,
    type: /^video\/(mp4|webm)/.test(query.type ?? "")
      ? query.type
      : "video/webm",
    size,
    at: new Date(now).toISOString(),
  };
}

export const addClip = (s, clip, now = Date.now()) => ({
  ...s,
  clips: [...s.clips, clip],
  updated: now,
});

export const dropClip = (s, id, now = Date.now()) => ({
  ...s,
  clips: s.clips.filter((c) => c.id !== id),
  updated: now,
});

// What a phone sees: the session, who's joined and seen lately, the
// recording and whether it's running, and the service's clock.
export function view(s, now = Date.now()) {
  return {
    id: s.id,
    code: s.code,
    host: s.host,
    status: s.status,
    now,
    cameras: s.cameras.map((c) => ({
      id: c.id,
      label: c.label,
      coach: c.coach,
      online: now - c.seen < 10000,
    })),
    recording: s.recording && { ...s.recording, live: live(s, now) },
    clips: s.clips,
  };
}
