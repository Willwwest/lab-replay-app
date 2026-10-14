// The timer overlay: on the live camera picture, burned into the filmed
// run (checked by pulling frames out of the saved recording with ffmpeg),
// off when switched off, and drawn onto portfolio clips by the service.
// Needs npm run dev and npm run service; Chrome's fake camera stands in.
//   node scripts/overlay-e2e.mjs [output-folder]
import { chromium } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { launch } from "./review-kit.mjs";
import { fresh, seedCourse, signIn, stored } from "./coach-kit.mjs";

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

const REPLAY = "http://127.0.0.1:5180/";
const SERVICE = "http://127.0.0.1:5182/replay-api";
const OUT = resolve(process.argv[2] ?? "test-results/overlay");
mkdirSync(OUT, { recursive: true });
const kit = await launch({ out: OUT });
const assert = (ok, msg) => {
  if (!ok) throw Error(msg);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = Date.now();
const course = {
  id: `course-overlay-${stamp}`,
  name: "Overlay course",
  background: "/gym-layout.png",
  layoutName: "LAB gym layout",
  version: 1,
  savedAt: new Date().toISOString(),
  points: [
    { id: "a", label: "Rings", skill: "", x: 0.3, y: 0.5, time: null },
    { id: "b", label: "Wall", skill: "", x: 0.6, y: 0.3, time: null },
    { id: "c", label: "Bars", skill: "", x: 0.5, y: 0.7, time: null },
  ],
};

// Frames from a video file, as PNGs, at the given seconds.
function frames(file, name, times) {
  return times.map((t) => {
    const png = `${OUT}/${name}-${t}s.png`;
    const r = spawnSync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-ss",
      String(t),
      "-i",
      file,
      "-frames:v",
      "1",
      png,
    ]);
    assert(r.status === 0, `frame at ${t}s`);
    return png;
  });
}
// Mean brightness of a box in a PNG frame (0 black to 255 white).
function rgb(png, [x, y, w, h]) {
  const r = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      png,
      "-vf",
      `crop=${w}:${h}:${x}:${y},scale=1:1`,
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "-",
    ],
    { encoding: "buffer" },
  );
  return [...r.stdout.subarray(0, 3)];
}
function brightness(png, [x, y, w, h]) {
  const r = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      png,
      "-vf",
      `crop=${w}:${h}:${x}:${y},scale=1:1`,
      "-f",
      "rawvideo",
      "-pix_fmt",
      "gray",
      "-",
    ],
    { encoding: "buffer" },
  );
  return r.stdout[0];
}

const { page, h, context } = await kit.page("phone", { label: "overlay" });
await context.grantPermissions(["camera"]);
page.setDefaultTimeout(15000);
page.on("dialog", (d) => d.accept());
await fresh(page);
await signIn(page);
await seedCourse(page, course);

// From the Floor into the camera, as a timed course run for Theo.
async function timedRun() {
  await page.getByRole("button", { name: "Timed course" }).click();
  await page.getByRole("button", { name: /No kid picked/ }).click();
  await page
    .getByRole("dialog", { name: "Who's running?" })
    .getByRole("button", { name: /Theo Parker/ })
    .click();
  await page.getByRole("button", { name: "Capture settings" }).click();
  const settings = page.getByRole("dialog", { name: "Capture settings" });
  await settings.getByLabel("Course", { exact: true }).selectOption(course.id);
  const cd = settings.getByRole("switch", { name: "3-2-1 countdown" });
  if (await cd.isChecked()) await cd.locator("..").click();
  await settings.getByRole("button", { name: "Done" }).click();
  await page
    .getByRole("button", { name: "Start the run" })
    .click({ timeout: 20000 });
}

await h.step("the live picture shows the clock and the obstacle", async () => {
  await timedRun();
  const hud = page.locator(".rp-cap-hud");
  await hud.waitFor();
  await hud.getByText("1 of 3 · Rings").waitFor();
  const a = Number(await hud.locator("b").innerText());
  await wait(700);
  const b = Number(await hud.locator("b").innerText());
  assert(b > a, `clock ${a} → ${b}`);
  await page.locator(".rp-cap-rec", { hasText: "Timer in video" }).waitFor();
});

await h.step("each mark flashes on the picture", async () => {
  await page.locator(".rp-key-pass").click();
  await page
    .locator(".rp-cap-flash.is-pass", { hasText: "Rings · Pass" })
    .waitFor();
  await page.locator(".rp-cap-hud").getByText("2 of 3 · Wall").waitFor();
});
await h.shot("live-overlay");

let burnedFile = "";
await h.step("the saved recording has the timer burned in", async () => {
  await wait(900);
  await page.locator(".rp-key-fail").click();
  await page.locator(".rp-cap-flash.is-fail").waitFor();
  await wait(900);
  await page.locator(".rp-key-pass").click();
  await page.getByLabel("Recording of this run").waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "Keep", exact: true }).click();
  await page.getByRole("region", { name: "Saved" }).waitFor();
  const take = await page.evaluate(async () => {
    const { all } = await import("/src/storage.js");
    const t = (await all("takes")).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    )[0];
    const bytes = new Uint8Array(await t.blob.arrayBuffer());
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000)
      s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return {
      burned: t.burned,
      type: t.blob.type,
      duration: t.duration,
      data: btoa(s),
      end: t.attempt?.seconds,
    };
  });
  assert(take.burned === true, "take marked burned");
  burnedFile = `${OUT}/burned.${take.type.includes("mp4") ? "mp4" : "webm"}`;
  writeFileSync(burnedFile, Buffer.from(take.data, "base64"));
  // Mid-run: the clock panel (bottom left) is dark over the bright test
  // picture; at the end, the result card covers the middle.
  const [mid, last] = frames(burnedFile, "burned", [
    1.2,
    Math.max(0.1, take.duration - 0.3).toFixed(2),
  ]);
  const raw = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v",
      "-show_entries",
      "stream=width,height",
      "-of",
      "csv=p=0",
      burnedFile,
    ],
    { encoding: "utf8" },
  )
    .stdout.trim()
    .split(",")
    .map(Number);
  const [w, hgt] = raw;
  const s = w / 1280;
  const clockBox = [
    Math.round(40 * s),
    Math.round(hgt - 120 * s),
    Math.round(120 * s),
    Math.round(60 * s),
  ];
  const centre = [
    Math.round(w / 2 - 100 * s),
    Math.round(hgt / 2 - 30 * s),
    Math.round(200 * s),
    Math.round(60 * s),
  ];
  const clockMid = brightness(mid, clockBox);
  // The fake camera is green; the result card is navy.
  const [r, g, b] = rgb(last, centre);
  console.log(
    `  frame ${w}x${hgt}; clock panel ${clockMid}; centre at the end rgb(${r},${g},${b}); take ${take.duration.toFixed(2)}s, run ${take.end}s`,
  );
  assert(b > g, "the navy result card covers the centre at the end");
  assert(clockMid < 120, "the dark clock panel sits bottom left");
  assert(take.duration > take.end + 0.5, "recording runs on past the finish");
});

await h.step(
  "with the timer off the recording is the plain camera",
  async () => {
    await page.getByRole("button", { name: "Record another" }).click();
    await page.getByRole("radio", { name: "Record", exact: true }).click();
    await page.getByRole("button", { name: "Capture settings" }).click();
    const settings = page.getByRole("dialog", { name: "Capture settings" });
    const sw = settings.getByRole("switch", { name: "Timer on the video" });
    if (await sw.isChecked()) await sw.locator("..").click();
    await settings.getByRole("button", { name: "Done" }).click();
    await page.getByRole("button", { name: "Start recording" }).click();
    await page.locator(".rp-cap-rec", { hasText: "Recording" }).waitFor();
    await wait(1200);
    await page.getByRole("button", { name: "Stop recording" }).click();
    await page.getByLabel("Recording of this run").waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: "Keep", exact: true }).click();
    await page.getByRole("region", { name: "Saved" }).waitFor();
    const takes = await stored(page);
    assert(takes.length === 2, `two takes: ${takes.length}`);
    assert(takes[0].burned === false, "the newest take isn't burned");
  },
);
h.errors("overlay");
await context.close();

// The service draws the timer onto a portfolio clip of an untimed video.
const step = async (name, fn) => {
  try {
    await fn();
    console.log(`PASS  service: ${name}`);
  } catch (e) {
    console.log(`FAIL  service: ${name} → ${e.message}`);
    process.exitCode = 1;
  }
};
await step("a portfolio clip gets the clock drawn on", async () => {
  const token = (
    await (
      await fetch(`${SERVICE}/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: "+16025550150" }),
      })
    ).json()
  ).token;
  const auth = { Authorization: `Bearer ${token}` };
  const asset = await (
    await fetch(`${SERVICE}/assets`, {
      method: "POST",
      headers: auth,
      body: readFileSync("test-results/sample.mp4"),
    })
  ).json();
  const points = [
    { label: "Rings", skill: "", x: 0.3, y: 0.5 },
    { label: "Wall", skill: "", x: 0.6, y: 0.3 },
  ];
  const png = `data:image/png;base64,${readFileSync("public/gym-layout.png").toString("base64")}`;
  const review = await (
    await fetch(`${SERVICE}/reviews`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        submissionId: crypto.randomUUID(),
        assetId: asset.id,
        memberId: "theo",
        takeId: crypto.randomUUID(),
        start: 0.5,
        end: 3.5,
        course: { name: "Overlay course", points },
        courseImage: png,
        grade: "Consistent",
        notes: "",
        cue: "Overlay check.",
        frames: [],
        timer: true,
        attempt: {
          memberId: "theo",
          courseKey: JSON.stringify(
            points.map((p) => [p.label, p.skill, p.x, p.y]),
          ),
          start: 0.5,
          end: 3.5,
          obstacles: [
            { label: "Rings", skill: "", result: "pass", start: 0.8, end: 1.9 },
            { label: "Wall", skill: "", result: "pass", start: 1.9, end: 3.1 },
          ],
        },
        analysis: {
          id: "x",
          status: "completed",
          start: 0.5,
          end: 3.5,
          summary: {},
        },
      }),
    })
  ).json();
  assert(review.id, review.error);
  for (let i = 0; i < 60; i++) {
    const r = await (
      await fetch(`${SERVICE}/reviews/${review.id}`, { headers: auth })
    ).json();
    if (r.status === "ready") break;
    assert(r.status !== "failed", r.error);
    await wait(500);
  }
  const clip = Buffer.from(
    await (
      await fetch(`${SERVICE}/reviews/${review.id}/video`, { headers: auth })
    ).arrayBuffer(),
  );
  writeFileSync(`${OUT}/portfolio.mp4`, clip);
  const [before, during] = frames(
    `${OUT}/portfolio.mp4`,
    "portfolio",
    [0.1, 1.5],
  );
  const box = [32, 720 - 120, 120, 64];
  const a = brightness(before, box);
  const b = brightness(during, box);
  console.log(`  clock area before the run ${a}, during ${b}`);
  // The test pattern there is static, so any change is the clock box.
  assert(Math.abs(b - a) > 15, "the clock box appears once the run starts");
});
await kit.close();
