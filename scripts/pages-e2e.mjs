// Every Replay screen at every size: sideways overflow, broken layout
// (squeezed or faded blocks) and console errors, plus a full-page shot.
// Needs npm run dev (and npm run service for the shared screens).
//   node scripts/pages-e2e.mjs [output-folder] [size,size]
import { launch, sizes } from "./review-kit.mjs";
import { fresh, nav, signIn } from "./coach-kit.mjs";

const kit = await launch({ out: process.argv[2] ?? "test-results/pages" });
const SIZES = process.argv[3]?.split(",") ?? Object.keys(sizes);

async function seed(page) {
  await page.evaluate(async () => {
    const { put } = await import("/src/storage.js");
    const video = await (await fetch("/test-results/sample.mp4")).blob();
    const still =
      "data:image/svg+xml," +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="36"><rect width="64" height="36" fill="gray"/></svg>',
      );
    const base = {
      blob: new Blob([video], { type: "video/mp4" }),
      duration: 4,
      start: 1,
      end: 3,
      frames: [],
      notes: "",
      cue: "",
      grade: "Not reviewed",
    };
    await put("takes", {
      ...base,
      id: "pages-take",
      name: "Pages take",
      member: "Theo Parker",
      memberId: "theo",
      course: "LAB circuit",
      createdAt: new Date().toISOString(),
      frames: [
        { id: "f1", time: 1.5, image: still, note: "Hips stay square here." },
      ],
      notes: "Controlled finish.",
      grade: "Consistent",
      checked: {
        start: 1,
        end: 3,
        by: "Coach Jordan",
        at: new Date().toISOString(),
      },
      courseMap: {
        name: "LAB circuit",
        background: "/gym-layout.png",
        layoutName: "LAB gym layout",
        version: 2,
        points: [
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
        ],
      },
    });
    await put("takes", {
      ...base,
      id: "pages-raw",
      name: "Raw take",
      member: "",
      memberId: "",
      course: "",
      createdAt: new Date(Date.now() - 60000).toISOString(),
    });
  });
}

async function check(page, h, name) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(600);
  await h.overflow(name, [
    ".rp-here-kids",
    ".ds-seg",
    ".primary-nav",
    ".rp-cap-next",
  ]);
  await h.layout(name);
  await h.shot(name.replace(/\W+/g, "-").toLowerCase(), { full: true });
}

for (const size of SIZES) {
  const { page, h, context } = await kit.page(size, {
    label: "replay",
    reducedMotion: "reduce",
  });
  page.setDefaultTimeout(15000);
  await fresh(page);
  await check(page, h, "who's coaching");
  await h.step("sign in", () => signIn(page));
  await check(page, h, "floor empty");
  await h.step("seed two takes", async () => {
    await seed(page);
    await page.reload();
    await page.getByText("1 take to assign").waitFor();
  });
  await check(page, h, "floor");

  await h.step("takes", async () => {
    await nav(page, "Takes");
    await page.getByRole("heading", { name: "Recordings" }).waitFor();
  });
  await check(page, h, "takes");

  for (const tab of ["watch", "course", "coach", "share"]) {
    await h.step(`take ${tab}`, async () => {
      await page.goto(`${page.url().split("#")[0]}#/take/pages-take/${tab}`);
      await page.getByRole("heading", { name: "Theo Parker" }).waitFor();
    });
    await check(page, h, `take ${tab}`);
  }

  await h.step("board", async () => {
    await nav(page, "Board");
    await page
      .getByRole("heading", { name: "Leaderboards and team runs" })
      .waitFor();
  });
  await check(page, h, "board");
  await h.step("messages", async () => {
    await nav(page, "Messages");
    await page.getByRole("heading", { name: "Families" }).waitFor();
  });
  await check(page, h, "messages");
  h.errors(`replay ${size}`);
  await context.close();
}

await kit.close();
