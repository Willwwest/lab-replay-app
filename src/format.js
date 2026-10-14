import { color } from "./ds/tokens.js";

// 00:04.2 — minutes and tenths of a second, for video positions.
export const stamp = (t) => {
  const s = Math.max(0, t || 0);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${(s % 60)
    .toFixed(1)
    .padStart(4, "0")}`;
};

// A running clock: 12.4 under a minute, 1:02.4 after.
export const clock = (t) => {
  const s = Math.max(0, t || 0);
  if (s < 60) return s.toFixed(1);
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, "0")}`;
};

// 4.2s — a length of time.
export const seconds = (t) => `${(t || 0).toFixed(1)}s`;

export const day = (iso) =>
  new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

export const firstName = (name) => (name || "").trim().split(/\s+/)[0];

export const initials = (name) =>
  (name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

export const videoExtension = (blob) =>
  blob.type.includes("mp4") ? "mp4" : "webm";

const escape = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

// A self-contained HTML page with the coach's review and chosen stills.
export function reviewHtml(take, frames) {
  const figures = frames
    .map(
      (f) =>
        `<figure><img src="${f.image}" alt="Video frame at ${stamp(f.time)}"><figcaption>${stamp(f.time)} — ${escape(f.note)}</figcaption></figure>`,
    )
    .join("");
  return `<!doctype html><meta charset="utf-8"><title>LAB Replay review</title><style>body{font:18px system-ui;max-width:850px;margin:50px auto;padding:24px;color:${color.navy}}img{max-width:100%}p{white-space:pre-wrap}figure{margin:30px 0}small{color:${color.gray500}}</style><h1>${escape(take.member || "Member")} · ${escape(take.course || "Course")}</h1><small>${escape(take.createdAt)} · Coach review</small><h2>${escape(take.grade)}</h2><p>${escape(take.notes)}</p><h2>Next attempt</h2><p>${escape(take.cue)}</p>${figures}`;
}
