#!/usr/bin/env bash
# Architectural dependency rules (dependency-cruiser).
# Cruises from entry points — directory globs currently return 0 modules with
# this toolchain on the monorepo layout.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

npx --yes dependency-cruiser@16.10.2 \
  -c .dependency-cruiser.cjs \
  -T err \
  apps/api/src/index.ts \
  packages/shared/src/index.ts \
  apps/web/src/main.tsx \
  apps/web/src/App.tsx
