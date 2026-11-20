#!/usr/bin/env bash
# Build a Cloudflare Pages bundle without leaving a half-published dist folder.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

OUT="$ROOT/pages/dist"
TMP="$ROOT/pages/.worker-build.tmp.js"
trap 'rm -f "$TMP"' EXIT

# Resolve esbuild from an explicit override, local install, system install, or npm.
ESBUILD="${ESBUILD_BIN:-}"
if [[ -n "$ESBUILD" && ! -x "$ESBUILD" ]]; then
  echo "ESBUILD_BIN is set but is not executable: $ESBUILD" >&2
  exit 2
fi
if [[ -z "$ESBUILD" && -x "$ROOT/node_modules/.bin/esbuild" ]]; then ESBUILD="$ROOT/node_modules/.bin/esbuild"; fi
if [[ -z "$ESBUILD" ]] && command -v esbuild >/dev/null 2>&1; then ESBUILD="$(command -v esbuild)"; fi

BUILD_ARGS=(src/pages_entry.js --bundle --format=esm --platform=neutral --main-fields=module,main --conditions=workerd,worker,browser --external:node:* --outfile="$TMP" --log-level=warning)
if [[ -n "$ESBUILD" ]]; then
  "$ESBUILD" "${BUILD_ARGS[@]}"
else
  echo "esbuild unavailable locally; using npm's temporary package runner." >&2
  # npm network fallback is bounded when GNU timeout is available; set BUILD_TIMEOUT_SECONDS to adjust.
  RUN=(npx --yes esbuild "${BUILD_ARGS[@]}")
  if command -v timeout >/dev/null 2>&1; then
    timeout "${BUILD_TIMEOUT_SECONDS:-90}s" "${RUN[@]}"
  else
    "${RUN[@]}"
  fi
fi

# Only update Pages output after bundling succeeds, preventing a stale/partial deployment.
NEW="$ROOT/pages/.dist-new"
rm -rf "$NEW"
mkdir -p "$NEW"
cp -r public/. "$NEW/"
cp "$TMP" "$NEW/_worker.js"
rm -rf "$OUT"
mv "$NEW" "$OUT"
echo "Pages build complete: $OUT"
