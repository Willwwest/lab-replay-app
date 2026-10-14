// Model clips, in Chrome: a take recorded with no kid becomes a model on
// its Share tab with a title and what to watch for; it leaves To assign and
// the Floor's banner and shows under Models; a kid's take of the same
// course plays beside it by default, captioned as the model, and a saved
// still says so; turning it off puts it back in To assign. Needs npm run dev.
//   node scripts/models-e2e.mjs [output-folder] [size,size]
import { launch } from "./review-kit.mjs";
import {
  REPLAY,
  assert,
  fresh,
  nav,
  saveDraft,
  seedTake,
  signIn,
  stored,
} from "./coach-kit.mjs";

const kit = await launch({ out: process.argv[2] ?? "test-results/models" });
const SIZES = process.argv[3]?.split(",") ?? ["phone", "desktop"];
const map = {
  name: "LAB circuit",
  background: "/gym-layout.png",
  version: 1,
  points: [
    { id: "a", label: "Rings", skill: "Lache", x: 0.3, y: 0.5 },
    { id: "b", label: "Wall", skill: "", x: 0.6, y: 0.4 },
  ],
};

for (const size of SIZES) {
  const { page, h } = await kit.page(size, { label: "models" });
  page.setDefaultTimeout(15000);
  await fresh(page, REPLAY);
  await signIn(page);
  const demo = await seedTake(page, {
    member: "",
    memberId: "",
    courseMap: map,
    createdAt: new Date(Date.now() - 864e5).toISOString(),
  });
  const theo = await seedTake(page, { courseMap: map });
  await page.reload();
  const filters = page.getByRole("radiogroup", { name: "Show" });

  await h.step("a take with no kid becomes a model clip", async () => {
    await page.getByText("1 take to assign").waitFor();
    await page.goto(`${REPLAY}#/take/${demo}/share`);
    const card = page.getByRole("region", { name: "Model clip" });
    await card.getByText("Use as a model clip").click();
    await card.getByLabel("Title").fill("Clean rings");
    await card.getByLabel("What to watch for").fill("Hips stay high.");
    await saveDraft(page);
    await page.getByRole("heading", { name: "Clean rings" }).waitFor();
    const m = (await stored(page)).find((t) => t.id === demo).model;
    assert(m.title === "Clean rings" && m.note === "Hips stay high.");
    assert(m.by === "Coach Jordan");
  });
  await h.shot("share", { full: true });

  await h.step("it leaves To assign and shows under Models", async () => {
    await nav(page, "Floor");
    assert(!(await page.getByText(/take(s)? to assign/).count()), "no banner");
    await nav(page, "Takes");
    await filters.getByRole("radio", { name: "To assign · 0" }).waitFor();
    await filters.getByRole("radio", { name: "Models · 1" }).click();
    const card = page
      .getByRole("list", { name: "Takes" })
      .getByRole("listitem");
    assert((await card.count()) === 1);
    assert((await card.innerText()).includes("Clean rings"));
    assert(!(await card.getByRole("button", { name: "Assign" }).count()));
  });
  await h.overflow("Takes, models");

  await h.step("a kid's take plays beside the model by default", async () => {
    await page.goto(`${REPLAY}#/take/${theo}/watch`);
    await page.getByRole("button", { name: "Side by side" }).click();
    assert(
      (await page.getByLabel("Compare with").inputValue()) === demo,
      "the model is picked",
    );
    await page.getByText("Model clip", { exact: true }).waitFor();
    await page
      .locator(".rp-compare-b figcaption", { hasText: "Model: Clean rings" })
      .waitFor();
    await page.getByRole("button", { name: "Save as key frame" }).click();
    const note = page.locator(".rp-frame textarea").first();
    assert(
      (await note.inputValue()).includes('model clip "Clean rings"'),
      await note.inputValue(),
    );
    assert((await note.inputValue()).includes("Hips stay high."));
  });
  await h.shot("compare");

  await h.step("turning it off puts it back in To assign", async () => {
    await saveDraft(page);
    await page.goto(`${REPLAY}#/take/${demo}/share`);
    await page
      .getByRole("region", { name: "Model clip" })
      .getByText("Use as a model clip")
      .click();
    await saveDraft(page);
    await nav(page, "Takes");
    await filters.getByRole("radio", { name: "To assign · 1" }).waitFor();
  });
  h.errors(`models at ${size}`);
}
await kit.close();
