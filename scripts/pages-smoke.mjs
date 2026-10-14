// The hosted build (GitHub Pages, no service), served under a sub-path:
// assets load from the base path, shared features say they're off, a
// filmed run with the timer burned in saves, and the pose model loads and
// analyzes a clip. Chrome's fake camera stands in.
//   BASE=https://willwwest.github.io/lab-replay-app/ node scripts/pages-smoke.mjs
import { chromium } from "@playwright/test";
import { launch } from "./review-kit.mjs";

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

const BASE = process.env.BASE ?? "http://127.0.0.1:5190/lab-replay-app/";
const kit = await launch({
  out: process.argv[2] ?? "test-results/pages-smoke",
});
const assert = (ok, msg) => {
  if (!ok) throw Error(msg);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const { page, h, context } = await kit.page("phone", { label: "hosted" });
await context.grantPermissions(["camera"]);
page.setDefaultTimeout(20000);
page.on("dialog", (d) => d.accept());
const missing = [];
page.on("response", (r) => r.status() === 404 && missing.push(r.url()));

await h.step(
  "the app loads with its logo, font and map from the base path",
  async () => {
    await page.goto(BASE);
    await page.getByRole("heading", { name: "Session library" }).waitFor();
    const logo = await page
      .locator(".brand img")
      .evaluate((i) => [i.naturalWidth, i.src]);
    assert(logo[0] > 0, `logo ${logo[1]}`);
    assert(
      await page.evaluate(() => document.fonts.check('800 40px "Argentum"')),
      "Argentum loaded",
    );
  },
);

await h.step("shared features say they're off", async () => {
  await page.locator(".chip-select", { hasText: "This device" }).click();
  await page.getByText("Shared features are off in this copy").waitFor();
  assert(
    (await page.getByRole("menuitemradio").count()) === 0,
    "no coach sign-ins",
  );
  await page.keyboard.press("Escape");
});

await h.step("a filmed run saves with the timer burned in", async () => {
  await page.locator(".primary-nav .nav-item", { hasText: "Run" }).click();
  await page.getByLabel("Who's running").fill("Phone test");
  await page.getByLabel("Course", { exact: true }).selectOption("quick");
  await page.getByLabel("What are you timing?").fill("Warped wall");
  const sw = async (label, on) => {
    const box = page.getByRole("switch", { name: label });
    if ((await box.isChecked()) !== on) await box.locator("..").click();
  };
  await sw("Film the run", true);
  await sw("Timer on the video", true);
  await sw("3-2-1 countdown", false);
  await page.getByRole("button", { name: "Start the run" }).click();
  await page.getByRole("button", { name: "Go" }).click();
  await page.locator(".rp-run-rec", { hasText: "Timer in video" }).waitFor();
  await wait(1500);
  await page.getByRole("button", { name: "Finish" }).click();
  await page.getByLabel("Recording of this run").waitFor();
  await page.getByRole("button", { name: "Save run" }).click();
  await page.getByText("Saved as a take").waitFor();
  await page.getByRole("button", { name: "Open in Review" }).click();
  await page.getByRole("heading", { name: "Video and coaching" }).waitFor();
});

await h.step("the gym map loads from the base path", async () => {
  const href = await page.locator(".rp-map image").getAttribute("href");
  assert(
    href.includes("/lab-replay-app/") || !BASE.includes("lab-replay-app"),
    href,
  );
  const ok = await page.evaluate(
    (src) =>
      new Promise((res) => {
        const i = new Image();
        i.onload = () => res(i.naturalWidth > 0);
        i.onerror = () => res(false);
        i.src = src;
      }),
    href,
  );
  assert(ok, `map image ${href}`);
});

await h.step("pose analysis loads its model and finishes", async () => {
  // The filmed take already has its member and course; save only if edited.
  assert(
    (await page.getByLabel("Course", { exact: true }).inputValue()) ===
      "Warped wall",
    "course carried over from the run",
  );
  const bar = page.getByRole("region", { name: "Unsaved changes" });
  if (await bar.count())
    await bar.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("button", { name: "Request analysis" }).click();
  await page.getByRole("button", { name: "Start analysis" }).click();
  await page
    .locator(".rp-job em", { hasText: /^(Completed|Failed)$/ })
    .first()
    .waitFor({ timeout: 120000 });
  const status = await page.locator(".rp-job em").first().innerText();
  const error = await page.locator(".rp-job .is-error").allInnerTexts();
  assert(status === "Completed", `analysis ${status} ${error.join(" ")}`);
});

await h.step("nothing the app asked for was missing", async () => {
  assert(missing.length === 0, missing.join(", "));
});
await h.overflow("hosted");
await h.shot("hosted", { full: true });
h.errors("hosted");
await kit.close();
