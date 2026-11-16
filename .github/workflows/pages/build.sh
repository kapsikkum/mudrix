#!/usr/bin/env bash
# Builds the web app of one git ref into $RUNNER_TEMP/<name>/apps/web/dist, to be served under <base>.
# Usage: build.sh <name> <ref> <base>      (pages.yml; the wasm-pack and Rust toolchain are already set up)
set -euo pipefail

name="$1"
ref="$2"
base="$3"
dir="$RUNNER_TEMP/$name"

git worktree add --detach "$dir" "$ref"
cd "$dir"
echo "Building $ref as $name under $base"

npm ci --ignore-scripts
npm run tokens
npm run i18n
npm run core:web
BASE_PATH="$base" npm exec -w @mudrix/web -- vite build
