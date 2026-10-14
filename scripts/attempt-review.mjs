// Attempt scoring: validation, save, reload, update without duplicates,
// and a failed run kept out of the personal best. Needs npm run dev.
//   node scripts/attempt-review.mjs
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const result = (n, value) =>
  page
    .getByRole("radiogroup", { name: `Obstacle ${n} result` })
    .getByRole("radio", { name: value });

try {
  await page.goto("http://127.0.0.1:5180");
  await page.evaluate(async () => {
    const { put } = await import("/src/storage.js");
    const blob = await (await fetch("/test-results/sample.mp4")).blob();
    await put("takes", {
      id: "attempt-test",
      memberId: "theo",
      member: "Theo",
      course: "Training circuit",
      name: "Test",
      blob: new Blob([blob], { type: "video/mp4" }),
      duration: 10,
      start: 0,
      end: 10,
      createdAt: new Date().toISOString(),
      frames: [],
      notes: "",
      cue: "",
      grade: "Not reviewed",
      courseMap: {
        name: "Training circuit",
        background: "/gym-layout.png",
        points: [
          { label: "Rings", skill: "Swing transfer", x: 0.3, y: 0.3 },
          { label: "Wall", skill: "Wall run", x: 0.6, y: 0.5 },
        ],
      },
    });
  });
  await page.reload();
  await page.getByRole("button", { name: "Save attempt", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Choose a result" })
    .waitFor();
  await result(1, "Pass").click();
  await result(2, "Pass").click();
  await page.getByLabel("Obstacle 1 start").fill("1");
  await page.getByLabel("Obstacle 1 end").fill("3");
  await page.getByRole("button", { name: "Save attempt", exact: true }).click();
  await page.getByText("Attempt saved.", { exact: true }).waitFor();
  assert.equal(
    await page.evaluate(async () => {
      const { all } = await import("/src/storage.js");
      return (await all("attempts")).length;
    }),
    1,
  );

  await page.reload();
  await expect(result(1, "Pass")).toHaveAttribute("aria-checked", "true");
  await result(2, "Fail").click();
  await page
    .getByRole("button", { name: "Update attempt", exact: true })
    .click();
  await page.getByText("Attempt saved.", { exact: true }).waitFor();
  assert.equal(
    await page.locator(".rp-progress .stat-value").nth(2).innerText(),
    "—",
    "a failed run sets no personal best",
  );

  for (const width of [320, 390, 820, 1366]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator("#attempt").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/attempt-${width}.png` });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `overflow ${width}`,
    );
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS: scoring validation, save, reload, update without duplicates, failed attempt kept out of the PB, four viewport widths.",
  );
} finally {
  await browser.close();
}
