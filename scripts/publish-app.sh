#!/usr/bin/env bash
# Publishes Replay to the public repo that hosts it on GitHub Pages.
# Only the runnable app is copied: recorded videos (data/), test output,
# the design backup and build output stay here.
set -euo pipefail

PUBLIC_REPO="Willwwest/lab-replay-app"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

gh repo clone "$PUBLIC_REPO" "$WORK" -- -q 2>/dev/null || git init -q -b main "$WORK"
git -C "$WORK" checkout -q -B main
find "$WORK" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +

cd "$ROOT"
cp -r .gitignore .prettierignore .prettierrc.json README.md DESIGN.md PRODUCT.md \
  WORKER-CONTRACT.md index.html package.json package-lock.json vite.config.js \
  public scripts server src "$WORK/"
rm -f "$WORK/public/processor.js" # built in CI by npm run worker
mkdir -p "$WORK/.github/workflows"
cp "$ROOT/scripts/pages.yml" "$WORK/.github/workflows/pages.yml"

cd "$WORK"
git add -A
if git diff --cached --quiet; then
  echo "No app changes to publish."
  exit 0
fi
SOURCE="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo "working tree")"
git -c user.name="$(git -C "$ROOT" config user.name)" -c user.email="$(git -C "$ROOT" config user.email)" \
  commit -q -m "Publish Replay from lab-replay@$SOURCE"
git push -q origin main
echo "Pushed to https://github.com/$PUBLIC_REPO"
