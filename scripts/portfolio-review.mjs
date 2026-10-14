// Course-to-portfolio, end to end on one take: import, assign, map, attempt,
// coaching, the check-and-send gate for analysis, render, preview, publish,
// family-app playback, family isolation and withdrawal.
// Needs Replay (npm run dev), the member app on 5173 and npm run service.
//   node scripts/portfolio-review.mjs
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { REPLAY, fresh, signIn, stored } from "./coach-kit.mjs";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1366, height: 950 },
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const portfolio = () => page.locator(".rp-portfolio");
const tab = (name) => page.getByRole("radio", { name, exact: true }).click();
async function saveDraft() {
  await page
    .getByRole("region", { name: "Unsaved changes" })
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await page
    .getByRole("region", { name: "Unsaved changes" })
    .waitFor({ state: "detached" });
}

try {
  await fresh(page, REPLAY);
  await signIn(page, "Coach Jordan");

  // Import from the Floor, then open it from Today and assign Theo.
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles("test-results/sample.mp4");
  await page.getByText("1 take to assign").waitFor();
  await page
    .getByRole("list", { name: "Today's takes" })
    .getByRole("button", { name: /^No kid yet/ })
    .click();
  await page.getByRole("button", { name: "Assign a kid" }).click();
  await page
    .getByRole("dialog", { name: "Whose take is this?" })
    .getByRole("button", { name: /Theo Parker/ })
    .first()
    .click();
  await page.getByRole("heading", { name: "Theo Parker" }).waitFor();
  assert.equal(
    (await stored(page))[0].memberId,
    "theo",
    "the take belongs to the chosen kid",
  );

  // Watch: trim, check, and confirm the send.
  await page.getByLabel("Clip start (seconds)").fill("1");
  await page.getByLabel("Clip end (seconds)").fill("3");
  await saveDraft();

  // Course: name it, map two points, save the course, score the attempt.
  await tab("Course");
  await page.getByLabel("Course name", { exact: true }).fill("LAB circuit");
  assert.equal(
    await page.locator(".rp-map image").getAttribute("href"),
    "/gym-layout.png",
  );
  const map = page.locator(".rp-map");
  const box = await map.boundingBox();
  await map.click({ position: { x: box.width * 0.42, y: box.height * 0.6 } });
  await page.getByLabel("Point 1 label").fill("Grip lanes");
  await map.click({ position: { x: box.width * 0.45, y: box.height * 0.42 } });
  await page.getByLabel("Point 2 label").fill("Course lanes");
  await page.getByRole("button", { name: "Save course", exact: true }).click();
  await saveDraft();
  for (const n of [1, 2])
    await page
      .getByRole("radiogroup", { name: `Obstacle ${n} result` })
      .getByRole("radio", { name: "Pass" })
      .click();
  await page.getByRole("button", { name: "Save attempt", exact: true }).click();
  await page.getByText("Attempt saved.", { exact: true }).waitFor();

  // Coach: the assessment and the cue.
  await tab("Coach");
  await page
    .getByLabel("Assessment", { exact: true })
    .selectOption("Consistent");
  await page.getByLabel("What went well").fill("Controlled finish.");
  await page
    .getByLabel("Focus for the next attempt")
    .fill("Settle your feet before moving on.");
  await saveDraft();

  // Share: nothing to prepare before the recording is checked and analyzed.
  await tab("Share");
  const prepare = portfolio().getByRole("button", {
    name: "Prepare portfolio clip",
  });
  assert.ok(await prepare.isDisabled(), "no portfolio before analysis");
  await portfolio().getByText("Check the recording").waitFor();
  await portfolio().getByText("Analyze this clip").waitFor();

  await tab("Watch");
  for (const l of [
    /trimmed to the run/,
    /in frame from start/,
    /Steady and close/,
  ])
    await page.getByRole("checkbox", { name: l }).check();
  await page.getByRole("button", { name: "Mark as checked" }).click();
  await page.getByRole("button", { name: "Send for analysis…" }).click();
  await page.getByRole("button", { name: "Send the 2.0s clip" }).click();
  await page
    .getByRole("heading", { name: "Analyzed" })
    .waitFor({ timeout: 120000 });

  await tab("Share");
  await prepare.click();
  const publish = page.getByRole("button", {
    name: "Publish to member portfolio",
  });
  await publish.waitFor({ timeout: 60000 });
  await page.waitForFunction(
    () => document.querySelector(".rp-portfolio video")?.readyState >= 2,
  );
  const id = await page.evaluate(async () => {
    const { all } = await import("/src/storage.js");
    return (await all("takes"))[0].portfolioId;
  });

  const base = "http://127.0.0.1:5182/replay-api";
  const auth = async (phone) =>
    (
      await (
        await fetch(base + "/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone }),
        })
      ).json()
    ).token;
  const parent = await auth("+16025550101");
  const other = await auth("+16025550102");
  const as = (token) => ({ headers: { Authorization: `Bearer ${token}` } });
  assert.equal(
    (await fetch(`${base}/reviews/${id}`, as(parent))).status,
    404,
    "draft hidden from parent",
  );

  await publish.click();
  await portfolio().locator("em", { hasText: "Published" }).waitFor();
  assert.equal((await fetch(`${base}/reviews/${id}`, as(parent))).status, 200);
  assert.equal(
    (await fetch(`${base}/reviews/${id}/video`, as(other))).status,
    404,
    "another family can't watch it",
  );
  assert.equal(
    (
      await fetch(`${base}/reviews/${id}/publish`, {
        method: "POST",
        ...as(parent),
      })
    ).status,
    403,
    "a parent can't publish",
  );
  const clip = await fetch(`${base}/reviews/${id}/video`, as(parent));
  await writeFile(
    "test-results/portfolio-output.mp4",
    Buffer.from(await clip.arrayBuffer()),
  );

  for (const width of [1366, 820, 390]) {
    await page.setViewportSize({ width, height: 950 });
    await page.screenshot({
      path: `test-results/course-${width}.png`,
      fullPage: true,
    });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `Replay overflow ${width}`,
    );
  }
  await page.setViewportSize({ width: 1366, height: 950 });

  const family = await context.newPage();
  await family.goto("http://127.0.0.1:5173");
  await family.evaluate(() =>
    localStorage.setItem(
      "lab-session",
      JSON.stringify({
        phone: "+16025550101",
        since: Date.now(),
        expires: Date.now() + 86400000,
      }),
    ),
  );
  await family.reload();
  await family
    .getByRole("button", { name: "Portfolio", exact: true })
    .first()
    .click();
  await family.getByRole("heading", { name: "My video portfolio" }).waitFor();
  await family.locator(".replay-review").first().waitFor();
  await family
    .getByRole("heading", { name: "Course attempt", exact: true })
    .waitFor();
  await family.waitForFunction(
    () => document.querySelector(".replay-review video")?.readyState >= 2,
  );
  await family.screenshot({
    path: "test-results/member-portfolio.png",
    fullPage: true,
  });

  await page.bringToFront();
  await page.getByRole("button", { name: "Withdraw from portfolio" }).click();
  await portfolio().locator("em", { hasText: "Withdrawn" }).waitFor();
  assert.equal(
    (await fetch(`${base}/reviews/${id}/video`, as(parent))).status,
    404,
    "withdrawn reviews are gone for the family",
  );
  assert.deepEqual(errors, []);
  // The scored attempt was shared as a run; remove it.
  const coach = await auth("+16025550150");
  await fetch(
    `${base}/runs/${await page.evaluate(async () => {
      const { all } = await import("/src/storage.js");
      return (await all("takes"))[0].id;
    })}`,
    { method: "DELETE", ...as(coach) },
  );
  console.log(
    "PASS: import and assign, supplied map, course route, attempt, coaching, check-and-send before analysis, clipped overlay render, preview, publication, family isolation, family app playback, withdrawal, responsive layouts.",
  );
} catch (e) {
  console.error(await page.locator("main").innerText());
  throw e;
} finally {
  await browser.close();
}
