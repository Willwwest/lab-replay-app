// The coach's day, end to end, at phone and desktop sizes: who's coaching,
// who's in the gym (shared with a second coach's phone), record one kid
// after another without leaving the camera, record with no kid and assign
// later, check a take before analysis and confirm the send, time a course,
// and the back button. Needs npm run dev and npm run service.
//   node scripts/coach-e2e.mjs [output-folder] [size,size]
import { launch } from "./review-kit.mjs";
import {
  SERVICE,
  assert,
  course as makeCourse,
  fakeCamera,
  fresh,
  nav,
  recordAndKeep,
  seedCourse,
  serviceToken,
  signIn,
  stored,
  wait,
} from "./coach-kit.mjs";

fakeCamera();
const kit = await launch({ out: process.argv[2] ?? "test-results/coach" });
const SIZES = process.argv[3]?.split(",") ?? ["phone", "desktop"];
const KIDS = ["Theo Parker", "Maya Brooks", "Leo Rivera"];
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

for (const size of SIZES) {
  const stamp = Date.now();
  const course = makeCourse(stamp);
  const { page, h, context } = await kit.page(size, { label: "coach" });
  await context.grantPermissions(["camera"]);
  page.setDefaultTimeout(15000);
  page.on("dialog", (d) => d.accept());
  const heights = [];
  const height = async (name) =>
    heights.push(
      `${name} ${(await page.evaluate(() => document.documentElement.scrollHeight / innerHeight)).toFixed(1)}`,
    );

  await h.step("the app asks who's coaching, and remembers", async () => {
    await fresh(page);
    await signIn(page, "Coach Jordan");
    await page.reload();
    await page.getByRole("heading", { name: /Jordan/ }).waitFor();
    await height("floor");
  });
  await h.overflow("floor");
  await h.shot("floor");

  await h.step("add who's in the gym", async () => {
    await page.getByRole("button", { name: "Add kids" }).click();
    const sheet = page.getByRole("dialog", { name: "Who's in the gym?" });
    for (const n of KIDS)
      await sheet.getByRole("button", { name: new RegExp(n) }).click();
    await page.getByRole("button", { name: "Done" }).click();
    for (const n of KIDS)
      await page
        .getByRole("radio", { name: new RegExp(n.split(" ")[0]) })
        .waitFor();
  });

  await h.step("another coach's phone sees the same gym list", async () => {
    const other = await context.browser().newContext({
      viewport: { width: 390, height: 844 },
    });
    const p2 = await other.newPage();
    await fresh(p2);
    await signIn(p2, "Coach Priya");
    for (const n of KIDS)
      await p2
        .getByRole("radio", { name: new RegExp(n.split(" ")[0]) })
        .waitFor({ timeout: 20000 });
    await other.close();
  });

  await h.step(
    "record Theo, then Maya from Next up, then one with no kid",
    async () => {
      await page.getByRole("radio", { name: /Theo/ }).click();
      await page.getByRole("button", { name: "Record Theo" }).click();
      await page.getByRole("dialog", { name: "Camera" }).waitFor();
      await recordAndKeep(page);
      await page.getByText("Theo Parker's take is in Takes").waitFor();
      await page
        .getByRole("region", { name: "Saved" })
        .getByRole("button", { name: "Maya" })
        .click();
      await page.getByRole("button", { name: /Recording Maya/ }).waitFor();
      await recordAndKeep(page);
      await page.getByRole("button", { name: "Record another" }).click();
      await page
        .getByRole("button", { name: "No kid picked. Pick one" })
        .waitFor();
      await recordAndKeep(page);
      await page.getByText("Assign a kid there.").waitFor();
      await page.getByRole("button", { name: "Done" }).click();
      await page
        .getByRole("dialog", { name: "Camera" })
        .waitFor({ state: "detached" });
      const takes = await stored(page);
      assert(takes.length === 3, `3 takes, got ${takes.length}`);
      assert(
        takes
          .map((t) => t.memberId)
          .sort()
          .join() === ",maya,theo",
        takes.map((t) => t.memberId).join(),
      );
      assert(
        takes.every((t) => t.thumb?.startsWith("data:image")),
        "thumbnails",
      );
    },
  );

  await h.step("the back button closes the camera", async () => {
    await page
      .getByRole("button", { name: /^Record/ })
      .first()
      .click();
    await page.getByRole("dialog", { name: "Camera" }).waitFor();
    await page.goBack();
    await page
      .getByRole("dialog", { name: "Camera" })
      .waitFor({ state: "detached" });
    await page.getByRole("heading", { name: /Jordan/ }).waitFor();
  });

  await h.step(
    "the Floor shows today's takes and the one to assign",
    async () => {
      await page.getByText("1 take to assign").waitFor();
      assert(
        (await page
          .getByRole("list", { name: "Today's takes" })
          .locator("li")
          .count()) === 3,
        "3 today",
      );
      await height("floor with takes");
    },
  );

  await h.step("assign it from Takes in one tap", async () => {
    await page.getByText("1 take to assign").click();
    await page.getByRole("radio", { name: "To assign · 1" }).waitFor();
    await page
      .getByRole("list", { name: "Takes" })
      .getByRole("button", { name: "Assign", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Whose take is this?" })
      .getByRole("button", { name: /Leo Rivera/ })
      .click();
    await page.getByRole("radio", { name: "To assign · 0" }).waitFor();
    await height("takes");
  });
  await h.overflow("takes");
  await h.shot("takes");

  await h.step(
    "a take starts raw; checking it needs all three boxes",
    async () => {
      await page.getByRole("radio", { name: /To check/ }).click();
      await page.getByRole("button", { name: /^Theo Parker/ }).click();
      await page.getByRole("heading", { name: "Theo Parker" }).waitFor();
      await page.getByRole("heading", { name: "Raw recording" }).waitFor();
      const mark = page.getByRole("button", { name: "Mark as checked" });
      assert(await mark.isDisabled(), "disabled before the boxes");
      await page.getByLabel("Clip end (seconds)").fill("1");
      for (const l of [
        /trimmed to the run/,
        /in frame from start/,
        /Steady and close/,
      ])
        await page.getByRole("checkbox", { name: l }).check();
      await mark.click();
      await page.getByRole("heading", { name: "Ready for analysis" }).waitFor();
      await height("take watch");
    },
  );
  await h.overflow("take watch");
  await h.shot("take-watch", { full: true });

  await h.step(
    "moving the clip after checking makes it raw again",
    async () => {
      await page.getByLabel("Clip end (seconds)").fill("1.2");
      await page.getByRole("heading", { name: "Raw recording" }).waitFor();
      await page.getByLabel("Clip end (seconds)").fill("1");
      await page.getByRole("heading", { name: "Ready for analysis" }).waitFor();
    },
  );

  await h.step(
    "sending asks first, with the clip length and this week's count",
    async () => {
      await page.getByRole("button", { name: "Send for analysis…" }).click();
      const sheet = page.getByRole("dialog", { name: "Send for analysis?" });
      await sheet
        .getByText("Sent from this device in the last 7 days:")
        .waitFor();
      await sheet.getByRole("button", { name: "Not now" }).click();
      await sheet.waitFor({ state: "detached" });
      await page.getByRole("button", { name: "Send for analysis…" }).click();
      await page.getByRole("button", { name: "Send the 1.0s clip" }).click();
      await page
        .getByRole("heading", { name: "Analyzed" })
        .waitFor({ timeout: 120000 });
      await page
        .locator(".rp-stages li.is-done", { hasText: "Analyzed" })
        .waitFor();
    },
  );

  await h.step("each tab is its own short page", async () => {
    for (const tab of ["Course", "Coach", "Share"]) {
      await page.getByRole("radio", { name: tab, exact: true }).click();
      await wait(300);
      await height(`take ${tab.toLowerCase()}`);
      await h.overflow(`take ${tab}`);
    }
  });

  await h.step("back from a take returns to Takes", async () => {
    await page.goBack();
    await page
      .getByRole("heading", { name: "Recordings" })
      .waitFor({ timeout: 5000 })
      .catch(async () => {
        await page.goBack();
        await page.getByRole("heading", { name: "Recordings" }).waitFor();
      });
    await page.getByRole("radio", { name: /Analyzed · 1/ }).waitFor();
  });

  await h.step(
    "a timed course run saves a take with the attempt scored",
    async () => {
      await seedCourse(page, course);
      await nav(page, "Floor");
      await page.getByRole("radio", { name: /Maya/ }).click();
      await page.getByRole("button", { name: "Timed course" }).click();
      await page.getByRole("button", { name: "Capture settings" }).click();
      const settings = page.getByRole("dialog", { name: "Capture settings" });
      await settings
        .getByLabel("Course", { exact: true })
        .selectOption(course.id);
      const cd = settings.getByRole("switch", { name: "3-2-1 countdown" });
      if (await cd.isChecked()) await cd.locator("..").click();
      await settings.getByRole("button", { name: "Done" }).click();
      await page.getByRole("button", { name: "Start the run" }).click();
      for (let i = 0; i < 3; i++) {
        await wait(400);
        await page.locator(".rp-key-pass").click();
      }
      await page.getByRole("heading", { name: /^Clean run in/ }).waitFor();
      await page
        .getByLabel("Recording of this run")
        .waitFor({ timeout: 15000 });
      await page.getByRole("button", { name: "Keep", exact: true }).click();
      await page.getByRole("button", { name: "Open take" }).click();
      await page.getByRole("heading", { name: "Maya Brooks" }).waitFor();
      await page.getByRole("radio", { name: "Course", exact: true }).click();
      assert(
        (await page
          .getByRole("radiogroup", { name: "Obstacle 2 result" })
          .getByRole("radio", { name: "Pass" })
          .getAttribute("aria-checked")) === "true",
        "scored",
      );
    },
  );

  await h.step("Board and Messages open", async () => {
    await nav(page, "Board");
    await page
      .getByRole("heading", { name: "Leaderboards and team runs" })
      .waitFor();
    await h.overflow("board");
    await nav(page, "Messages");
    await page.getByRole("heading", { name: "Families" }).waitFor();
    await h.overflow("messages");
  });

  await h.step("Switch coach goes back to the gate", async () => {
    await page.getByRole("button", { name: "Coach Jordan menu" }).click();
    await page.getByRole("menuitem", { name: "Switch coach" }).click();
    await page.getByRole("heading", { name: "Who's coaching?" }).waitFor();
  });
  console.log(`  ${size} page heights (screens): ${heights.join(" · ")}`);
  h.errors(`coach ${size}`);

  // Clean up the shared gym list and runs from this test.
  const token = await serviceToken();
  const auth = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  for (const id of ["theo", "maya", "leo"])
    await fetch(`${SERVICE}/here`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ memberId: id, here: false, date: today() }),
    });
  const runs = (
    await (await fetch(`${SERVICE}/runs`, { headers: auth })).json()
  ).filter((r) => r.course === course.name);
  for (const r of runs)
    await fetch(`${SERVICE}/runs/${r.id}`, { method: "DELETE", headers: auth });
  await context.close();
}
await kit.close();
