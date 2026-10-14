// Side by side, end to end in Chrome: default partner, alignment at an
// obstacle, synchronized playback, nudge, the obstacle-time table, ghost
// mode, saving a comparison still, head to head, the shortcut from the
// attempt history and the empty state. Needs npm run dev.
//   node scripts/compare-e2e.mjs [output-folder] [size,size]
import { launch } from "./review-kit.mjs";

const BASE = process.env.BASE ?? "http://127.0.0.1:5180/";
const kit = await launch({ out: process.argv[2] ?? "test-results/compare" });
const SIZES = process.argv[3]?.split(",") ?? ["phone", "tablet", "desktop"];
const assert = (ok, msg) => {
  if (!ok) throw Error(msg);
};
const near = (a, b, tol, msg) =>
  assert(Math.abs(a - b) <= tol, `${msg}: ${a.toFixed(3)} vs ${b.toFixed(3)}`);

const points = [
  {
    id: "p1",
    label: "Rings",
    skill: "Swing transfer",
    x: 0.3,
    y: 0.5,
    time: null,
  },
  { id: "p2", label: "Wall", skill: "Wall run", x: 0.6, y: 0.3, time: null },
];
// [id, member id, name, days ago, obstacle 1 start/end, obstacle 2 end]
const RUNS = [
  ["take-a", "theo", "Theo Parker", 0, 0.5, 1.5, 3.0],
  ["take-b", "theo", "Theo Parker", 2, 1.0, 1.8, 2.6],
  ["take-c", "maya", "Maya Brooks", 1, 0.2, 1.4, 3.4],
  ["take-d", "theo", "Theo Parker", 3, 0.3, 1.6, 3.5],
];

async function seed(page, runs) {
  await page.goto(BASE);
  await page.evaluate(
    async ({ runs, points }) => {
      const { put } = await import("/src/storage.js");
      const { courseKey } = await import("/src/attempts.js");
      const blob = await (await fetch("/test-results/sample.mp4")).blob();
      const map = {
        name: "LAB circuit",
        background: "/gym-layout.png",
        version: 1,
        points,
      };
      for (const [id, memberId, member, ago, s1, e1, e2] of runs) {
        const createdAt = new Date(Date.now() - ago * 864e5).toISOString();
        const obstacles = [
          {
            label: "Rings",
            skill: "Swing transfer",
            result: "pass",
            start: s1,
            end: e1,
            seconds: e1 - s1,
          },
          {
            label: "Wall",
            skill: "Wall run",
            result: "pass",
            start: e1,
            end: e2,
            seconds: e2 - e1,
          },
        ];
        const attempt = {
          id,
          takeId: id,
          memberId,
          member,
          course: "LAB circuit",
          courseKey: courseKey(map),
          createdAt,
          savedAt: createdAt,
          start: 0,
          end: 4,
          seconds: e2 - s1,
          completed: true,
          obstacles,
        };
        await put("attempts", attempt);
        await put("takes", {
          id,
          name: id,
          blob: new Blob([blob], { type: "video/mp4" }),
          member,
          memberId,
          course: "LAB circuit",
          duration: 4,
          start: 0,
          end: 4,
          createdAt,
          frames: [],
          notes: "",
          cue: "",
          grade: "Not reviewed",
          courseMap: map,
          attempt,
        });
      }
    },
    { runs, points },
  );
  await page.reload();
}

const times = (page) =>
  page.evaluate(() => {
    const [a, b] = document.querySelectorAll(".rp-compare-stage video");
    return {
      a: a.currentTime,
      b: b.currentTime,
      ready: a.readyState >= 2 && b.readyState >= 2,
    };
  });
const section = (page) => page.locator("#compare");

for (const size of SIZES) {
  const { page, h, context } = await kit.page(size, { label: "compare" });
  page.setDefaultTimeout(10000);

  await h.step("empty state with only one take", async () => {
    await seed(page, [RUNS[0]]);
    await section(page).getByText("Nothing to compare yet").waitFor();
  });

  await h.step(
    "the fastest clean run of the same course is suggested",
    async () => {
      await seed(page, RUNS);
      await section(page).scrollIntoViewIfNeeded();
      assert(
        (await section(page).getByLabel("Compare with").inputValue()) ===
          "take-b",
        "take-b suggested",
      );
      await page.waitForFunction(() =>
        [...document.querySelectorAll(".rp-compare-stage video")].every(
          (v) => v.readyState >= 2,
        ),
      );
    },
  );

  await h.step("both line up at the first obstacle", async () => {
    assert(
      (await section(page).getByLabel("Line up at").inputValue()) === "o0",
      "obstacle 1",
    );
    const t = await times(page);
    near(t.a, 0.5, 0.05, "A at Rings");
    near(t.b, 1.0, 0.05, "B at Rings");
  });
  await h.overflow("compare side by side");
  await h.layout("compare side by side");
  await h.shot("side-by-side");

  await h.step("playing keeps B within two frames of A", async () => {
    await section(page).getByRole("button", { name: "Play both" }).click();
    await page.waitForTimeout(1200);
    const mid = await times(page);
    await section(page).getByRole("button", { name: "Pause" }).click();
    assert(mid.a > 0.9, `A advanced: ${mid.a}`);
    near(mid.a - 0.5, mid.b - 1.0, 0.12, "A and B in step");
  });

  await h.step("lining up at the second obstacle moves both", async () => {
    await section(page).getByLabel("Line up at").selectOption("o1");
    await page.waitForTimeout(300);
    const t = await times(page);
    near(t.a, 1.5, 0.05, "A at Wall");
    near(t.b, 1.8, 0.05, "B at Wall");
  });

  await h.step("nudging B moves only B", async () => {
    await section(page).getByRole("button", { name: "B later" }).click();
    await section(page).getByRole("button", { name: "B later" }).click();
    await section(page).getByText("B +0.2s").waitFor();
    await page.waitForTimeout(200);
    const t = await times(page);
    near(t.a, 1.5, 0.05, "A unchanged");
    near(t.b, 2.0, 0.05, "B nudged");
    await section(page).getByRole("button", { name: "B earlier" }).click();
    await section(page).getByRole("button", { name: "B earlier" }).click();
    await section(page).getByText("No offset").waitFor();
  });

  await h.step("frame steps move both a tenth", async () => {
    await section(page).getByRole("button", { name: "+0.1s" }).click();
    await page.waitForTimeout(200);
    const t = await times(page);
    near(t.a, 1.6, 0.05, "A stepped");
    near(t.b, 1.9, 0.05, "B stepped");
  });

  await h.step(
    "obstacle times compare with words, not just color",
    async () => {
      const table = section(page).locator(".rp-compare-table");
      await table.getByText("0.2s slower").first().waitFor(); // Rings 1.0 vs 0.8
      await table.getByText("0.7s slower").waitFor(); // Wall 1.5 vs 0.8
      await table.locator("tfoot").getByText("0.9s slower").waitFor(); // 2.5 vs 1.6
    },
  );

  await h.step("ghost mode overlays B at the chosen opacity", async () => {
    await section(page)
      .getByRole("radiogroup", { name: "Layout" })
      .getByRole("radio", { name: "Ghost" })
      .click();
    await section(page).locator(".rp-compare-stage.is-ghost").waitFor();
    await section(page).locator(".rp-compare-ghost input").fill("70");
    const op = await section(page)
      .locator(".rp-compare-b")
      .evaluate((e) => getComputedStyle(e).opacity);
    assert(op === "0.7", `opacity ${op}`);
    const [a, b] = await section(page)
      .locator(".rp-compare-stage video")
      .evaluateAll((v) => v.map((x) => x.getBoundingClientRect().top));
    near(a, b, 1, "B sits on A");
  });
  await h.overflow("compare ghost");
  await h.shot("ghost");

  await h.step("a comparison still becomes a key frame on A", async () => {
    await section(page)
      .getByRole("button", { name: "Save as key frame" })
      .click();
    await page.getByRole("region", { name: "Unsaved changes" }).waitFor();
    await page.locator("#frames").getByText("Coach pick").waitFor();
    const note = await page.locator("#frames textarea").first().inputValue();
    assert(note.startsWith("Side by side with Theo Parker"), note);
    await page
      .getByRole("region", { name: "Unsaved changes" })
      .getByRole("button", { name: "Save", exact: true })
      .click();
    const saved = await page.evaluate(async () => {
      const { all } = await import("/src/storage.js");
      return (await all("takes")).find((t) => t.id === "take-a").frames.length;
    });
    assert(saved === 1, "still saved");
  });

  await h.step("another member's run is head to head", async () => {
    await section(page)
      .getByRole("radiogroup", { name: "Layout" })
      .getByRole("radio", { name: "Side by side" })
      .click();
    await section(page).getByLabel("Compare with").selectOption("take-c");
    await section(page).getByText("Head to head").waitFor();
    await page.waitForTimeout(300);
    const t = await times(page);
    near(t.b, 0.2, 0.05, "Maya at Rings");
  });

  await h.step(
    "Side by side on an earlier attempt picks that take",
    async () => {
      await page
        .locator("#attempt .rp-history-run", { hasText: "3.2s" })
        .getByRole("button", { name: "Side by side" })
        .click();
      await page.waitForFunction(
        () => document.querySelector("#compare select")?.value === "take-d",
      );
    },
  );
  await h.shot("compare-full", { full: true });
  h.errors(`compare ${size}`);
  await context.close();
}

await kit.close();
