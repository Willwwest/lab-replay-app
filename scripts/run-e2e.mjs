// Live run timer, end to end in Chrome with a fake camera: countdown,
// tap and keyboard marks, corrections, time cap, fail limit, pace against
// the personal best, a filmed run that opens in Review already scored, and
// quick runs. Needs npm run dev and npm run service.
//   node scripts/run-e2e.mjs [output-folder]
import { chromium } from "@playwright/test";
import { launch } from "./review-kit.mjs";

// The review kit launches Chrome itself; add a fake camera to that launch.
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

const BASE = process.env.BASE ?? "http://127.0.0.1:5180/";
const kit = await launch({ out: process.argv[2] ?? "test-results/run" });
const assert = (ok, msg) => {
  if (!ok) throw Error(msg);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const course = {
  id: "course-circuit",
  name: "LAB circuit",
  background: "/gym-layout.png",
  layoutName: "LAB gym layout",
  version: 1,
  savedAt: new Date().toISOString(),
  points: [
    {
      id: "a",
      label: "Rings",
      skill: "Swing transfer",
      x: 0.3,
      y: 0.5,
      time: null,
    },
    {
      id: "b",
      label: "Track wall",
      skill: "Wall run",
      x: 0.6,
      y: 0.3,
      time: null,
    },
    { id: "c", label: "Bars", skill: "Lache", x: 0.5, y: 0.7, time: null },
  ],
};

async function setUp(page) {
  await page.goto(BASE);
  await page.evaluate(async (c) => {
    const { put } = await import("/src/storage.js");
    await put("courses", c);
  }, course);
  await page.reload();
  await page.locator(".chip-select").click();
  await page.getByRole("menuitemradio", { name: "Coach Jordan" }).click();
  await page.locator(".avatar", { hasText: "CJ" }).waitFor();
  await page.locator(".primary-nav .nav-item", { hasText: "Run" }).click();
  await page.getByRole("heading", { name: "Set up the run" }).waitFor();
}

const attempts = (page) =>
  page.evaluate(async () => {
    const { all } = await import("/src/storage.js");
    return all("attempts");
  });
// Runs saved here are shared with the service; remove them afterwards.
async function unshare(page) {
  const ids = await page.evaluate(async () => {
    const { all } = await import("/src/storage.js");
    return (await all("attempts")).map((a) => a.id);
  });
  const service = "http://127.0.0.1:5182/replay-api";
  const { token } = await (
    await fetch(`${service}/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "+16025550150" }),
    })
  ).json();
  for (const id of ids)
    await fetch(`${service}/runs/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
}

const overlay = (page) => page.getByRole("dialog", { name: "Live run" });
const toggle = async (page, label, on) => {
  const box = page.getByRole("switch", { name: label });
  if ((await box.isChecked()) !== on) await box.locator("..").click();
};

const SIZES = process.argv[3]?.split(",") ?? ["phone", "desktop"];
for (const size of SIZES) {
  const { page, h, context } = await kit.page(size, { label: "run" });
  page.setDefaultTimeout(10000);
  await context.grantPermissions(["camera"]);
  page.on("dialog", (d) => d.accept());
  await h.step("open the run setup with the roster connected", () =>
    setUp(page),
  );
  await h.step("choose Theo and the saved course", async () => {
    await page.getByLabel("Who's running").selectOption("theo");
    await page.getByLabel("Course", { exact: true }).selectOption(course.id);
    await page.getByRole("list", { name: "Obstacles in order" }).waitFor();
  });
  await h.overflow("setup");
  await h.shot("setup", { full: true });

  // 1. Countdown, tap and keyboard marks, a correction, save.
  await h.step("countdown runs 3-2-1 then the clock starts", async () => {
    await page.getByRole("button", { name: "Start the run" }).click();
    await overlay(page).waitFor();
    await page.getByRole("button", { name: "Start countdown" }).click();
    await page.locator(".rp-run-count", { hasText: "3" }).waitFor();
    await page.locator(".rp-run-count", { hasText: "2" }).waitFor();
    await page
      .locator(".rp-run-now", { hasText: "Rings" })
      .waitFor({ timeout: 5000 });
    const a = await page.locator(".rp-run-time").innerText();
    await wait(400);
    const b = await page.locator(".rp-run-time").innerText();
    assert(Number(b) > Number(a), `clock didn't move: ${a} → ${b}`);
  });
  await h.shot("running");
  await h.overflow("running");
  await h.step(
    "tap Pass, press F, press Space: three splits, then done",
    async () => {
      await page.locator(".rp-run-pass").click();
      await page.locator(".rp-run-now", { hasText: "Track wall" }).waitFor();
      await wait(300);
      await page.keyboard.press("f");
      await page.locator(".rp-run-now", { hasText: "Bars" }).waitFor();
      await wait(300);
      await page.locator("body").press(" ");
      await page.getByRole("heading", { name: /^Finished at/ }).waitFor();
      assert(
        (await page.locator(".rp-run-splits li").count()) === 3,
        "three splits",
      );
    },
  );
  await h.shot("result");
  await h.step(
    "correct the fail to a pass: the run becomes clean",
    async () => {
      await page
        .getByRole("radiogroup", { name: "Track wall result" })
        .getByRole("radio", { name: "Pass" })
        .click();
      await page.getByRole("heading", { name: /^Clean run in/ }).waitFor();
      await page.getByText("New personal best").waitFor();
    },
  );
  await h.step("save stores a clean timer attempt", async () => {
    await page.getByRole("button", { name: "Save run" }).click();
    await page.getByText("Saved", { exact: false }).first().waitFor();
    const list = await attempts(page);
    assert(list.length === 1, `one attempt, got ${list.length}`);
    const a = list[0];
    assert(a.source === "timer" && a.completed, "clean timer attempt");
    assert(a.obstacles[1].result === "pass", "correction saved");
    assert(
      a.obstacles.every(
        (o, i) => i === 0 || o.start === a.obstacles[i - 1].end,
      ),
      "splits chain",
    );
  });
  await h.step(
    "next athlete returns to setup with the run listed as best",
    async () => {
      await page.getByRole("button", { name: "Next athlete" }).click();
      await overlay(page).waitFor({ state: "detached" });
      await page
        .locator(".rp-run-row", { hasText: "Theo Parker" })
        .getByText("Best")
        .waitFor();
      await page.getByRole("region", { name: "Personal best" }).waitFor();
    },
  );

  // 2. Pace against the best, keyboard undo, Escape ends.
  await h.step("pace shows against the best; U undoes; Esc stops", async () => {
    await toggle(page, "3-2-1 countdown", false);
    await page.getByRole("button", { name: "Start the run" }).click();
    await page.getByRole("button", { name: "Go" }).click();
    await page.locator(".rp-run-now", { hasText: "Rings" }).waitFor();
    await page.keyboard.press("p");
    await page.locator(".rp-run-pace").waitFor();
    const pace = await page.locator(".rp-run-pace").innerText();
    assert(/ahead of best|behind best/.test(pace), pace);
    await page.keyboard.press("u");
    await page.locator(".rp-run-now", { hasText: "Rings" }).waitFor();
    await page.keyboard.press("Escape");
    await page.getByRole("heading", { name: /^Stopped at/ }).waitFor();
    await page.getByRole("button", { name: "Discard" }).click();
    await overlay(page).waitFor({ state: "detached" });
    assert((await attempts(page)).length === 1, "discarded run not saved");
  });

  // 3. Time cap.
  await h.step("the time cap ends the run with a gold warning", async () => {
    await page.getByLabel("Time cap (seconds)").fill("2");
    await page.getByRole("button", { name: "Start the run" }).click();
    await page.getByRole("button", { name: "Go" }).click();
    await page.locator(".rp-run.is-warn").waitFor();
    await page
      .getByRole("heading", { name: "Time cap at 2.0s" })
      .waitFor({ timeout: 4000 });
    await page.getByRole("button", { name: "Save run" }).click();
    await page.getByRole("button", { name: "Next athlete" }).click();
    const capped = (await attempts(page)).find((a) => a.ended === "time-cap");
    assert(capped && capped.seconds === 2 && !capped.completed, "capped run");
    assert(
      capped.obstacles.every((o) => o.result === "skip"),
      "unreached obstacles skipped",
    );
  });

  // 4. Fail limit, remembered rules.
  await h.step(
    "the fail limit ends the run; rules are remembered",
    async () => {
      await page.getByLabel("Time cap (seconds)").fill("");
      await page
        .getByRole("radiogroup", { name: "Fail limit" })
        .getByRole("radio", { name: "1" })
        .click();
      await page.getByRole("button", { name: "Start the run" }).click();
      await page.getByText("Fails 0 of 1").waitFor();
      await page.getByRole("button", { name: "Go" }).click();
      await page.locator(".rp-run-fail").click();
      await page.getByRole("heading", { name: /^Fail limit at/ }).waitFor();
      await page.getByRole("button", { name: "Discard" }).click();
      const saved = await page.evaluate(async () => {
        const { all } = await import("/src/storage.js");
        return (await all("courses")).find((c) => c.id === "course-circuit")
          .rules;
      });
      assert(saved.failLimit === 1, "fail limit saved to the course");
      await page
        .getByRole("radiogroup", { name: "Fail limit" })
        .getByRole("radio", { name: "Off" })
        .click();
    },
  );

  // 5. A filmed run lands in Review already scored.
  await h.step(
    "a filmed run saves a take with its attempt scored",
    async () => {
      await toggle(page, "Film the run", true);
      await page.getByRole("button", { name: "Start the run" }).click();
      await page.locator(".rp-run-cam video").waitFor();
      await page.getByRole("button", { name: "Go" }).click({ timeout: 15000 });
      await page.getByText("Filming").waitFor();
      for (const label of ["Track wall", "Bars"]) {
        await wait(500);
        await page.locator(".rp-run-pass").click();
        await page.locator(".rp-run-now", { hasText: label }).waitFor();
      }
      await wait(500);
      await page.locator(".rp-run-pass").click();
      await page.getByRole("heading", { name: /^Clean run in/ }).waitFor();
      await page
        .getByLabel("Recording of this run")
        .waitFor({ timeout: 10000 });
      await page.getByRole("button", { name: "Save run" }).click();
      await page
        .getByText("Saved as a take with its attempt scored.")
        .waitFor();
    },
  );
  await h.shot("filmed-result");
  await h.step(
    "open in Review: obstacles scored and timed, map linked",
    async () => {
      await page.getByRole("button", { name: "Open in Review" }).click();
      await page.getByRole("heading", { name: "Video and coaching" }).waitFor();
      for (const n of [1, 2, 3])
        assert(
          (await page
            .getByRole("radiogroup", { name: `Obstacle ${n} result` })
            .getByRole("radio", { name: "Pass" })
            .getAttribute("aria-checked")) === "true",
          `obstacle ${n} pass`,
        );
      assert(
        Number(await page.getByLabel("Obstacle 2 start").inputValue()) > 0,
        "obstacle 2 timed",
      );
      await page.getByRole("button", { name: "Update attempt" }).waitFor();
      const map = await page
        .getByRole("button", { name: /^\d+\.\ds$/ })
        .count();
      assert(map === 3, `three linked map points, got ${map}`);
      const next = await page
        .getByRole("region", { name: "Next step" })
        .locator("h2")
        .innerText();
      assert(next !== "Update the attempt", "attempt matches the take");
    },
  );
  await h.shot("review-from-run", { full: true });

  // 6. Quick run.
  await h.step("a quick run times laps without a course", async () => {
    await page.locator(".primary-nav .nav-item", { hasText: "Run" }).click();
    await toggle(page, "Film the run", false);
    await page.getByLabel("Course", { exact: true }).selectOption("quick");
    await page.getByLabel("What are you timing?").fill("Warped wall");
    await page.getByRole("button", { name: "Start the run" }).click();
    await page.getByRole("button", { name: "Go" }).click();
    await page.getByRole("button", { name: "Lap" }).waitFor();
    await wait(300);
    await page.getByRole("button", { name: "Lap" }).click();
    await wait(300);
    await page.getByRole("button", { name: "Finish" }).click();
    await page.getByRole("heading", { name: /^Clean run in/ }).waitFor();
    assert((await page.locator(".rp-run-splits li").count()) === 2, "two laps");
    await page.getByRole("button", { name: "Save run" }).click();
    await page.getByRole("button", { name: "Next athlete" }).click();
    await page.locator(".rp-run-row", { hasText: "Warped wall" }).waitFor();
  });
  await h.overflow("recent runs");
  await h.layout("recent runs");
  await h.shot("recent-runs", { full: true });
  h.errors(`run ${size}`);
  await unshare(page);
  await context.close();
}

await kit.close();
