// Browser review kit: Playwright on the installed Chrome, with step logging,
// console/page error capture, overflow checks, screenshots and a report.
//
//   import { launch, sizes, report } from "./review-kit.mjs";
//   const kit = await launch({ out: "review-out" });
//   const { page, h } = await kit.page("phone", { label: "checkout" });
//   await page.goto("http://127.0.0.1:5173/");
//   await h.step("adds an item", async () => {
//     await page.getByRole("button", { name: "Add to cart" }).click();
//     await page.getByText("1 item").waitFor();
//   });
//   await h.overflow("cart");
//   await h.shot("cart");
//   await kit.close(); // prints the report, exits 1 on failures
//
// Env: CHROME_CHANNEL (default "chrome"), HEADED=1 to watch.
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

function loadPlaywright() {
  const local = createRequire(import.meta.url);
  for (const name of ["playwright", "@playwright/test"]) {
    try {
      return local(name);
    } catch {}
  }
  const global = createRequire(execSync("npm root -g").toString().trim() + "/");
  for (const name of ["playwright", "@playwright/test"]) {
    try {
      return global(name);
    } catch {}
  }
  throw Error("Playwright not found. npm i -g @playwright/test (no browser download needed with channel: chrome).");
}

export const sizes = {
  small: { viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  tablet: { viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true },
  landscape: { viewport: { width: 1024, height: 768 }, isMobile: true, hasTouch: true },
  laptop: { viewport: { width: 1280, height: 720 } },
  desktop: { viewport: { width: 1366, height: 900 } },
};

const results = [];
const log = (ok, msg) => {
  results.push({ ok, msg });
  console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`);
};

export function report() {
  const fails = results.filter((r) => !r.ok);
  console.log(`\n${results.length - fails.length} passed, ${fails.length} failed`);
  for (const f of fails) console.log("  ✗ " + f.msg);
  return fails.length;
}

export async function launch({ out = "review-out", headed = !!process.env.HEADED } = {}) {
  const { chromium } = loadPlaywright();
  const dir = resolve(out);
  mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL ?? "chrome", headless: !headed });
  let shotN = 0;
  return {
    browser,
    // A fresh context (separate storage, like a separate person) and a page.
    // `storage` is a Playwright storageState object or file; `init` runs in
    // the page before the app loads (seed localStorage, sign in).
    async page(size = "desktop", { label = size, storage, init, reducedMotion = "no-preference" } = {}) {
      const context = await browser.newContext({ ...sizes[size], storageState: storage, reducedMotion });
      if (init) await context.addInitScript(init);
      const page = await context.newPage();
      return { context, page, h: helpers(page, `${label}-${size}`) };
    },
    // Another tab for the same person (shares storage).
    async tab(context, label) {
      const page = await context.newPage();
      return { page, h: helpers(page, label) };
    },
    async close() {
      await browser.close();
      process.exitCode = report() ? 1 : 0;
    },
  };

  function helpers(page, label) {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    return {
      label,
      // Runs an action plus its assertions; a throw is a failure, not a crash.
      async step(desc, fn) {
        try {
          await page.bringToFront(); // background tabs pause observers and timers
          await fn();
          log(true, `${label}: ${desc}`);
        } catch (e) {
          log(false, `${label}: ${desc} → ${e.message.split("\n")[0]}`);
        }
      },
      // Read the app's stored state (localStorage key) and check it.
      async expectStored(desc, key, check) {
        const value = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "null"), key);
        let ok = false;
        try {
          ok = !!check(value);
        } catch {}
        log(ok, `${label}: stored ${desc}`);
      },
      // Fixed/sticky things only look right in viewport shots; use full for long pages.
      async shot(name, { full = false } = {}) {
        const file = `${dir}/${String(++shotN).padStart(2, "0")}-${label}-${name}.png`;
        await page.screenshot({ path: file, fullPage: full });
        return file;
      },
      // Sideways overflow, skipping intended scrollers and fixed bars.
      async overflow(where, skip = []) {
        const r = await page.evaluate((skipSel) => {
          const w = document.documentElement.clientWidth;
          const skipQ = ["[data-scroll-x]", ...skipSel].join(",");
          const wide = [...document.querySelectorAll("body *")]
            .filter((e) => {
              const b = e.getBoundingClientRect();
              if (!b.width || (b.right <= w + 1 && b.left >= -1)) return false;
              if (e.closest(skipQ)) return false;
              // Inside a fixed bar or a clipping/scrolling box: not page overflow.
              for (let p = e; p && p !== document.body; p = p.parentElement) {
                const cs = getComputedStyle(p);
                if (cs.position === "fixed") return false;
                if (p !== e && /auto|scroll|hidden|clip/.test(cs.overflowX)) return false;
              }
              return true;
            })
            .slice(0, 4)
            .map((e) => (typeof e.className === "string" && e.className) || e.tagName);
          return { scroll: document.documentElement.scrollWidth > w, wide };
        }, skip);
        log(!r.scroll && !r.wide.length, `${label}: no sideways overflow on ${where}${r.wide.length ? ` (${r.wide.join(" | ")})` : ""}`);
      },
      // Broken layout the overflow check can't see: a content block squeezed
      // to a sliver while its container has room, or a visible block left
      // faded (an animation that never finished, a stray opacity rule).
      // Run after animations settle (or with reducedMotion: "reduce").
      async layout(where, { blocks = ".card, .ds-card, .stat-tile, .pl-station, article, main section", skip = [] } = {}) {
        const bad = await page.evaluate(
          ({ blocks, skip }) => {
            const out = [];
            const skipQ = ["[aria-hidden='true']", "[inert]", ".masthead-art", ...skip].join(",");
            const opacity = (e) => {
              let o = 1;
              for (let p = e; p; p = p.parentElement) o *= Number(getComputedStyle(p).opacity);
              return o;
            };
            for (const e of document.querySelectorAll(blocks)) {
              if (e.closest(skipQ)) continue;
              const b = e.getBoundingClientRect();
              if (!b.width || !b.height) continue;
              const name = (typeof e.className === "string" && e.className.split(" ").slice(0, 2).join(".")) || e.tagName;
              const room = e.parentElement.getBoundingClientRect().width;
              if (b.width < 120 && room > 300 && b.height > b.width * 2) out.push(`${name} squeezed to ${Math.round(b.width)}px`);
              const o = opacity(e);
              if (o < 0.9) out.push(`${name} at ${Math.round(o * 100)}% opacity`);
            }
            return out.slice(0, 4);
          },
          { blocks, skip },
        );
        log(!bad.length, `${label}: layout holds on ${where}${bad.length ? ` (${bad.join(" | ")})` : ""}`);
      },
      // Call at the end of each journey.
      errors(where = "journey") {
        log(!errors.length, `${label}: no console or page errors in ${where}${errors.length ? ` → ${errors.slice(0, 3).join(" || ")}` : ""}`);
      },
    };
  }
}
