// Camera angles across two phones, in Chrome with fake cameras and the
// service: the host adds camera angles and gets a code; a second coach's
// phone joins as "Wall side"; the host films and keeps a take, the second
// phone films the same run and sends its clip; the clip comes onto the host
// phone as a linked take, lined up by when each phone started; assigning
// the kid assigns both; a retake on the host throws the clip away; ending camera
// angles sends the second phone back to the code screen.
// Needs npm run dev and npm run service.
//   node scripts/angles-e2e.mjs [output-folder]
import { launch } from "./review-kit.mjs";
import {
  REPLAY,
  assert,
  fakeCamera,
  fresh,
  stored,
  signIn,
  wait,
} from "./coach-kit.mjs";

fakeCamera();
const kit = await launch({ out: process.argv[2] ?? "test-results/angles" });

const host = await kit.page("phone", { label: "host" });
const side = await kit.page("phone", { label: "side" });
for (const p of [host, side]) {
  await p.context.grantPermissions(["camera"]);
  p.page.setDefaultTimeout(20000);
  p.page.on("dialog", (d) => d.accept());
}
const H = host.page;
const S = side.page;
await fresh(H, REPLAY);
await signIn(H, "Coach Jordan");
await fresh(S, REPLAY);
await signIn(S, "Coach Sam");
const settings = H.getByRole("dialog", { name: "Capture settings" });
const status = S.getByRole("dialog", { name: "Camera angle" }).getByRole(
  "status",
);
let code;

await host.h.step("the host adds camera angles and gets a code", async () => {
  await H.getByRole("button", { name: "Record", exact: true }).click();
  await H.getByRole("button", { name: "Capture settings" }).click();
  await settings.getByRole("button", { name: "Add camera angles" }).click();
  code = (await settings.locator(".rp-angles-code b").innerText()).trim();
  assert(/^[A-Z2-9]{5}$/.test(code), `a code: ${code}`);
});

await side.h.step("a second phone joins with the code", async () => {
  await S.getByRole("button", { name: "Be a camera angle" }).click();
  await S.getByLabel("Code from the host phone").fill(code.toLowerCase());
  await S.getByLabel("Where this phone is").fill("Wall side");
  await S.getByRole("button", { name: "Join" }).click();
  await status.getByText("Ready. Films when Coach Jordan records.").waitFor();
});
await side.h.shot("ready");

await host.h.step("the host sees the camera join", async () => {
  await settings.getByText("Wall side · Coach Sam").waitFor();
  await settings
    .getByText("Ready", { exact: true })
    .waitFor({ timeout: 15000 });
  await host.h.shot("settings");
  await settings.getByRole("button", { name: "Done" }).click();
  await H.getByText("1 other camera will film this too").waitFor();
});

await host.h.step(
  "both phones film the run; the clip comes to the host",
  async () => {
    await H.getByRole("button", { name: "Start recording" }).click();
    await status.getByText(/^Filming · /).waitFor({ timeout: 5000 });
    await side.h.shot("filming");
    await wait(2500);
    await H.bringToFront();
    await H.getByRole("button", { name: "Stop recording" }).click();
    await H.getByLabel("Recording of this run").waitFor({ timeout: 15000 });
    await H.getByRole("button", { name: "Keep", exact: true }).click();
    await H.getByRole("region", { name: "Saved" }).waitFor();
    await S.bringToFront();
    await status.getByText(/^Sent a \d+\.\ds clip to the host\./).waitFor();
    await H.bringToFront();
    await H.getByText("1 more camera angle came in.").waitFor({
      timeout: 20000,
    });
    const takes = await stored(H);
    assert(takes.length === 2, `two takes on the host (${takes.length})`);
    const main = takes.find((t) => !t.angleOf);
    const angle = takes.find((t) => t.angleOf);
    assert(angle.angleOf === main.id && angle.angle === "Wall side");
    assert(angle.sync.group === main.sync.group, "the same recording");
    const lag = angle.sync.start - main.sync.start;
    assert(lag >= 0 && lag < 2000, `the side phone started ${lag}ms later`);
    assert(angle.duration > 1.5, `a real clip (${angle.duration}s)`);
  },
);

await host.h.step(
  "the angle plays beside the take at the same instant",
  async () => {
    await H.getByRole("button", { name: "Open take" }).click();
    const card = H.getByRole("region", { name: "Camera angles" });
    await card
      .getByRole("button", { name: "Side by side with Wall side" })
      .click();
    assert(
      (await H.getByLabel("Line up at").inputValue()) === "sync",
      "lined up by time",
    );
    await H.locator(".rp-compare").getByText("Wall side").first().waitFor();
    await H.getByText(/Two cameras on the same run/).waitFor();
  },
);
await host.h.shot("compare", { full: true });
await host.h.overflow("the take with angles");

await host.h.step("assigning the kid assigns the angle too", async () => {
  await H.getByRole("button", { name: "Assign a kid" }).click();
  await H.getByRole("dialog", { name: "Whose take is this?" })
    .getByRole("button", { name: /Theo Parker/ })
    .first()
    .click();
  await H.getByRole("heading", { name: "Theo Parker" }).waitFor();
  const takes = await stored(H);
  assert(
    takes.every((t) => t.memberId === "theo"),
    "both are Theo's",
  );
});

await host.h.step(
  "a retake on the host throws the other clip away",
  async () => {
    await H.goto(`${REPLAY}#/floor`);
    await H.getByRole("button", { name: "Record", exact: true }).click();
    await H.getByRole("button", { name: "Start recording" }).click();
    await S.bringToFront();
    await status.getByText(/^Filming · /).waitFor({ timeout: 5000 });
    await wait(1500);
    await H.bringToFront();
    await H.getByRole("button", { name: "Stop recording" }).click();
    await H.getByLabel("Recording of this run").waitFor({ timeout: 15000 });
    await H.getByRole("button", { name: "Retake" }).click();
    await S.bringToFront();
    await status.getByText(/^The host retook it/).waitFor();
    await H.bringToFront();
    await wait(4000);
    assert((await stored(H)).length === 2, "no new takes");
  },
);

await side.h.step(
  "ending camera angles sends the phone back to the code",
  async () => {
    await H.getByRole("button", { name: "Capture settings" }).click();
    await settings.getByRole("button", { name: "End camera angles" }).click();
    await settings.getByRole("button", { name: "Add camera angles" }).waitFor();
    await S.bringToFront();
    await S.getByText("The host ended camera angles.").waitFor();
  },
);
host.h.errors("hosting camera angles");
side.h.errors("being a camera angle");
await kit.close();
