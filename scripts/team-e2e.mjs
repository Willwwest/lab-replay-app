// Team runs across devices: a coach picks the running order and runs each
// athlete; a second screen watches through the spectator link and sees the
// runner on course, the clock moving, each mark, and the standings. Needs
// npm run dev and npm run service.
//   node scripts/team-e2e.mjs [output-folder]
import { launch } from "./review-kit.mjs";

const REPLAY = "http://127.0.0.1:5180/";
const SERVICE = "http://127.0.0.1:5182/replay-api";
const kit = await launch({ out: process.argv[2] ?? "test-results/team" });
const assert = (ok, msg) => {
  if (!ok) throw Error(msg);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = Date.now();
const course = {
  id: `course-team-${stamp}`,
  name: `Team course ${stamp % 10000}`,
  background: "/gym-layout.png",
  layoutName: "LAB gym layout",
  version: 1,
  savedAt: new Date().toISOString(),
  points: [
    {
      id: "a",
      label: "Rings",
      skill: "Swing transfer",
      x: 0.31,
      y: 0.44,
      time: null,
    },
    { id: "b", label: "Wall", skill: "Wall run", x: 0.58, y: 0.36, time: null },
    { id: "c", label: "Bars", skill: "Lache", x: 0.47, y: 0.71, time: null },
  ],
};

async function device(size, name, initials) {
  const { page, h, context } = await kit.page(size, { label: name });
  page.setDefaultTimeout(15000);
  page.on("dialog", (d) => d.accept());
  await page.goto(REPLAY);
  await page.evaluate(async (c) => {
    sessionStorage.clear();
    const { put } = await import("/src/storage.js");
    await put("courses", c);
  }, course);
  await page.reload();
  await page.locator(".chip-select").click();
  await page.getByRole("menuitemradio", { name }).click();
  await page.locator(".avatar", { hasText: initials }).waitFor();
  return { page, h, context };
}

const coach = await device("tablet", "Coach Jordan", "CJ");
const { page, h } = coach;
let code = "";

await h.step("set up a team run: three athletes, reordered", async () => {
  await page.locator(".primary-nav .nav-item", { hasText: "Run" }).click();
  await page
    .getByRole("radiogroup", { name: "Run type" })
    .getByRole("radio", { name: "Team run" })
    .click();
  await page.getByLabel("Course", { exact: true }).selectOption(course.id);
  for (const n of ["Theo Parker", "Maya Brooks", "Leo Rivera"]) {
    await page.getByLabel("Find athletes").fill(n.split(" ")[0]);
    await page.getByRole("button", { name: n, exact: true }).click();
  }
  await page.getByLabel("Find athletes").fill("");
  await page.getByRole("button", { name: "Move Leo Rivera earlier" }).click();
  const order = await page
    .getByRole("list", { name: "Running order" })
    .locator("b")
    .allInnerTexts();
  assert(order.join() === "Theo Parker,Leo Rivera,Maya Brooks", order.join());
  await page
    .getByRole("radiogroup", { name: "Fail limit" })
    .getByRole("radio", { name: "1" })
    .click();
  const countdown = page.getByRole("switch", { name: "3-2-1 countdown" });
  if (await countdown.isChecked()) await countdown.locator("..").click();
});
await h.overflow("team setup");
await h.shot("team-setup", { full: true });

await h.step("start it: Theo is up next and a code is shown", async () => {
  await page.getByRole("button", { name: "Start team run" }).click();
  await page
    .getByRole("heading", { name: `Team run · ${course.name}` })
    .waitFor();
  await page
    .getByRole("region", { name: "Up next" })
    .getByText("Theo Parker")
    .waitFor();
  const note = await page
    .locator(".ds-section-head .ds-note")
    .first()
    .innerText();
  code = note.match(/code ([A-Z0-9]{6})/)[1];
});

const viewer = await device("desktop", "Coach Priya", "CP");
await viewer.h.step("the spectator link opens the watch screen", async () => {
  await viewer.page.goto(`${REPLAY}?team=${code}`);
  await viewer.page
    .getByRole("region", { name: `Team run: ${course.name}` })
    .waitFor();
  await viewer.page.getByText("Between runs").waitFor();
  assert(
    (await viewer.page.locator(".rp-standings li").count()) === 3,
    "three waiting",
  );
});

// The spectator page is checked in the foreground, as a gym TV would be;
// background tabs only poll about once a minute.
const watch = viewer.page.locator(".rp-watch");
const clockOf = async () =>
  Number(
    (await watch.locator(".rp-watch-clock").innerText()).replace(/[^\d.]/g, ""),
  );

async function run(gap, results) {
  await page.getByRole("button", { name: "Go" }).click();
  for (const r of results) {
    await wait(gap);
    await page.locator(r === "fail" ? ".rp-run-fail" : ".rp-run-pass").click();
  }
}

await h.step("Theo's run shows live on the spectator screen", async () => {
  await page.getByRole("button", { name: "Start Theo's run" }).click();
  await viewer.page.bringToFront();
  await watch.getByText("Theo Parker", { exact: true }).first().waitFor();
  await page.getByRole("button", { name: "Go" }).click();
  await viewer.page.bringToFront();
  await watch.locator(".rp-watch-clock").waitFor();
  await wait(1200);
  const a = await clockOf();
  await wait(700);
  const b = await clockOf();
  assert(b > a && a > 0.5, `spectator clock ${a} → ${b}`);
  await page.locator(".rp-run-pass").click();
  await viewer.page.bringToFront();
  await watch.locator(".rp-team-marks li.is-pass").waitFor();
  await viewer.page.bringToFront();
  await watch.getByText(/2 of 3 · Wall/).waitFor();
});
await viewer.h.shot("watch-live");
await viewer.h.overflow("watch live");

await h.step("Theo finishes clean and leads the standings", async () => {
  for (let i = 0; i < 2; i++) {
    await wait(300);
    await page.locator(".rp-run-pass").click();
  }
  await page.getByRole("heading", { name: /^Clean run in/ }).waitFor();
  await page.getByRole("button", { name: "Save run" }).click();
  await page.getByText("Saved", { exact: false }).first().waitFor();
  await page.getByRole("button", { name: "Next athlete" }).click();
  await viewer.page.bringToFront();
  await watch.locator(".rp-standings li").first().getByText("1st").waitFor();
  assert(
    (await watch.locator(".rp-standings li").first().innerText()).includes(
      "Theo",
    ),
    "Theo first",
  );
  await page
    .getByRole("region", { name: "Up next" })
    .getByText("Leo Rivera")
    .waitFor();
});

await h.step("a discarded run clears the course for spectators", async () => {
  await page.getByRole("button", { name: "Start Leo's run" }).click();
  await viewer.page.bringToFront();
  await watch.locator(".rp-watch-live").getByText("On course").waitFor();
  await page.getByRole("button", { name: "Cancel" }).click();
  await viewer.page.bringToFront();
  await watch.getByText("Between runs").waitFor();
  await page
    .getByRole("region", { name: "Up next" })
    .getByText("Leo Rivera")
    .waitFor();
});

await h.step("Leo fails at the limit and ranks below clean runs", async () => {
  await page.getByRole("button", { name: "Start Leo's run" }).click();
  await run(300, ["fail"]);
  await page.getByRole("heading", { name: /^Fail limit at/ }).waitFor();
  await page.getByRole("button", { name: "Save run" }).click();
  await page.getByRole("button", { name: "Next athlete" }).click();
  const leo = watch.locator(".rp-standings li", { hasText: "Leo Rivera" });
  await leo.getByText("No clean run").waitFor();
  await leo.getByText("Fail limit · 0 passed").waitFor();
});

await h.step("Maya runs faster and takes first", async () => {
  await page.getByRole("button", { name: "Start Maya's run" }).click();
  await run(100, ["pass", "pass", "pass"]);
  await page.getByRole("button", { name: "Save run" }).click();
  await page.getByRole("button", { name: "Next athlete" }).click();
  await viewer.page.bringToFront();
  await watch
    .locator(".rp-standings li")
    .first()
    .filter({ hasText: "Maya Brooks" })
    .waitFor();
  await page
    .getByRole("region", { name: "Up next" })
    .getByText("Everyone has run")
    .waitFor();
  await page
    .getByRole("region", { name: "Up next" })
    .getByText("Maya Brooks wins")
    .waitFor();
});

await h.step(
  "Run again gives Leo another go; his clean run beats Theo",
  async () => {
    await page
      .getByRole("region", { name: "Running order" })
      .locator("li", { hasText: "Leo Rivera" })
      .getByRole("button", { name: "Run again" })
      .click();
    await run(400, ["pass", "pass", "pass"]);
    await page.getByRole("button", { name: "Save run" }).click();
    await page.getByRole("button", { name: "Next athlete" }).click();
    await viewer.page.bringToFront();
    await watch
      .locator(".rp-standings li", { hasText: "Leo Rivera" })
      .getByText("2nd")
      .waitFor();
  },
);
await h.overflow("team panel");
await h.layout("team panel");
await h.shot("team-panel", { full: true });
await viewer.h.shot("watch-standings");

await h.step("a family with no kid in the team can't watch it", async () => {
  const t = (
    await (
      await fetch(`${SERVICE}/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: "+16025550104" }),
      })
    ).json()
  ).token;
  const status = (
    await fetch(`${SERVICE}/teams/${code}`, {
      headers: { Authorization: `Bearer ${t}` },
    })
  ).status;
  assert(status === 403, `status ${status}`);
});

await h.step(
  "ending the team run shows final standings to spectators",
  async () => {
    await page.getByRole("button", { name: "End team run" }).click();
    await page.getByRole("heading", { name: "Set up the run" }).waitFor();
    await viewer.page.bringToFront();
    await watch.getByText("Final standings").waitFor();
    await viewer.page.bringToFront();
    await watch.getByText("Finished").waitFor();
  },
);
h.errors("coach");
viewer.h.errors("viewer");

// A phone-sized spectator, for the layout.
const phone = await device("phone", "Coach Alex", "CA");
await phone.page.goto(`${REPLAY}?team=${code}`);
await phone.h.step("the watch screen fits a phone", async () => {
  await phone.page.locator(".rp-watch").getByText("Final standings").waitFor();
});
await phone.h.overflow("watch phone");
await phone.h.shot("watch-phone", { full: true });
phone.h.errors("phone viewer");

// Clean up the shared runs from this test.
const t = (
  await (
    await fetch(`${SERVICE}/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "+16025550150" }),
    })
  ).json()
).token;
const runs = (
  await (
    await fetch(`${SERVICE}/runs`, {
      headers: { Authorization: `Bearer ${t}` },
    })
  ).json()
).filter((r) => r.course === course.name);
for (const r of runs)
  await fetch(`${SERVICE}/runs/${r.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${t}` },
  });
console.log(`Removed ${runs.length} test runs.`);
await kit.close();
