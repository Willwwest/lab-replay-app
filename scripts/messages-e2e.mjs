// Coach and family messages across both apps: a coach times a run on the
// camera and sends it with a note from the take's Share tab; the parent reads it in the LAB app and
// replies; the reply reaches the coach live with an unread count; the kid
// view can't write; another family sees nothing; a deleted message goes
// from the parent's screen. Needs both dev servers and npm run service.
//   node scripts/messages-e2e.mjs [output-folder]
import { launch } from "./review-kit.mjs";
import {
  REPLAY,
  SERVICE,
  assert,
  course as makeCourse,
  fakeCamera,
  fresh,
  nav,
  seedCourse,
  serviceToken,
  signIn,
  wait,
} from "./coach-kit.mjs";

const MEMBER = "http://127.0.0.1:5173/";
fakeCamera();
const kit = await launch({ out: process.argv[2] ?? "test-results/messages" });
const stamp = Date.now();
const runName = `Message run ${stamp % 10000}`;
const note = `Great pace on the wall ${stamp % 10000}`;
const reply = `Thanks coach! ${stamp % 10000}`;

// The coach, in Replay on a phone.
const coach = await kit.page("phone", { label: "coach" });
const c = coach.page;
await coach.context.grantPermissions(["camera"]);
c.setDefaultTimeout(15000);
c.on("dialog", (d) => d.accept());
const course = { ...makeCourse(stamp), name: runName };
await fresh(c, REPLAY);
await signIn(c, "Coach Jordan");
await seedCourse(c, course);

await coach.h.step("time Theo on the camera; the take opens", async () => {
  await c.getByRole("button", { name: "Timed course" }).click();
  await c.getByRole("button", { name: /^No kid picked/ }).click();
  await c
    .getByRole("dialog", { name: "Who's running?" })
    .getByRole("button", { name: /Theo Parker/ })
    .first()
    .click();
  await c.getByRole("button", { name: "Capture settings" }).click();
  const settings = c.getByRole("dialog", { name: "Capture settings" });
  await settings.getByLabel("Course", { exact: true }).selectOption(course.id);
  const box = settings.getByRole("switch", { name: "3-2-1 countdown" });
  if (await box.isChecked()) await box.locator("..").click();
  await settings.getByRole("button", { name: "Done" }).click();
  await c.getByRole("button", { name: "Start the run" }).click();
  for (let i = 0; i < course.points.length; i++) {
    await wait(300);
    await c.locator(".rp-key-pass").click();
  }
  await c.getByRole("heading", { name: /^Clean run in/ }).waitFor();
  await c.getByLabel("Recording of this run").waitFor({ timeout: 15000 });
  await c.getByRole("button", { name: "Keep", exact: true }).click();
  await c.getByRole("button", { name: "Open take" }).click();
  await c.getByRole("heading", { name: "Theo Parker" }).waitFor();
});

await coach.h.step(
  "Write on the Share tab opens Theo's thread with the run attached",
  async () => {
    await c.getByRole("radio", { name: "Share", exact: true }).click();
    await c
      .getByRole("region", { name: "Family" })
      .getByRole("button", { name: "Write" })
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
    await nav(c, "Floor");
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
const token = await serviceToken();
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
