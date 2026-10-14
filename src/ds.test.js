// Design system guards, the member app's ds.test.js applied to Replay:
// - tokens.js matches tokens.css
// - every --ds-* name in use exists
// - no raw colors outside tokens.css
// - no class defined twice at the top level, and no CSS for classes that
//   no component uses (the two ways one page's styles leak into another)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as tokens from "./ds/tokens.js";

const root = fileURLToPath(new URL(".", import.meta.url));
const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
const files = walk(root);
const read = (p) => readFileSync(p, "utf8");
const rel = (p) => p.slice(root.length).replace(/\\/g, "/");
const TOKENS = join(root, "ds", "tokens.css");
const stylesheets = files.filter((p) => p.endsWith(".css") && p !== TOKENS);
const components = files.filter(
  (p) => p.endsWith(".jsx") && !/\.test\./.test(p),
);
const code = files
  .filter((p) => /\.jsx?$/.test(p) && !/\.test\./.test(p))
  .map(read)
  .join("\n");

const tokenCss = read(TOKENS);
const defined = Object.fromEntries(
  [...tokenCss.matchAll(/(--ds-[\w-]+):\s*([^;]+);/g)].map((m) => [
    m[1],
    m[2].trim(),
  ]),
);
const resolve = (name) => {
  const v = defined[name];
  const ref = v?.match(/^var\((--ds-[\w-]+)\)$/);
  return ref ? resolve(ref[1]) : v;
};
// Top-level rules (outside @media and friends), comments removed.
const topLevelRules = (css) => {
  const out = [];
  let depth = 0;
  let buf = "";
  for (const ch of css.replace(/\/\*[\s\S]*?\*\//g, "")) {
    if (ch === "{") {
      if (depth === 0) out.push(buf.trim().replace(/\s+/g, " "));
      depth++;
      buf = "";
    } else if (ch === "}") {
      depth--;
      buf = "";
    } else if (ch === ";" && depth === 0) buf = "";
    else buf += ch;
  }
  return out;
};

test("tokens.js mirrors tokens.css", () => {
  for (const [path, name] of Object.entries(tokens.cssNames)) {
    const value = path.split(".").reduce((o, k) => o[k], tokens);
    assert.equal(
      value.toLowerCase(),
      resolve(name)?.toLowerCase(),
      `${path} vs ${name}`,
    );
  }
});

test("every --ds-* name in use is defined", () => {
  for (const p of [...stylesheets, ...components]) {
    for (const [, name] of read(p).matchAll(/var\((--ds-[\w-]+)/g)) {
      assert.ok(name in defined, `${rel(p)} uses ${name}, which isn't a token`);
    }
  }
});

test("no raw colors outside tokens.css", () => {
  for (const p of [...stylesheets, ...components]) {
    const text = read(p).replace(/url\("data:[^"]*"\)/g, "");
    const raw = text.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g) ?? [];
    assert.deepEqual(raw, [], `${rel(p)} has raw colors; use a token`);
  }
});

test("no class is defined twice at the top level", () => {
  const seen = {};
  for (const p of stylesheets)
    for (const sel of topLevelRules(read(p)))
      if (sel.startsWith(".") && !sel.includes(","))
        (seen[sel] ??= []).push(rel(p));
  const twice = Object.entries(seen).filter(([, where]) => where.length > 1);
  assert.deepEqual(
    twice.map(([sel, where]) => `${sel} in ${where.join(", ")}`),
    [],
    "merge these rules or give the second use its own class",
  );
});

test("every class in the CSS is used by a component", () => {
  // A class is used when its name appears in the code, or when the code
  // builds it from a prefix (`tile-${tone}`, "ds-tag-" + tone).
  const used = (cls) => {
    if (new RegExp(`(^|[^\\w-])${cls}([^\\w-]|$)`, "m").test(code)) return true;
    const parts = cls.split("-");
    for (let i = parts.length - 1; i > 0; i--) {
      const pre = `${parts.slice(0, i).join("-")}-`;
      if (/^(rp|cf|cc|ds)-$/.test(pre)) break;
      if (code.includes(`${pre}\${`) || code.includes(`"${pre}"`)) return true;
    }
    return false;
  };
  const unused = new Set();
  for (const p of stylesheets) {
    const text = read(p)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/url\([^)]*\)/g, "");
    for (const [, sel] of text.matchAll(/([^{};]+)\{/g)) {
      if (sel.trim().startsWith("@")) continue;
      for (const [, cls] of sel.matchAll(/\.([a-zA-Z][\w-]*)/g))
        if (!used(cls)) unused.add(`${rel(p)}: .${cls}`);
    }
  }
  assert.deepEqual([...unused], [], "delete CSS for classes nothing uses");
});

test("page classes carry the rp- prefix", () => {
  // Shell classes keep the member app's names so ds components match.
  const page = read(join(root, "replay.css"));
  const off = [...page.matchAll(/\.([a-zA-Z][\w-]*)/g)]
    .map((m) => m[1])
    .filter((c) => !/^(rp-|ds-|is-)/.test(c) && c !== "button");
  assert.deepEqual([...new Set(off)], []);
});
