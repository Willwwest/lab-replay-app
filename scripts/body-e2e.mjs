// The body on a key frame, in Chrome: Body finds the pose on a still of a
// person and lists each joint's angle; a reading becomes an angle mark;
// the Angle tool snaps to a joint; Done keeps the pose and draws the body
// into the still; hiding the body keeps the pose; a frame with nobody on
// it says so. Needs npm run dev and test-results/fixtures/person.mp4
// (MediaPipe's pose.jpg sample as a 3s video).
//   node scripts/body-e2e.mjs [output-folder] [size,size]
import { launch } from "./review-kit.mjs";
import {
  REPLAY,
  assert,
  fresh,
  saveDraft,
  seedTake,
  signIn,
  stored,
  tapOn,
} from "./coach-kit.mjs";

const kit = await launch({ out: process.argv[2] ?? "test-results/body" });
const SIZES = process.argv[3]?.split(",") ?? ["phone", "desktop"];

for (const size of SIZES) {
  const { page, h } = await kit.page(size, { label: "body" });
  page.setDefaultTimeout(20000);
  page.on("dialog", (d) => d.accept());
  await fresh(page, REPLAY);
  await signIn(page);
  const id = await seedTake(page, {
    video: "/test-results/fixtures/person.mp4",
    duration: 3,
    end: 3,
  });
  const blank = await seedTake(page, {
    createdAt: new Date(Date.now() - 864e5).toISOString(),
  });
  const editor = page.getByRole("dialog", { name: /^Draw on the frame/ });
  const canvas = editor.locator("canvas");
  const marks = () => canvas.getAttribute("aria-label");
  const readings = editor.getByRole("list", { name: "Joint angles" });
  const take = async () =>
    (await stored(page)).find((t) => t.id === id).frames[0];

  async function drawAt(takeId, time) {
    await page.goto(`${REPLAY}#/take/${takeId}/watch`);
    await page.reload();
    await page.waitForFunction(
      () => document.querySelector(".rp-video video")?.readyState >= 2,
    );
    await page.evaluate((t) => {
      const v = document.querySelector(".rp-video video");
      v.currentTime = t;
      return new Promise((r) => (v.onseeked = r));
    }, time);
    await page
      .locator(".rp-player")
      .getByRole("button", { name: "Draw" })
      .click();
    await page.waitForFunction(
      () => document.querySelector(".rp-draw-frame canvas")?.width > 0,
    );
  }

  await h.step("Body finds the pose and reads the joints", async () => {
    await drawAt(id, 1);
    await editor.getByRole("button", { name: "Body" }).click();
    await readings.waitFor({ timeout: 60000 });
    const text = await readings.innerText();
    const knees = [...text.matchAll(/(Left|Right) knee (\d+)°/g)].map(
      (m) => +m[2],
    );
    assert(knees.length === 2, `both knees read: ${text}`);
    const [bent, straight] = [Math.min(...knees), Math.max(...knees)];
    assert(bent >= 70 && bent <= 130, `the front knee is bent (${bent}°)`);
    assert(straight >= 150, `the back leg is near straight (${straight}°)`);
    assert(/elbow \d+°/.test(text), "elbows read too");
  });
  await h.shot("body");

  await h.step(
    "a reading becomes an angle mark with the same degrees",
    async () => {
      const button = readings.getByRole("button", { name: /knee/ }).first();
      const want = (await button.innerText()).match(/(\d+)°/)[1];
      await button.click();
      assert((await marks()).includes(`angle, ${want}°`), await marks());
    },
  );

  await h.overflow("the editor with the body");
  await h.step(
    "Done keeps the pose and draws the body into the still",
    async () => {
      await editor.getByRole("button", { name: "Done" }).click();
      await editor.waitFor({ state: "detached" });
      await saveDraft(page);
      const f = await take();
      assert(f.pose.landmarks.length === 33, "33 points kept");
      assert(f.drawing.body === true && f.drawing.shapes.length === 1);
      assert(f.marked?.startsWith("data:image/jpeg"));
    },
  );
  await h.shot("key-frame", { full: true });

  await h.step("the Angle tool snaps to a joint", async () => {
    const f = await take();
    await page.getByRole("button", { name: /^Draw on the frame at/ }).click();
    await readings.waitFor();
    // Shown at once: the pose is stored, nothing is detected again.
    const knee = f.pose.landmarks[25];
    const reading = (
      await readings.getByRole("button", { name: /^Left knee/ }).innerText()
    ).match(/(\d+)°/)[1];
    await editor.getByRole("radio", { name: "Angle", exact: true }).click();
    await tapOn(page, canvas, [knee.x + 0.005, knee.y]);
    const m = (await marks()).match(/angle, \d+°/g);
    assert(m.length === 2 && m[1] === `angle, ${reading}°`, `snapped: ${m}`);
  });

  await h.step("hiding the body keeps the pose for later", async () => {
    await editor.getByRole("button", { name: "Body" }).click();
    await readings.waitFor({ state: "detached" });
    await editor.getByRole("button", { name: "Done" }).click();
    await editor.waitFor({ state: "detached" });
    await saveDraft(page);
    const f = await take();
    assert(f.drawing.body === false && f.pose.landmarks.length === 33);
  });

  await h.step("a frame with nobody on it says so", async () => {
    await drawAt(blank, 1);
    await editor.getByRole("button", { name: "Body" }).click();
    await editor
      .getByText(/No body found on this frame/)
      .waitFor({ timeout: 60000 });
  });
  h.errors(`the body at ${size}`);
}
await kit.close();
