// "Seen by the family", in Chrome with the service: a coach's latest
// message says Not seen until a guardian opens the thread, then Seen; a
// published portfolio clip says Not watched until a guardian plays it,
// then who watched and how often; another family's reads don't count, and
// a coach's own views don't either. Needs npm run dev and npm run service.
//   node scripts/seen-e2e.mjs [output-folder] [size,size]
import { launch } from "./review-kit.mjs";
import {
  REPLAY,
  SERVICE,
  assert,
  fresh,
  nav,
  seedReadyTake,
  serviceToken,
  signIn,
  stored,
} from "./coach-kit.mjs";

const kit = await launch({ out: process.argv[2] ?? "test-results/seen" });
const SIZES = process.argv[3]?.split(",") ?? ["phone", "desktop"];
const call = async (token, path, options = {}) =>
  fetch(SERVICE + path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

for (const size of SIZES) {
  const { page, h } = await kit.page(size, { label: "seen" });
  page.setDefaultTimeout(20000);
  const coach = await serviceToken();
  const dana = await serviceToken("+16025550101");
  const jamie = await serviceToken("+16025550140");
  const brooks = await serviceToken("+16025550102");
  const text = `Seen check ${Date.now() % 100000}`;
  const message = await (
    await call(coach, "/threads/theo", {
      method: "POST",
      body: JSON.stringify({ text }),
    })
  ).json();
  await fresh(page, REPLAY);
  await signIn(page);
  const thread = page.getByRole("region", { name: "Conversation" });

  await h.step(
    "the latest coach message says the family hasn't seen it",
    async () => {
      await nav(page, "Messages");
      await page
        .getByRole("button", { name: /Theo Parker/ })
        .first()
        .click();
      await thread.getByText(text).waitFor();
      await thread.getByText("Not seen by the family yet").waitFor();
      // Another family opening their own thread doesn't count.
      await call(brooks, "/threads/maya");
      await page.waitForTimeout(3500);
      await thread.getByText("Not seen by the family yet").waitFor();
    },
  );

  await h.step("once a guardian opens the thread it says Seen", async () => {
    await call(dana, "/threads/theo");
    await thread
      .getByText(/^Seen by the family · /)
      .waitFor({ timeout: 10000 });
  });
  await h.shot("thread");
  await h.overflow("the thread");

  let id;
  await h.step("a published clip says nobody has watched it yet", async () => {
    const take = await seedReadyTake(page);
    await page.goto(`${REPLAY}#/take/${take}/share`);
    await page.reload();
    const card = page.locator(".rp-portfolio");
    await card.getByRole("button", { name: "Prepare portfolio clip" }).click();
    await card
      .getByRole("button", { name: "Publish to member portfolio" })
      .click({ timeout: 90000 });
    await card.getByText("Not watched by the family yet.").waitFor();
    id = (await stored(page)).find((t) => t.id === take).portfolioId;
    // The coach watching their own clip isn't the family.
    await call(coach, `/reviews/${id}/video`);
    await page.reload();
    await card.getByText("Not watched by the family yet.").waitFor();
  });

  await h.step("guardians' plays show by name, latest first", async () => {
    const card = page.locator(".rp-portfolio");
    assert((await call(dana, `/reviews/${id}/video`)).status === 200);
    await page.reload();
    await card.getByText(/^Watched once by Dana Parker, last on /).waitFor();
    await call(jamie, `/reviews/${id}/video`);
    await call(dana, `/reviews/${id}/video`);
    await page.reload();
    await card
      .getByText(/^Watched 3 times by Dana Parker and Jamie Parker/)
      .waitFor();
    assert(
      (await call(brooks, `/reviews/${id}/video`)).status === 404,
      "another family can't play it",
    );
  });
  await h.shot("portfolio", { full: true });

  await h.step("families never see who else watched", async () => {
    const r = await (await call(dana, `/reviews/${id}`)).json();
    assert(!("views" in r), "no views for a family");
    const t = await (await call(dana, "/threads/theo")).json();
    assert(!("familySeenAt" in t), "no seen time for a family");
  });

  await call(coach, `/reviews/${id}/withdraw`, { method: "POST", body: "{}" });
  await call(coach, `/threads/theo/${message.id}`, { method: "DELETE" });
  h.errors(`seen at ${size}`);
}
await kit.close();
