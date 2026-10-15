// The hosted build (GitHub Pages, no service), served under a sub-path:
// the coach gate with the bundled roster, assets from the base path, the
// gym list kept on this device, a recording with the timer burned in, and
// the pose model analyzing a checked clip. Chrome's fake camera stands in.
//   BASE=https://willwwest.github.io/lab-replay-app/ node scripts/pages-smoke.mjs
import { launch } from "./review-kit.mjs";
import { assert, fakeCamera, fresh, signIn, wait } from "./coach-kit.mjs";

fakeCamera();

const BASE = process.env.BASE ?? "http://127.0.0.1:5190/lab-replay-app/";
const kit = await launch({
  out: process.argv[2] ?? "test-results/pages-smoke",
});

const { page, h, context } = await kit.page("phone", { label: "hosted" });
await context.grantPermissions(["camera"]);
page.setDefaultTimeout(20000);
page.on("dialog", (d) => d.accept());
const missing = [];
page.on("response", (r) => r.status() === 404 && missing.push(r.url()));

await h.step(
  "the app asks who's coaching, with its logo and font from the base path",
  async () => {
    await fresh(page, BASE);
    await page.getByRole("heading", { name: "Who's coaching?" }).waitFor();
    // Over the network the logo can still be loading when the page draws.
    await page.waitForFunction(() => {
      const i = document.querySelector(".rp-gate-logo");
      return i?.complete && i.naturalWidth > 0;
    });
    // Fonts load after the first paint over a real network.
    await page.evaluate(() => document.fonts.ready);
    assert(
      await page.evaluate(() => document.fonts.check('800 40px "Argentum"')),
      "Argentum loaded",
    );
    await signIn(page, "Coach Jordan");
  },
);

await h.step("this copy says it works on this device only", async () => {
  await page.getByRole("button", { name: "Coach Jordan menu" }).click();
  await page.getByText("This copy works on this device only.").waitFor();
  await page.keyboard.press("Escape");
});

await h.step("the gym list works on this device", async () => {
  await page.getByRole("button", { name: "Add kids" }).click();
  await page
    .getByRole("dialog", { name: "Who's in the gym?" })
    .getByRole("button", { name: /Theo Parker/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("radio", { name: /Theo/ }).click();
  await page.reload();
  await page.getByRole("radio", { name: /Theo/ }).waitFor();
});

await h.step("a recording saves with the timer burned in", async () => {
  await page.getByRole("radio", { name: /Theo/ }).click();
  await page.getByRole("button", { name: "Record Theo" }).click();
  await page.getByRole("dialog", { name: "Camera" }).waitFor();
  await page.getByRole("button", { name: "Capture settings" }).click();
  const settings = page.getByRole("dialog", { name: "Capture settings" });
  const sw = settings.getByRole("switch", { name: "Timer on the video" });
  if (!(await sw.isChecked())) await sw.locator("..").click();
  await settings.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Start recording" }).click();
  await page.locator(".rp-cap-rec", { hasText: "Timer in video" }).waitFor();
  await wait(1500);
  await page.getByRole("button", { name: "Stop recording" }).click();
  await page.getByLabel("Recording of this run").waitFor();
  await page.getByRole("button", { name: "Keep", exact: true }).click();
  await page.getByRole("button", { name: "Open take" }).click();
  await page.getByRole("heading", { name: "Theo Parker" }).waitFor();
});

await h.step("the gym map loads from the base path", async () => {
  await page.getByRole("radio", { name: "Course", exact: true }).click();
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

await h.step("check, send, and the pose model analyzes the clip", async () => {
  await page.getByRole("radio", { name: "Watch", exact: true }).click();
  await page.getByRole("heading", { name: "Raw recording" }).waitFor();
  for (const l of [
    /trimmed to the run/,
    /in frame from start/,
    /Steady and close/,
  ])
    await page.getByRole("checkbox", { name: l }).check();
  await page.getByRole("button", { name: "Mark as checked" }).click();
  await page.getByRole("button", { name: "Send for analysis…" }).click();
  await page.getByRole("button", { name: /^Send the [\d.]+s clip$/ }).click();
  await page
    .getByRole("heading", { name: "Analyzed" })
    .waitFor({ timeout: 120000 });
});

await h.step("nothing the app asked for was missing", async () => {
  assert(missing.length === 0, missing.join(", "));
});
await h.overflow("hosted");
await h.shot("hosted", { full: true });
h.errors("hosted");
await kit.close();
