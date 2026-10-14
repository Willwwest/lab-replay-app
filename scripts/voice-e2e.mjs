// Voice-overs, in Chrome with a fake camera and microphone: the recorder
// opens from the Watch tab, hears the microphone, draws while recording,
// shows the coach's camera; Stop shows it back; Keep saves it with the take;
// the back button closes the recorder; a voice-over goes with the portfolio
// clip, rendered to MP4 with sound, published to the family and withdrawn
// with the clip. Needs npm run dev and npm run service, and
// test-results/fixtures/person.mp4.
//   node scripts/voice-e2e.mjs [output-folder] [size,size]
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { launch } from "./review-kit.mjs";
import {
  REPLAY,
  SERVICE,
  assert,
  dragOn,
  fakeCamera,
  fresh,
  seedReadyTake,
  seedTake,
  serviceToken,
  signIn,
  stored,
  wait,
} from "./coach-kit.mjs";

fakeCamera();
const kit = await launch({ out: process.argv[2] ?? "test-results/voice" });
const SIZES = process.argv[3]?.split(",") ?? ["phone", "desktop"];

for (const size of SIZES) {
  const { page, h, context } = await kit.page(size, { label: "voice" });
  await context.grantPermissions(["camera", "microphone"]);
  page.setDefaultTimeout(20000);
  page.on("dialog", (d) => d.accept());
  await fresh(page, REPLAY);
  await signIn(page);
  const id = await seedReadyTake(page);
  await page.goto(`${REPLAY}#/take/${id}/watch`);
  await page.reload();
  const rec = page.getByRole("dialog", { name: "Record a voice-over" });
  const canvas = rec.locator("canvas");

  await h.step("the recorder opens and hears the microphone", async () => {
    await page.getByRole("button", { name: "Record a voice-over" }).click();
    await rec.waitFor();
    const start = rec.getByRole("button", { name: "Start recording" });
    await page.waitForFunction(
      () => !document.querySelector(".rp-voice-start")?.disabled,
    );
    assert(await start.isEnabled(), "Start is ready once the mic is on");
    await page.waitForFunction(
      () =>
        Number(
          getComputedStyle(
            document.querySelector(".rp-voice-meter"),
          ).getPropertyValue("--level"),
        ) > 0,
      null,
      { timeout: 10000 },
    );
  });

  await h.step("draw, show my camera, record, stop", async () => {
    await rec.getByRole("button", { name: "My camera" }).click();
    await rec.getByRole("button", { name: "Start recording" }).click();
    await rec.getByRole("status").getByText(/\d/).waitFor();
    await dragOn(page, canvas, [0.3, 0.3], [0.6, 0.6], 12);
    await rec.getByRole("radio", { name: "Circle" }).click();
    await dragOn(page, canvas, [0.5, 0.5], [0.6, 0.5]);
    assert(
      /2 marks drawn/.test(await canvas.getAttribute("aria-label")),
      "two marks",
    );
    await wait(2500);
    await h.shot("recording");
    await rec.getByRole("button", { name: "Stop recording" }).click();
    await rec.getByText("Watch it back").waitFor();
    await page.waitForFunction(
      () => document.querySelector(".rp-voice-review")?.readyState >= 1,
    );
  });
  await h.overflow("the recorder");
  await h.shot("review");

  await h.step("the recording has picture and sound", async () => {
    const r = await page.evaluate(async () => {
      const blob = await (
        await fetch(document.querySelector(".rp-voice-review").src)
      ).blob();
      const audio = await new AudioContext().decodeAudioData(
        await blob.arrayBuffer(),
      );
      const ch = audio.getChannelData(0);
      let peak = 0;
      for (const s of ch) peak = Math.max(peak, Math.abs(s));
      return {
        size: blob.size,
        type: blob.type,
        seconds: audio.duration,
        peak,
      };
    });
    assert(r.size > 10000, `a real file (${r.size} bytes, ${r.type})`);
    assert(
      r.seconds > 2,
      `about the length recorded (${r.seconds.toFixed(1)}s)`,
    );
    assert(
      r.peak > 0.01,
      `the microphone is in it (peak ${r.peak.toFixed(3)})`,
    );
  });

  await h.step("Keep saves it with the take", async () => {
    await rec.getByRole("button", { name: "Keep voice-over" }).click();
    await rec.waitFor({ state: "detached" });
    const list = page.getByRole("list", { name: "Voice-overs" });
    await list.getByRole("listitem").first().waitFor();
    const voices = await stored(page, "voiceovers");
    assert(
      voices.length === 1 && voices[0].takeId === id,
      "one stored for this take",
    );
    assert(voices[0].camera === true && voices[0].duration > 2);
    assert(voices[0].coach === "Coach Jordan");
  });

  await h.step("back closes the recorder and stays on the take", async () => {
    await page.getByRole("button", { name: "Record a voice-over" }).click();
    await rec.waitFor();
    await page.goBack();
    await rec.waitFor({ state: "detached" });
    assert(page.url().includes(`#/take/${id}/watch`), "still on the take");
  });

  let reviewId;
  await h.step("the voice-over goes with the portfolio clip", async () => {
    await page.getByRole("radio", { name: "Share", exact: true }).click();
    const card = page.locator(".rp-portfolio");
    const voices = await stored(page, "voiceovers");
    await card.getByLabel("Voice-over").selectOption(voices[0].id);
    await card.getByRole("button", { name: "Prepare portfolio clip" }).click();
    await card
      .getByRole("button", { name: "Publish to member portfolio" })
      .waitFor({ timeout: 90000 });
    await page.waitForFunction(
      () =>
        document.querySelector("[aria-label='Prepared voice-over']")
          ?.readyState >= 1,
      null,
      { timeout: 20000 },
    );
    reviewId = (await stored(page)).find((t) => t.id === id).portfolioId;
    const coach = await serviceToken();
    const res = await fetch(`${SERVICE}/reviews/${reviewId}/voiceover`, {
      headers: { Authorization: `Bearer ${coach}` },
    });
    assert(res.status === 200, `served (${res.status})`);
    const file = `test-results/voice-${size}.mp4`;
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    const streams = execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_name,codec_type,width,height",
      "-of",
      "csv=p=0",
      file,
    ]).toString();
    assert(
      /h264,video,1280,720/.test(streams),
      `H.264 at 1280×720: ${streams}`,
    );
    assert(/aac,audio/.test(streams), `AAC sound: ${streams}`);
  });
  await h.shot("portfolio", { full: true });

  await h.step(
    "the family hears it once published, and not after withdrawal",
    async () => {
      const parent = await serviceToken("+16025550101");
      const other = await serviceToken("+16025550102");
      const as = (t) => ({ headers: { Authorization: `Bearer ${t}` } });
      const url = `${SERVICE}/reviews/${reviewId}/voiceover`;
      assert(
        (await fetch(url, as(parent))).status === 404,
        "hidden before publishing",
      );
      const card = page.locator(".rp-portfolio");
      await card
        .getByRole("button", { name: "Publish to member portfolio" })
        .click();
      await card.locator("em", { hasText: "Published" }).waitFor();
      assert(
        (await fetch(url, as(parent))).status === 200,
        "the family can play it",
      );
      assert(
        (await fetch(url, as(other))).status === 404,
        "another family can't",
      );
      await card
        .getByRole("button", { name: "Withdraw from portfolio" })
        .click();
      await card.locator("em", { hasText: "Withdrawn" }).waitFor();
      assert(
        (await fetch(url, as(parent))).status === 404,
        "gone after withdrawal",
      );
    },
  );

  await h.step("deleting a voice-over removes it from the device", async () => {
    await page.getByRole("radio", { name: "Watch", exact: true }).click();
    await page.getByRole("button", { name: "Delete the voice-over" }).click();
    await page.getByText("None yet.", { exact: true }).waitFor();
    assert((await stored(page, "voiceovers")).length === 0);
  });
  h.errors(`voice-overs at ${size}`);
}
await kit.close();
