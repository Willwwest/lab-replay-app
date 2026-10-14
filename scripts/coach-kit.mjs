// Shared steps for Replay's browser checks: Chrome with a fake camera,
// a fresh device, signing in as a coach, recording from the Floor, and
// seeding takes or courses straight into this device's storage.
import { chromium } from "@playwright/test";

export const REPLAY = process.env.BASE ?? "http://127.0.0.1:5180/";
export const SERVICE = "http://127.0.0.1:5182/replay-api";
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export const assert = (ok, msg) => {
  if (!ok) throw Error(msg);
};

// The review kit launches Chrome itself; give that launch a fake camera.
export function fakeCamera() {
  const plain = chromium.launch.bind(chromium);
  chromium.launch = (options = {}) =>
    plain({
      ...options,
      args: [
        ...(options.args ?? []),
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
      ],
    });
}

// A fresh device: nothing stored, then the coach gate.
export async function fresh(page, url = REPLAY) {
  await page.goto(url);
  await page.evaluate(async () => {
    localStorage.clear();
    sessionStorage.clear();
    await new Promise((r) => {
      const q = indexedDB.deleteDatabase("lab-replay");
      q.onsuccess = q.onerror = q.onblocked = r;
    });
  });
  await page.goto(url);
}

export async function signIn(page, coach = "Coach Jordan") {
  await page.getByRole("heading", { name: "Who's coaching?" }).waitFor();
  await page.getByRole("button", { name: coach, exact: true }).click();
  await page
    .getByRole("heading", { name: /Good (morning|afternoon|evening)/ })
    .waitFor();
}

export const nav = (page, name) =>
  page.locator(".primary-nav .nav-item", { hasText: name }).click();

// From the Floor: record for `seconds` and keep it. Returns on the Saved card.
export async function recordAndKeep(page, seconds = 1.5) {
  await page
    .getByRole("button", { name: "Start recording" })
    .click({ timeout: 20000 });
  await wait(seconds * 1000);
  await page.getByRole("button", { name: "Stop recording" }).click();
  await page.getByLabel("Recording of this run").waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "Keep", exact: true }).click();
  await page.getByRole("region", { name: "Saved" }).waitFor();
}

export async function seedCourse(page, course) {
  await page.evaluate(async (c) => {
    const { put } = await import("/src/storage.js");
    await put("courses", c);
  }, course);
}

// Takes read straight from storage, newest first.
export const stored = (page, store = "takes") =>
  page.evaluate(async (s) => {
    const { all } = await import("/src/storage.js");
    return (await all(s)).sort((a, b) =>
      (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
    );
  }, store);

export async function serviceToken(phone = "+16025550150") {
  const r = await fetch(`${SERVICE}/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone }),
  });
  return (await r.json()).token;
}

export const course = (stamp) => ({
  id: `course-${stamp}`,
  name: `Test course ${stamp % 10000}`,
  background: "/gym-layout.png",
  layoutName: "LAB gym layout",
  version: 1,
  savedAt: new Date().toISOString(),
  points: [
    {
      id: "a",
      label: "Rings",
      skill: "Swing transfer",
      x: 0.31,
      y: 0.44,
      time: null,
    },
    { id: "b", label: "Wall", skill: "Wall run", x: 0.58, y: 0.36, time: null },
    { id: "c", label: "Bars", skill: "Lache", x: 0.47, y: 0.71, time: null },
  ],
});
