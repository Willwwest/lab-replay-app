// Shared runs and leaderboards across devices: two coaches on separate
// devices time runs on the same course and see each other's results on the
// live board; a run saved offline shares on reconnect; a parent sees their
// own kid by name and nobody else's. Needs Replay (npm run dev), the
// member app on 5173 and npm run service.
//   node scripts/leaderboard-e2e.mjs [output-folder]
import { launch } from "./review-kit.mjs";

const REPLAY = "http://127.0.0.1:5180/";
const MEMBER = "http://127.0.0.1:5173/";
const SERVICE = "http://127.0.0.1:5182/replay-api";
const kit = await launch({
  out: process.argv[2] ?? "test-results/leaderboard",
});
const assert = (ok, msg) => {
  if (!ok) throw Error(msg);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = Date.now();
const course = {
  id: `course-board-${stamp}`,
  name: `Board course ${stamp % 10000}`,
  background: "/gym-layout.png",
  layoutName: "LAB gym layout",
  version: 1,
  savedAt: new Date().toISOString(),
  points: [
    {
      id: "a",
      label: "Steps",
      skill: "Quad steps",
      x: 0.21,
      y: 0.4,
      time: null,
    },
    { id: "b", label: "Wall", skill: "Wall run", x: 0.62, y: 0.33, time: null },
  ],
};

async function coach(size, name, phone) {
  const { page, h, context } = await kit.page(size, { label: name });
  page.setDefaultTimeout(15000);
  await page.goto(REPLAY);
  await page.evaluate(async (c) => {
    const { put } = await import("/src/storage.js");
    await put("courses", c);
  }, course);
  await page.reload();
  await page.locator(".chip-select").click();
  await page.getByRole("menuitemradio", { name }).click();
  await page.locator(".avatar", { hasText: phone }).waitFor();
  await page.locator(".primary-nav .nav-item", { hasText: "Run" }).click();
  await page.getByLabel("Course", { exact: true }).selectOption(course.id);
  const box = page.getByRole("switch", { name: "3-2-1 countdown" });
  if (await box.isChecked()) await box.locator("..").click();
  return { page, h, context };
}

async function timeRun(page, memberId, gap) {
  await page.getByLabel("Who's running").selectOption(memberId);
  await page.getByRole("button", { name: "Start the run" }).click();
  await page.getByRole("button", { name: "Go" }).click();
  for (let i = 0; i < course.points.length; i++) {
    await wait(gap);
    await page.locator(".rp-run-pass").click();
  }
  await page.getByRole("heading", { name: /^Clean run in/ }).waitFor();
  await page.getByRole("button", { name: "Save run" }).click();
  await page.getByRole("button", { name: "Next athlete" }).click();
}

const board = (page) => page.locator(".rp-ranks li");
const rowOf = (page, name) => board(page).filter({ hasText: name });

const jordan = await coach("phone", "Coach Jordan", "CJ");
const priya = await coach("desktop", "Coach Priya", "CP");

await jordan.h.step("Jordan times Theo; the run is shared", async () => {
  await timeRun(jordan.page, "theo", 700);
  await rowOf(jordan.page, "Theo Parker").waitFor();
  const local = await jordan.page.evaluate(async () => {
    const { all } = await import("/src/storage.js");
    return (await all("attempts")).filter((a) => a.synced).length;
  });
  assert(local === 1, "marked synced on this device");
});

await priya.h.step("Priya's board shows Theo without reloading", async () => {
  await rowOf(priya.page, "Theo Parker").waitFor({ timeout: 15000 });
});

await priya.h.step(
  "Priya times Maya faster; both boards rank her first",
  async () => {
    await timeRun(priya.page, "maya", 120);
    await priya.page.waitForFunction(() =>
      document.querySelector(".rp-ranks li")?.textContent.includes("Maya"),
    );
    await jordan.page.waitForFunction(
      () =>
        document.querySelector(".rp-ranks li")?.textContent.includes("Maya"),
      null,
      { timeout: 15000 },
    );
    const first = await board(jordan.page).first().innerText();
    assert(first.includes("1st"), first);
    const second = await board(jordan.page).nth(1).innerText();
    assert(second.includes("2nd") && second.includes("Theo"), second);
  },
);
await priya.h.overflow("leaderboard");
await priya.h.layout("leaderboard");
await priya.h.shot("leaderboard", { full: true });
await jordan.h.overflow("leaderboard");
await jordan.h.shot("leaderboard", { full: true });

await jordan.h.step("the next runner is marked on the board", async () => {
  await jordan.page.getByLabel("Who's running").selectOption("theo");
  await rowOf(jordan.page, "Theo Parker").getByText("Up next").waitFor();
});

// Before going offline, which fails a request on purpose.
jordan.h.errors("jordan");
await jordan.h.step("a run saved offline shares on reconnect", async () => {
  await jordan.page.route("**/replay-api/runs", (r) =>
    r.request().method() === "POST" ? r.abort() : r.continue(),
  );
  await timeRun(jordan.page, "theo", 450);
  await jordan.page
    .getByRole("status")
    .filter({ hasText: "Saved on this device" })
    .waitFor();
  const pending = await jordan.page.evaluate(async () => {
    const { all } = await import("/src/storage.js");
    return (await all("attempts")).filter((a) => !a.synced).length;
  });
  assert(pending === 1, `one pending, got ${pending}`);
  await jordan.page.unroute("**/replay-api/runs");
  await jordan.page.reload();
  await jordan.page
    .getByRole("status")
    .filter({ hasText: "Shared 1 saved run" })
    .waitFor();
});

const runs = async () => {
  const t = (
    await (
      await fetch(`${SERVICE}/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: "+16025550150" }),
      })
    ).json()
  ).token;
  const list = await (
    await fetch(`${SERVICE}/runs`, {
      headers: { Authorization: `Bearer ${t}` },
    })
  ).json();
  return { t, list: list.filter((r) => r.course.startsWith(course.name)) };
};
await jordan.h.step("the service holds all three runs", async () => {
  const { list } = await runs();
  assert(list.length === 3, `3 runs, got ${list.length}`);
  assert(
    list.every((r) => r.completed),
    "all clean",
  );
});

// A run on a second course, so the family side has a course to choose.
await jordan.h.step("a run on another course is shared too", async () => {
  const { t } = await runs();
  const res = await fetch(`${SERVICE}/runs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${t}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: `other-${stamp}`,
      memberId: "theo",
      course: `${course.name} B`,
      courseKey: `other-${stamp}`,
      createdAt: new Date().toISOString(),
      seconds: 4.2,
      ended: "finished",
      source: "timer",
      obstacles: [{ label: "Bars", result: "pass", seconds: 4.2 }],
    }),
  });
  assert(res.status === 201, `status ${res.status}`);
});

// The family side, in the member app.
const parent = await kit.page("desktop", { label: "parent" });
await parent.h.step(
  "Theo's parent sees Theo's place and no other names",
  async () => {
    const page = parent.page;
    await page.goto(MEMBER);
    await page.evaluate(() => {
      localStorage.setItem(
        "lab-session",
        JSON.stringify({
          phone: "+16025550101",
          since: Date.now(),
          expires: Date.now() + 864e5,
        }),
      );
    });
    await page.goto(MEMBER);
    await page
      .locator(".primary-nav .nav-item", { hasText: "Activity" })
      .click();
    // Theo has two courses, so Training offers a picker; choose this one.
    const pick = page.locator(".pg-course-pick select");
    await pick.waitFor({ timeout: 20000 });
    const value = await pick
      .locator("option", { hasText: `${course.name} ·` })
      .getAttribute("value");
    await pick.selectOption(value);
    const card = page.locator(".pg-rank");
    await card
      .getByText(`Leaderboard · ${course.name}`)
      .waitFor({ timeout: 20000 });
    await card.getByText(/Theo is 2nd of 2/).waitFor();
    await card.locator("li.is-mine", { hasText: "Theo Parker" }).waitFor();
    await card.getByText("LAB ninja").waitFor();
    assert(!(await card.innerText()).includes("Maya"), "no other kid's name");
  },
);
await parent.h.overflow("parent leaderboard");
await parent.h.shot("parent-leaderboard", { full: true });
parent.h.errors("parent");
await parent.context.close();

priya.h.errors("priya");
await jordan.context.close();
await priya.context.close();

// Clean up the test runs.
const { t, list } = await runs();
for (const r of list)
  await fetch(`${SERVICE}/runs/${r.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${t}` },
  });
console.log(`Removed ${list.length} test runs.`);
await kit.close();
