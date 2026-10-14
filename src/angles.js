// Camera angles on the phones: the host phone's session (which other
// phones join), a joined phone's view of it, and bringing the other
// cameras' clips onto the host phone as takes linked to its own. Every
// phone maps its clock onto the service's from each poll, so "when the
// first frame was" means the same moment on every phone.
import { useEffect, useRef, useState } from "react";
import { api } from "./service.js";
import { thumbnail } from "./camera.js";
import { videoDuration } from "./hooks.js";

const HOST_POLL = 2000;
const CAMERA_POLL = 300;
// Clips arrive for a while after the host keeps its take.
export const IMPORT_WINDOW = 10 * 60 * 1000;

// Polls a session; `offset` is the service's clock minus this phone's.
function useSession(code, every, camera) {
  const [view, setView] = useState(null);
  const [error, setError] = useState("");
  const offset = useRef(0);
  const load = useRef(async () => {});
  useEffect(() => {
    setView(null);
    if (!code) return;
    let live = true;
    load.current = async () => {
      const sent = Date.now();
      try {
        const v = await api(
          `/angles/${encodeURIComponent(code)}${camera ? `?camera=${camera}` : ""}`,
        );
        if (!live) return;
        offset.current = v.now - (sent + Date.now()) / 2;
        setView(v);
        setError("");
        return v;
      } catch (e) {
        if (live) setError(e.message);
      }
    };
    load.current();
    const t = setInterval(() => load.current(), every);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [code, camera]);
  return {
    view,
    error,
    refresh: () => load.current(),
    serverNow: () => Date.now() + offset.current,
    setView,
  };
}

const post = (path, body = {}) =>
  api(path, { method: "POST", body: JSON.stringify(body) });

// The host phone: its session code is kept for this browser tab, so the
// camera can close and open again without the other phones rejoining.
const KEY = "replay-angles";
export function useAngleHost(shared) {
  const [code, setCode] = useState(() => {
    try {
      return sessionStorage.getItem(KEY) ?? "";
    } catch {
      return "";
    }
  });
  const session = useSession(shared ? code : "", HOST_POLL);
  const remember = (c) => {
    setCode(c);
    try {
      c ? sessionStorage.setItem(KEY, c) : sessionStorage.removeItem(KEY);
    } catch {}
  };
  // A session that ended elsewhere (or a restarted service) is let go.
  useEffect(() => {
    if (
      session.view?.status === "closed" ||
      /No camera session/.test(session.error)
    )
      remember("");
  }, [session.view?.status, session.error]);

  const path = (a) => `/angles/${encodeURIComponent(code)}/${a}`;
  return {
    shared,
    code: session.view?.status === "open" ? code : "",
    view: session.view,
    error: session.error,
    serverNow: session.serverNow,
    async open() {
      const v = await post("/angles");
      remember(v.code);
      session.setView(v);
    },
    async close() {
      await post(path("close")).catch(() => {});
      remember("");
    },
    // Starts a recording whose first frame is at `startedAt` (service ms).
    async start(kid, startedAt) {
      const v = await post(path("start"), {
        startedAt,
        memberId: kid?.id ?? kid?.memberId ?? "",
        member: kid?.name ?? kid?.member ?? "",
      });
      session.setView(v);
      return v.recording;
    },
    stop: (recordingId) => post(path("stop"), { recordingId }).catch(() => {}),
    discard: (recordingId) =>
      post(path("discard"), { recordingId }).catch(() => {}),
  };
}

// A phone joined to someone else's session as one more camera.
export function useAngleCamera(code, camera) {
  return useSession(code && camera ? code : "", CAMERA_POLL, camera);
}

export async function joinAngles(code, label, camera) {
  const v = await post(
    `/angles/${encodeURIComponent(code.trim().toUpperCase())}/join`,
    {
      label,
      camera,
    },
  );
  return { view: v, camera: v.camera };
}

export const leaveAngles = (code, camera) =>
  post(`/angles/${encodeURIComponent(code)}/leave`, { camera }).catch(() => {});

export function sendClip(
  code,
  { camera, recording, startedAt, duration, blob },
) {
  const q = new URLSearchParams({
    camera,
    recording,
    startedAt: String(Math.round(startedAt)),
    duration: duration.toFixed(2),
    type: blob.type,
  });
  return api(`/angles/${encodeURIComponent(code)}/clips?${q}`, {
    method: "POST",
    body: blob,
  });
}

// The other cameras' clips of a host take, as takes of the same kid and
// course that know which recording they belong to.
export function angleTake(host, clip, blob, duration, thumb) {
  return {
    id: clip.id,
    name: `${clip.label} · ${new Date(host.createdAt).toLocaleTimeString()}`,
    blob,
    member: host.member,
    memberId: host.memberId,
    course: host.courseMap?.name || host.course || "",
    duration,
    start: 0,
    end: duration,
    createdAt: new Date(Date.parse(host.createdAt) + 1).toISOString(),
    frames: [],
    notes: "",
    cue: "",
    grade: "Not reviewed",
    thumb,
    angleOf: host.id,
    angle: clip.label,
    sync: { group: host.sync.group, start: clip.startedAt },
  };
}

// Takes still waiting on other cameras' clips.
export const awaitingAngles = (takes, now = Date.now()) =>
  takes.filter(
    (t) =>
      t.sync?.code &&
      !t.angleOf &&
      now - Date.parse(t.createdAt) < IMPORT_WINDOW,
  );

// Brings new clips for the recent host takes onto this phone, then lets the
// service drop its copy. Returns how many came in.
export async function importAngles(takes, saveTake) {
  let n = 0;
  for (const host of awaitingAngles(takes)) {
    const clips = await api(
      `/angles/${encodeURIComponent(host.sync.code)}/clips?recording=${host.sync.group}`,
    ).catch(() => []);
    for (const clip of clips) {
      if (takes.some((t) => t.id === clip.id)) continue;
      const path = `/angles/${encodeURIComponent(host.sync.code)}/clips/${clip.id}`;
      const blob = await api(path, { video: true });
      const duration = await videoDuration(blob, clip.duration).catch(
        () => clip.duration,
      );
      await saveTake(
        angleTake(host, clip, blob, duration, await thumbnail(blob)),
      );
      await api(path, { method: "DELETE" }).catch(() => {});
      n++;
    }
  }
  return n;
}
