// Needs you on the Floor, in Chrome with the service: a cue waiting for a
// retry, a kid here today and not filmed, tries on a course without a clean
// run, and a kid not filmed in weeks, each with its reason; kids in the gym
// first; Up next from the list sets the Record button; filming the kid
// takes them off. Needs npm run dev and npm run service.
//   node scripts/needs-e2e.mjs [output-folder] [size,size]
import { launch } from "./review-kit.mjs";
import {
  REPLAY,
  SERVICE,
  assert,
  fresh,
  seedTake,
  serviceToken,
  signIn,
} from "./coach-kit.mjs";

const kit = await launch({ out: process.argv[2] ?? "test-results/needs" });
const SIZES = process.argv[3]?.split(",") ?? ["phone", "desktop", "small"];
const d = new Date();
const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const ago = (days) => new Date(Date.now() - days * 864e5).toISOString();
const coach = await serviceToken();
const here = (memberId, on) =>
  fetch(`${SERVICE}/here`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${coach}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ memberId, here: on, date: today }),
  });
const tried = (id, days) => ({
  id,
  takeId: id,
  memberId: "leo",
  member: "Leo Rivera",
  course: "Needs circuit",
  courseKey: "needs-circuit",
  createdAt: ago(days),
  completed: false,
  seconds: 20,
  obstacles: [],
});

for (const size of SIZES) {
  const { page, h } = await kit.page(size, { label: "needs" });
  page.setDefaultTimeout(15000);
  // Kids other suites don't use, so the service's shared runs and today's
  // gym list hold nothing else about them.
  for (const id of ["nora", "leo", "ava"]) await here(id, false);
  await here("maya", true);
  await fresh(page, REPLAY);
  await signIn(page);
  await seedTake(page, {
    member: "Nora Patel",
    memberId: "nora",
    createdAt: ago(2),
    grade: "Developing",
    cue: "Eyes on the next ring",
  });
  await seedTake(page, {
    member: "Ava Nguyen",
    memberId: "ava",
    createdAt: ago(30),
  });
  await seedTake(page, {
    id: "leo-1",
    member: "Leo Rivera",
    memberId: "leo",
    createdAt: ago(3),
    attempt: tried("leo-1", 3),
  });
  await seedTake(page, {
    id: "leo-2",
    member: "Leo Rivera",
    memberId: "leo",
    createdAt: ago(1),
    attempt: tried("leo-2", 1),
  });
  await page.reload();
  const list = page.getByRole("list", { name: "Needs you" });
  const row = (name) => list.getByRole("listitem").filter({ hasText: name });

  await h.step("each kid shows with their reason", async () => {
    await row("Nora Patel").getByText("Next: Eyes on the next ring").waitFor();
    await row("Maya Brooks").getByText("Here today, not filmed yet").waitFor();
    await row("Leo Rivera")
      .getByText("2 tries on Needs circuit, no clean run yet")
      .waitFor();
    await row("Ava Nguyen").getByText("Not filmed in 4 weeks").waitFor();
    assert(
      await row("Maya Brooks").getByText("Here", { exact: true }).isVisible(),
    );
  });

  await h.step("kids in the gym come first", async () => {
    const names = await list.locator(".rp-need-text b").allInnerTexts();
    const firstAway = names.findIndex((n) =>
      ["Nora Patel", "Leo Rivera", "Ava Nguyen"].includes(n),
    );
    assert(names.indexOf("Maya Brooks") < firstAway, names.join(", "));
  });
  await h.overflow("the Floor with Needs you");
  await h.shot("floor", { full: true });

  await h.step("Up next from the list sets who's filmed", async () => {
    await page.getByRole("button", { name: "Make Nora Patel up next" }).click();
    await page.getByRole("button", { name: "Record Nora" }).waitFor();
    assert(
      (await page
        .getByRole("button", { name: "Make Nora Patel up next" })
        .getAttribute("aria-pressed")) === "true",
    );
  });

  await h.step("filming the kid takes them off", async () => {
    await seedTake(page, {
      member: "Nora Patel",
      memberId: "nora",
      createdAt: new Date().toISOString(),
    });
    await page.reload();
    await row("Maya Brooks").waitFor();
    assert(!(await row("Nora Patel").count()), "Nora was filmed since the cue");
  });
  await here("maya", false);
  h.errors(`needs you at ${size}`);
}
await kit.close();
