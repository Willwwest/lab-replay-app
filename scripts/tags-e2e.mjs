// Tags and search, in Chrome: suggested tags from the take's course, a
// typed tag, removing one, saving with the take; then Takes narrowed by a
// search across fields, #tag, a tag chip and a month, the empty result and
// clearing it, and the search kept while a take is open. Needs npm run dev.
//   node scripts/tags-e2e.mjs [output-folder] [size,size]
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

const kit = await launch({ out: process.argv[2] ?? "test-results/tags" });
const SIZES = process.argv[3]?.split(",") ?? ["phone", "desktop", "small"];
const lastMonth = new Date();
lastMonth.setDate(1);
lastMonth.setMonth(lastMonth.getMonth() - 1);

for (const size of SIZES) {
  const { page, h } = await kit.page(size, { label: "tags" });
  page.setDefaultTimeout(15000);
  await fresh(page, REPLAY);
  await signIn(page);
  const theo = await seedTake(page, {
    courseMap: {
      name: "LAB circuit",
      background: "/gym-layout.png",
      version: 1,
      points: [
        { id: "a", label: "Rings", skill: "Swing transfer", x: 0.3, y: 0.5 },
        { id: "b", label: "Wall", skill: "", x: 0.6, y: 0.4 },
      ],
    },
    cue: "Eyes on the next ring",
  });
  await seedTake(page, {
    member: "Maya Brooks",
    memberId: "maya",
    course: "Warped wall",
    tags: ["wall"],
    createdAt: lastMonth.toISOString(),
  });
  await seedTake(page, { member: "Ava Chen", memberId: "ava", tags: ["wall"] });
  const cards = page.getByRole("list", { name: "Takes" }).getByRole("listitem");
  const names = async () =>
    (await cards.locator(".rp-tc-text b").allInnerTexts()).sort();

  await h.step("suggested and typed tags go on the take", async () => {
    await page.goto(`${REPLAY}#/take/${theo}/coach`);
    await page.reload();
    const suggested = page.getByRole("group", { name: "Suggested tags" });
    await suggested.getByRole("button", { name: "+ Rings" }).click();
    await page.getByLabel("Tags", { exact: true }).fill("lache");
    await page.getByLabel("Tags", { exact: true }).press("Enter");
    await page.getByLabel("Tags", { exact: true }).fill("RINGS");
    await page.getByRole("button", { name: "Add tag" }).click();
    const list = page.getByRole("list", { name: "Tags on this take" });
    assert((await list.getByRole("listitem").count()) === 2, "no duplicate");
    assert(
      !(await suggested.getByRole("button", { name: "+ Rings" }).count()),
      "a used suggestion goes away",
    );
    await saveDraft(page);
    const take = (await stored(page)).find((t) => t.id === theo);
    assert(take.tags.join() === "Rings,lache", take.tags.join());
  });
  await h.shot("coach-tags", { full: true });

  await h.step("a tag comes off with one tap", async () => {
    await page.getByRole("button", { name: "Remove the tag lache" }).click();
    await saveDraft(page);
    const take = (await stored(page)).find((t) => t.id === theo);
    assert(take.tags.join() === "Rings");
  });

  await h.step("search finds takes by any field and by #tag", async () => {
    await nav(page, "Takes");
    await page.getByRole("radio", { name: /^All/ }).click();
    const q = page.getByRole("searchbox", { name: "Search takes" });
    assert((await cards.count()) === 3);
    await q.fill("swing");
    assert(
      (await names()).join() === "Theo Parker",
      `by obstacle skill: ${await names()}`,
    );
    await q.fill("#wal");
    assert((await names()).join() === "Ava Chen,Maya Brooks", "by tag");
    await q.fill("#wall maya");
    assert((await names()).join() === "Maya Brooks", "tag and name");
    await q.fill("");
  });

  await h.step("a tag chip and a month narrow it; counts follow", async () => {
    await page
      .getByRole("group", { name: "Tags" })
      .getByRole("button", { name: "wall · 2" })
      .click();
    assert((await names()).join() === "Ava Chen,Maya Brooks");
    assert(await page.getByRole("radio", { name: "All · 2" }).isVisible());
    await page.getByLabel("Month").selectOption({ index: 2 }); // last month
    assert((await names()).join() === "Maya Brooks", "last month only");
    await page
      .getByRole("group", { name: "Tags" })
      .getByRole("button", { name: "wall · 2" })
      .click();
    await page.getByLabel("Month").selectOption("");
  });
  await h.overflow("Takes with search");
  await h.shot("takes-search");

  await h.step("nothing matching says so, and clears", async () => {
    await page
      .getByRole("searchbox", { name: "Search takes" })
      .fill("nobody here");
    await page.getByText("No takes match").waitFor();
    await page.getByRole("button", { name: "Clear search" }).click();
    assert((await cards.count()) === 3);
  });

  await h.step("the search is kept while a take is open", async () => {
    await page.getByRole("searchbox", { name: "Search takes" }).fill("maya");
    await cards.first().getByRole("button").first().click();
    await page.getByRole("heading", { name: "Maya Brooks" }).waitFor();
    await page.goBack();
    assert(
      (await page
        .getByRole("searchbox", { name: "Search takes" })
        .inputValue()) === "maya",
    );
    assert((await names()).join() === "Maya Brooks");
  });
  h.errors(`tags at ${size}`);
}
await kit.close();
