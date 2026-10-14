// Every Replay screen at every size: sideways overflow, broken layout
// (squeezed or faded blocks) and console errors, plus a full-page shot.
// Needs npm run dev (and npm run service for the roster). Usage:
//   node scripts/pages-e2e.mjs [output-folder] [size,size]
import { launch, sizes } from "./review-kit.mjs";

const BASE = process.env.BASE ?? "http://127.0.0.1:5180/";
const kit = await launch({ out: process.argv[2] ?? "test-results/pages" });
const SIZES = process.argv[3]?.split(",") ?? Object.keys(sizes);

// A fresh browser profile: empty, or one take mid-review with a finished
// analysis and a request waiting for an onsite worker.
async function world(page, filled) {
  await page.goto(BASE);
  await page.evaluate(async (filled) => {
    if (!filled) return;
    const { put } = await import("/src/storage.js");
    const video = await (await fetch("/test-results/sample.mp4")).blob();
    const frame = (time) => ({
      id: crypto.randomUUID(),
      time,
      image:
        "data:image/svg+xml," +
        encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="36"><rect width="64" height="36" fill="gray"/></svg>',
        ),
      note: "",
    });
    const points = [
      {
        id: "a",
        label: "Grip lanes",
        skill: "Dead hang",
        x: 0.42,
        y: 0.6,
        time: 1.2,
      },
      {
        id: "b",
        label: "Course lanes",
        skill: "Swing transfer",
        x: 0.45,
        y: 0.42,
        time: null,
      },
      {
        id: "c",
        label: "Track wall",
        skill: "Wall run",
        x: 0.6,
        y: 0.3,
        time: null,
      },
    ];
    await put("takes", {
      id: "pages-take",
      name: "Pages take",
      blob: new Blob([video], { type: "video/mp4" }),
      member: "Theo Parker",
      memberId: "theo",
      course: "LAB circuit",
      duration: 4,
      start: 1,
      end: 3,
      createdAt: new Date().toISOString(),
      frames: [{ ...frame(1.5), note: "Hips stay square here." }],
      notes: "Controlled finish.",
      cue: "",
      grade: "Consistent",
      courseMap: {
        name: "LAB circuit",
        background: "/gym-layout.png",
        layoutName: "LAB gym layout",
        version: 2,
        points,
      },
    });
    await put("jobs", {
      id: "pages-job",
      takeId: "pages-take",
      member: "Theo Parker",
      course: "LAB circuit",
      start: 1,
      end: 3,
      destination: "browser",
      status: "completed",
      requestedAt: new Date().toISOString(),
      result: {
        summary: {
          duration: 2,
          framesSampled: 4,
          trackedFrames: 3,
          coverage: 75,
        },
        samples: [],
        frames: [frame(2), frame(2.5)],
      },
    });
    await put("jobs", {
      id: "pages-job-2",
      takeId: "pages-take",
      member: "Theo Parker",
      course: "LAB circuit",
      start: 0,
      end: 2,
      destination: "onsite",
      status: "queued",
      requestedAt: new Date().toISOString(),
    });
  }, filled);
  await page.goto(BASE);
}

async function check(page, h, name) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(700);
  await h.overflow(name, [".rp-takes", ".ds-seg", ".primary-nav"]);
  await h.layout(name);
  await h.shot(name.replace(/\W+/g, "-").toLowerCase(), { full: true });
}

for (const size of SIZES) {
  const open = () =>
    kit.page(size, { label: "replay", reducedMotion: "reduce" });
  {
    const { page, h, context } = await open();
    await world(page, false);
    await h.step("empty library", () =>
      page.getByText("No takes yet").waitFor(),
    );
    await check(page, h, "empty");
    h.errors(`empty ${size}`);
    await context.close();
  }

  const { page, h, context } = await open();
  await world(page, true);
  await h.step("connect the roster", async () => {
    await page.locator(".chip-select").click();
    await page.getByRole("menuitemradio", { name: "Coach Jordan" }).click();
    await page.locator(".avatar", { hasText: "CJ" }).waitFor();
  });
  await h.step("review shows the take", async () => {
    await page.getByRole("heading", { name: "Video and coaching" }).waitFor();
    await page.getByRole("heading", { name: /Theo's/ }).waitFor();
  });
  await h.step("next step is the coaching cue", () =>
    page
      .getByRole("region", { name: "Next step" })
      .getByText("Write the coaching")
      .first()
      .waitFor(),
  );
  await check(page, h, "review");

  await h.step("an edit shows the save bar", async () => {
    await page.getByLabel("Focus for the next attempt").fill("Settle first.");
    await page.getByRole("region", { name: "Unsaved changes" }).waitFor();
  });
  await check(page, h, "review editing");

  await h.step("open requests", () =>
    page.locator(".primary-nav .nav-item", { hasText: "Requests" }).click(),
  );
  await check(page, h, "requests");

  await h.step("open the run setup", async () => {
    await page.locator(".primary-nav .nav-item", { hasText: "Run" }).click();
    await page.getByRole("heading", { name: "Set up the run" }).waitFor();
  });
  await check(page, h, "run setup");

  await h.step("open messages", async () => {
    await page
      .locator(".primary-nav .nav-item", { hasText: "Messages" })
      .click();
    await page
      .getByRole("heading", { name: "Messages", exact: true })
      .waitFor();
  });
  await check(page, h, "messages");
  h.errors(`replay ${size}`);
  await context.close();
}

await kit.close();
