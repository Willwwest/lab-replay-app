// Coach and family messages across both apps: a coach times a run and
// sends it with a note from Replay; the parent reads it in the LAB app and
// replies; the reply reaches the coach live with an unread count; the kid
// view can't write; another family sees nothing; a deleted message goes
// from the parent's screen. Needs both dev servers and npm run service.
//   node scripts/messages-e2e.mjs [output-folder]
import { launch } from "./review-kit.mjs";

const REPLAY = "http://127.0.0.1:5180/";
const MEMBER = "http://127.0.0.1:5173/";
const SERVICE = "http://127.0.0.1:5182/replay-api";
const kit = await launch({ out: process.argv[2] ?? "test-results/messages" });
const assert = (ok, msg) => {
  if (!ok) throw Error(msg);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = Date.now();
const runName = `Message run ${stamp % 10000}`;
const note = `Great pace on the wall ${stamp % 10000}`;
const reply = `Thanks coach! ${stamp % 10000}`;

// The coach, in Replay on a phone.
const coach = await kit.page("phone", { label: "coach" });
const c = coach.page;
c.setDefaultTimeout(15000);
c.on("dialog", (d) => d.accept());
await c.goto(REPLAY);
await c.evaluate(() => {
  sessionStorage.clear();
  localStorage.removeItem("replay-run-setup");
});
await c.reload();

await coach.h.step("time a quick run for Theo; it's shared", async () => {
  await c.locator(".chip-select").click();
  await c.getByRole("menuitemradio", { name: "Coach Jordan" }).click();
  await c.locator(".avatar", { hasText: "CJ" }).waitFor();
  await c.locator(".primary-nav .nav-item", { hasText: "Run" }).click();
  await c.getByLabel("Who's running").selectOption("theo");
  await c.getByLabel("Course", { exact: true }).selectOption("quick");
  await c.getByLabel("What are you timing?").fill(runName);
  const box = c.getByRole("switch", { name: "3-2-1 countdown" });
  if (await box.isChecked()) await box.locator("..").click();
  await c.getByRole("button", { name: "Start the run" }).click();
  await c.getByRole("button", { name: "Go" }).click();
  await wait(600);
  await c.getByRole("button", { name: "Finish" }).click();
  await c.getByRole("button", { name: "Save run" }).click();
  await c.getByRole("button", { name: "Next athlete" }).click();
  await c
    .locator(".rp-run-row", { hasText: runName })
    .getByRole("button", { name: "Send to family" })
    .waitFor();
});

await coach.h.step(
  "Send to family opens Theo's thread with the run attached",
  async () => {
    await c
      .locator(".rp-run-row", { hasText: runName })
      .getByRole("button", { name: "Send to family" })
      .click();
    const thread = c.getByRole("region", { name: "Conversation" });
    await thread.getByRole("heading", { name: "Theo Parker" }).waitFor();
    await thread
      .locator(".rp-compose-preview")
      .getByText(runName, { exact: false })
      .waitFor();
    await thread.getByLabel("Message", { exact: true }).fill(note);
    await thread.getByRole("button", { name: "Send" }).click();
    await thread.locator(".rp-msgs li.is-coach", { hasText: note }).waitFor();
    await thread
      .locator(".rp-msgs .rp-msg-run", { hasText: runName })
      .waitFor();
  },
);
await coach.h.overflow("coach thread");
await coach.h.shot("coach-thread", { full: true });

await coach.h.step(
  "on a phone the thread has a way back to the list",
  async () => {
    await c.getByRole("button", { name: "Back to conversations" }).click();
    await c
      .getByRole("region", { name: "Conversations" })
      .getByText("Theo Parker")
      .waitFor();
  },
);

// The parent, in the LAB app on a desktop.
const parent = await kit.page("desktop", { label: "parent" });
const p = parent.page;
p.setDefaultTimeout(15000);
await p.goto(MEMBER);
await p.evaluate(() =>
  localStorage.setItem(
    "lab-session",
    JSON.stringify({
      phone: "+16025550101",
      since: Date.now(),
      expires: Date.now() + 864e5,
    }),
  ),
);
await p.goto(MEMBER);
const inbox = p.locator(".ms");

await parent.h.step(
  "the parent sees the note and the run on Portfolio",
  async () => {
    await p.locator(".primary-nav .nav-item", { hasText: "Portfolio" }).click();
    await inbox
      .getByRole("heading", { name: "Messages with coaches" })
      .waitFor();
    await inbox.locator("li.is-coach", { hasText: note }).waitFor();
    const card = inbox.locator(".ms-run", { hasText: runName });
    await card.getByText("Clean run").waitFor();
    await inbox.getByText("Coach Jordan", { exact: false }).first().waitFor();
  },
);

await parent.h.step("the parent replies", async () => {
  await inbox.getByLabel("Reply to Theo's coaches").fill(reply);
  await inbox.getByRole("button", { name: "Send" }).click();
  await inbox.locator("li.is-family", { hasText: reply }).waitFor();
  await inbox.getByText("Dana Parker", { exact: false }).first().waitFor();
});
await parent.h.overflow("parent messages");
await parent.h.layout("parent messages");
await parent.h.shot("parent-messages", { full: true });

await coach.h.step(
  "the reply shows as new for the coach, then as read",
  async () => {
    await c.locator(".primary-nav .nav-item", { hasText: "Review" }).click();
    await c
      .locator(".primary-nav .nav-item", { hasText: "Messages" })
      .locator(".nav-count")
      .waitFor({ timeout: 12000 });
    await c.locator(".primary-nav .nav-item", { hasText: "Messages" }).click();
    const row = c
      .getByRole("region", { name: "Conversations" })
      .locator(".rp-thread-row", { hasText: "Theo Parker" });
    await row.getByText("1 new").waitFor();
    await row.click();
    await c
      .getByRole("region", { name: "Conversation" })
      .locator("li.is-family", { hasText: reply })
      .waitFor();
    await c
      .locator(".primary-nav .nav-item .nav-count")
      .waitFor({ state: "detached", timeout: 12000 });
  },
);

await parent.h.step("the kid view reads but can't write", async () => {
  await p.getByLabel("View as").selectOption("Athlete");
  await p.locator(".primary-nav .nav-item", { hasText: "Portfolio" }).click();
  await inbox.locator("li.is-coach", { hasText: note }).waitFor();
  await inbox.getByText("Ask a grown-up to reply").waitFor();
  assert(
    (await inbox.getByRole("button", { name: "Send" }).count()) === 0,
    "no send",
  );
  await p.getByLabel("View as").selectOption("Parent");
});

await coach.h.step("a deleted message leaves the parent's screen", async () => {
  await p.locator(".primary-nav .nav-item", { hasText: "Portfolio" }).click();
  await inbox.locator("li.is-coach", { hasText: note }).waitFor();
  await c
    .getByRole("region", { name: "Conversation" })
    .locator("li.is-coach", { hasText: note })
    .getByRole("button", { name: "Delete message" })
    .click();
  await inbox
    .locator("li.is-coach", { hasText: note })
    .waitFor({ state: "detached", timeout: 12000 });
});

const other = await kit.page("desktop", { label: "other" });
await other.h.step("another family sees none of Theo's messages", async () => {
  const o = other.page;
  await o.goto(MEMBER);
  await o.evaluate(() =>
    localStorage.setItem(
      "lab-session",
      JSON.stringify({
        phone: "+16025550102",
        since: Date.now(),
        expires: Date.now() + 864e5,
      }),
    ),
  );
  await o.goto(MEMBER);
  await o.locator(".primary-nav .nav-item", { hasText: "Portfolio" }).click();
  await o
    .locator(".ms")
    .getByRole("heading", { name: "Messages with coaches" })
    .waitFor();
  await wait(1500);
  const textNow = await o.locator(".ms").innerText();
  assert(!textNow.includes(reply) && !textNow.includes(runName), "no leak");
});
other.h.errors("other");
coach.h.errors("coach");
parent.h.errors("parent");

// Clean up: this test's messages and run.
const token = (
  await (
    await fetch(`${SERVICE}/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "+16025550150" }),
    })
  ).json()
).token;
const auth = { Authorization: `Bearer ${token}` };
const { messages } = await (
  await fetch(`${SERVICE}/threads/theo`, { headers: auth })
).json();
const mine = messages.filter(
  (m) => m.text.endsWith(String(stamp % 10000)) || m.run?.course === runName,
);
for (const m of mine)
  await fetch(`${SERVICE}/threads/theo/${m.id}`, {
    method: "DELETE",
    headers: auth,
  });
const runs = (
  await (await fetch(`${SERVICE}/runs?member=theo`, { headers: auth })).json()
).filter((r) => r.course === runName);
for (const r of runs)
  await fetch(`${SERVICE}/runs/${r.id}`, { method: "DELETE", headers: auth });
console.log(`Removed ${mine.length} messages and ${runs.length} runs.`);
await kit.close();
