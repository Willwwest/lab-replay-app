// Copies the LAB member app's design system into Replay, byte for byte.
//   npm run design:sync    copy the files below from the member app
//   npm run design:check   fail if any of them has drifted
// Set LAB_APP_DIR when the member app isn't at ../lab-skill-unlocks/app.
import { readFile, copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.resolve(
  process.env.LAB_APP_DIR || path.join(root, "../lab-skill-unlocks/app"),
);

// Member-app path → Replay path. Same layout on both sides.
const files = [
  "src/ds/tokens.css",
  "src/ds/tokens.js",
  "src/ds/index.jsx",
  "src/ds/components.css",
  "src/DotField.jsx",
  "src/dotfield.css",
  "public/fonts/argentum-800.woff2",
  "public/lab-white.svg",
  "public/favicon.svg",
  "scripts/review-kit.mjs",
];

const check = process.argv.includes("--check");
const drift = [];
for (const file of files) {
  const from = path.join(source, file);
  const to = path.join(root, file);
  if (check) {
    const same = await Promise.all([readFile(from), readFile(to)])
      .then(([a, b]) => a.equals(b))
      .catch(() => false);
    if (!same) drift.push(file);
  } else {
    await mkdir(path.dirname(to), { recursive: true });
    await copyFile(from, to);
  }
}

if (drift.length) {
  console.error(
    `Design files differ from the member app:\n  ${drift.join("\n  ")}\nRun npm run design:sync.`,
  );
  process.exit(1);
}
console.log(
  check
    ? `All ${files.length} design files match the member app.`
    : `Copied ${files.length} design files from ${source}.`,
);
