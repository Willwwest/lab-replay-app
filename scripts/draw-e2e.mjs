// Drawing on key frames, in Chrome at phone and desktop sizes: Draw under
// the video saves the frame and opens the editor; each tool makes a mark;
// Move drags one; undo, delete and recolor; Done keeps the marks and a
// drawn-on still; the drawing reopens for changes; the back button closes
// the editor without leaving the take; a comparison still can be drawn on
// too. Needs npm run dev.
//   node scripts/draw-e2e.mjs [output-folder] [size,size]
import { launch } from "./review-kit.mjs";
import {
  REPLAY,
  assert,
  dragOn,
  fresh,
  saveDraft,
  seedTake,
  signIn,
  stored,
  tapOn,
} from "./coach-kit.mjs";

const kit = await launch({ out: process.argv[2] ?? "test-results/draw" });
const SIZES = process.argv[3]?.split(",") ?? ["phone", "desktop", "small"];

for (const size of SIZES) {
  const { page, h } = await kit.page(size, { label: "draw" });
  page.setDefaultTimeout(15000);
  page.on("dialog", (d) => d.accept());
  await fresh(page, REPLAY);
  await signIn(page);
  const id = await seedTake(page);
  await seedTake(page, {
    id: `${id}-b`,
    createdAt: new Date(Date.now() - 864e5).toISOString(),
  });
  await page.goto(`${REPLAY}#/take/${id}/watch`);
  await page.reload();
  const editor = page.getByRole("dialog", { name: /^Draw on the frame/ });
  const canvas = editor.locator("canvas");
  const marks = () => canvas.getAttribute("aria-label");
  const tool = (name) =>
    editor
      .getByRole("radiogroup", { name: "Tool" })
      .getByRole("radio", { name, exact: true })
      .click();

  await h.step(
    "Draw under the video saves the frame and opens the editor",
    async () => {
      await page.getByRole("heading", { name: "Theo Parker" }).waitFor();
      await page.waitForFunction(
        () => document.querySelector(".rp-video video")?.readyState >= 2,
      );
      await page.evaluate(() => {
        const v = document.querySelector(".rp-video video");
        v.currentTime = 1.5;
        return new Promise((r) => (v.onseeked = r));
      });
      await page
        .locator(".rp-player")
        .getByRole("button", { name: "Draw" })
        .click();
      await editor.waitFor();
      await page.waitForFunction(
        () => document.querySelector(".rp-draw-frame canvas")?.width > 0,
      );
      assert((await marks()) === "No marks yet", "starts empty");
    },
  );
  await h.shot("editor-empty");

  await h.step("each tool makes a mark", async () => {
    await tool("Arrow");
    await dragOn(page, canvas, [0.2, 0.7], [0.45, 0.35]);
    await tool("Line");
    await dragOn(page, canvas, [0.1, 0.9], [0.9, 0.9]);
    await tool("Circle");
    await dragOn(page, canvas, [0.7, 0.4], [0.8, 0.4]);
    await tool("Angle");
    await tapOn(page, canvas, [0.5, 0.6]);
    await tool("Text");
    await editor.getByLabel("Label text").fill("Hips up");
    await tapOn(page, canvas, [0.1, 0.15]);
    await tool("Freehand");
    await dragOn(page, canvas, [0.3, 0.2], [0.6, 0.25], 14);
    const label = await marks();
    for (const want of [
      "arrow",
      "line",
      "circle",
      "angle",
      "label “Hips up”",
      "freehand",
    ])
      assert(label.includes(want), `has the ${want}: ${label}`);
    assert(/angle, \d+°/.test(label), "the angle reads in degrees");
  });
  await h.shot("editor-marks");

  await h.step(
    "the angle's dots reshape it and its reading follows",
    async () => {
      await tool("Move");
      const before = (await marks()).match(/angle, (\d+)°/)[1];
      // The vertex is where the angle was tapped: select it, drag it down.
      await tapOn(page, canvas, [0.5, 0.6]);
      await dragOn(page, canvas, [0.5, 0.6], [0.5, 0.75]);
      const after = (await marks()).match(/angle, (\d+)°/)[1];
      assert(before !== after, `the reading changed (${before}° → ${after}°)`);
    },
  );

  await h.step("undo, recolor and delete", async () => {
    const n = (await marks()).split(";").length;
    await editor.getByRole("button", { name: "Undo" }).click();
    await editor.getByRole("button", { name: "Undo" }).click();
    assert(
      (await marks()).split(";").length === n - 1,
      "the freehand is undone",
    );
    await tool("Move");
    await tapOn(page, canvas, [0.5, 0.9]); // the line
    await editor.getByRole("radio", { name: "Gold" }).click();
    assert((await marks()).includes("Gold line"), "the line turns gold");
    await editor
      .getByRole("button", { name: "Delete the selected mark" })
      .click();
    assert(!(await marks()).includes("line"), "the line is gone");
  });

  await h.overflow("the editor");
  await h.step("Done keeps the marks and a drawn-on still", async () => {
    await editor.getByRole("button", { name: "Done" }).click();
    await editor.waitFor({ state: "detached" });
    await page.getByText("Drawn on", { exact: true }).waitFor();
    await saveDraft(page);
    const [take] = (await stored(page)).filter((t) => t.id === id);
    const f = take.frames[0];
    assert(
      f.drawing.shapes.length === 4,
      `four marks kept (${f.drawing.shapes.length})`,
    );
    assert(f.marked.startsWith("data:image/jpeg"), "a drawn-on still");
    assert(f.image !== f.marked, "the clean still is kept");
    const src = await page.locator(".rp-frame img").first().getAttribute("src");
    assert(src === f.marked, "the card shows the drawn-on still");
  });
  await h.shot("key-frames", { full: true });

  await h.step(
    "the drawing reopens; back closes it and stays on the take",
    async () => {
      await page.getByRole("button", { name: /^Draw on the frame at/ }).click();
      await editor.waitFor();
      assert((await marks()).split(";").length === 4, "marks reopen");
      await page.goBack();
      await editor.waitFor({ state: "detached" });
      await page.getByRole("heading", { name: "Theo Parker" }).waitFor();
      assert(page.url().includes(`#/take/${id}/watch`), "still on the take");
    },
  );

  await h.step("clearing every mark goes back to the clean still", async () => {
    await page.getByRole("button", { name: /^Draw on the frame at/ }).click();
    await editor.getByRole("button", { name: "Clear all marks" }).click();
    await editor.getByRole("button", { name: "Done" }).click();
    await editor.waitFor({ state: "detached" });
    await page.getByText("Coach pick", { exact: true }).waitFor();
    await saveDraft(page);
    const [take] = (await stored(page)).filter((t) => t.id === id);
    assert(!take.frames[0].marked && !take.frames[0].drawing, "nothing drawn");
  });

  await h.step("a side-by-side still can be drawn on", async () => {
    await page.getByRole("button", { name: "Side by side" }).click();
    await page.getByRole("button", { name: "Save as key frame" }).click();
    const draw = page.getByRole("button", { name: /^Draw on the frame at/ });
    await draw.nth(1).click();
    await editor.waitFor();
    await tool("Arrow");
    await dragOn(page, canvas, [0.3, 0.5], [0.7, 0.5]);
    await editor.getByRole("button", { name: "Done" }).click();
    await editor.waitFor({ state: "detached" });
    assert((await page.getByText("Drawn on", { exact: true }).count()) === 1);
  });
  h.errors(`drawing at ${size}`);
}
await kit.close();
