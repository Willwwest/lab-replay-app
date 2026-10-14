// Course-to-portfolio, end to end: roster, map, attempt, analysis, render,
// preview, publish, family-app playback, family isolation and withdrawal.
// Needs Replay (npm run dev), the member app on 5173 and npm run service.
//   node scripts/portfolio-review.mjs
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1366, height: 950 },
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const portfolio = () => page.locator(".rp-portfolio");

try {
  await page.goto("http://127.0.0.1:5180");
  await page.locator(".chip-select").click();
  await page.getByRole("menuitemradio", { name: "Coach Jordan" }).click();
  await page.getByLabel("Member", { exact: true }).selectOption("theo");
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles("test-results/sample.mp4");
  await page.getByRole("heading", { name: "Course map" }).waitFor();
  assert.equal(
    await page.locator("#take select").inputValue(),
    "theo",
    "a new take belongs to the chosen member",
  );
  await page.getByLabel("Course", { exact: true }).fill("LAB circuit");
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
  await page
    .getByLabel("Assessment", { exact: true })
    .selectOption("Consistent");
  await page.getByLabel("What went well").fill("Controlled finish.");
  await page
    .getByLabel("Focus for the next attempt")
    .fill("Settle your feet before moving on.");
  await page.getByLabel("Clip start").fill("1");
  await page.getByLabel("Clip end").fill("3");
  await page
    .getByRole("region", { name: "Unsaved changes" })
    .getByRole("button", { name: "Save", exact: true })
    .click();

  for (const n of [1, 2])
    await page
      .getByRole("radiogroup", { name: `Obstacle ${n} result` })
      .getByRole("radio", { name: "Pass" })
      .click();
  await page.getByRole("button", { name: "Save attempt", exact: true }).click();
  await page.getByText("Attempt saved.", { exact: true }).waitFor();

  const prepare = portfolio().getByRole("button", {
    name: "Prepare portfolio clip",
  });
  assert.ok(await prepare.isDisabled(), "no portfolio before analysis");
  await portfolio().getByText("Analyze this clip").waitFor();

  await page.getByRole("button", { name: "Request analysis" }).click();
  await page.getByRole("button", { name: "Start analysis" }).click();
  await page
    .locator(".rp-job em", { hasText: /^(Completed|Failed)$/ })
    .first()
    .waitFor({ timeout: 90000 });
  assert.equal(
    await page.locator(".rp-job em").first().innerText(),
    "Completed",
  );
  await page.getByRole("button", { name: "Open take" }).click();
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
    "PASS: roster association, supplied map, course route, attempt, analysis prerequisite, clipped overlay render, preview, publication, family isolation, family app playback, withdrawal, responsive layouts.",
  );
} catch (e) {
  console.error(await page.locator("main").innerText());
  throw e;
} finally {
  await browser.close();
}
