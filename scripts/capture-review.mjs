// Draft gate, explicit analysis, the real pose worker, cancellation and the
// camera. Needs npm run dev. Uses Chrome's fake camera.
//   node scripts/capture-review.mjs
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
  ],
});
const context = await browser.newContext({
  permissions: ["camera"],
  viewport: { width: 1366, height: 900 },
});
const page = await context.newPage();
const errors = [];
let modelRequests = 0;
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (r) => {
  if (r.url().includes("/models/")) modelRequests++;
});
const stored = (store) =>
  page.evaluate(async (store) => {
    const { all } = await import("/src/storage.js");
    return all(store);
  }, store);
const saveBar = () =>
  page
    .getByRole("region", { name: "Unsaved changes" })
    .getByRole("button", { name: "Save", exact: true })
    .click();

try {
  await page.goto("http://127.0.0.1:5180");
  await page.getByText("No takes yet").waitFor();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles("test-results/sample.mp4");
  await page.getByRole("heading", { name: "Clip", exact: true }).waitFor();
  assert.equal((await stored("jobs")).length, 0, "a draft creates no job");
  assert.equal(modelRequests, 0, "a draft loads no model");

  await page.getByRole("button", { name: "Request analysis" }).click();
  await page.getByRole("alert").filter({ hasText: "Add a member" }).waitFor();
  await page.getByLabel("Member", { exact: true }).fill("Pilot member");
  await page.getByLabel("Course", { exact: true }).fill("Ground course");
  await page.getByLabel("Clip start").fill("1");
  await page.getByLabel("Clip end").fill("3");
  await page.getByRole("button", { name: "Save frame", exact: true }).click();
  await page.getByLabel("What went well").fill("Stayed balanced.");
  await page
    .getByLabel("Focus for the next attempt")
    .fill("Pause and settle before stepping forward.");
  await saveBar();
  await page.getByRole("status").filter({ hasText: "Take saved." }).waitFor();

  const take = (await stored("takes"))[0];
  assert.equal(take.cue, "Pause and settle before stepping forward.");
  assert.equal(take.frames.length, 1);
  assert.equal(take.start, 1);

  await page.getByRole("button", { name: "Request analysis" }).click();
  await page.getByRole("button", { name: "Start analysis" }).waitFor();
  assert.equal(modelRequests, 0, "requesting doesn't start work");
  assert.equal((await stored("jobs"))[0].start, 1);

  await page.reload();
  await page.locator(".primary-nav .nav-item", { hasText: "Requests" }).click();
  await page.getByRole("button", { name: "Start analysis" }).click();
  await page
    .locator(".rp-job em", { hasText: /^(Completed|Failed)$/ })
    .first()
    .waitFor({ timeout: 90000 });
  const job = (await stored("jobs"))[0];
  assert.equal(job.status, "completed", job.error);
  assert.ok(job.result.samples.every((s) => s.time >= 1 && s.time < 3));
  assert.ok(modelRequests > 0);

  await page.getByRole("button", { name: "Open take" }).click();
  await page.getByText("% tracked").waitFor();
  await page.getByLabel("Clip start").fill("0");
  await page.getByRole("button", { name: "Request analysis" }).click();
  await page.getByRole("button", { name: "Cancel request" }).click();
  await page.locator(".rp-job em", { hasText: "Cancelled" }).waitFor();
  assert.equal(
    (await stored("jobs")).filter((j) => j.status === "cancelled").length,
    1,
  );

  await page.getByRole("button", { name: "Record a take" }).click();
  await page.getByRole("button", { name: "Start recording" }).click();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "Discard and restart" }).click();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "Discard and close" }).click();
  await page.waitForTimeout(300);
  assert.equal((await stored("takes")).length, 1, "discarded takes vanish");
  assert.equal((await stored("jobs")).length, 2);

  await page.getByRole("button", { name: "Record a take" }).click();
  await page.getByRole("button", { name: "Start recording" }).click();
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Keep take" }).click();
  await page.getByRole("status").filter({ hasText: "Take saved" }).waitFor();
  assert.equal((await stored("takes")).length, 2, "a kept take is saved");

  assert.deepEqual(errors, []);
  console.log(
    "PASS: draft gate, validation, save bar, reload, real pose worker on the selected interval, cancellation, camera discard/restart/keep; no page errors.",
  );
} catch (e) {
  console.error(await page.locator("main").innerText());
  throw e;
} finally {
  await browser.close();
}
