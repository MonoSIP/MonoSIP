#!/bin/sh
set -e
cd /app

# Image already builds @munasip/shared — only rebuild if dist is missing (dev/override images).
if [ ! -f /app/packages/shared/dist/index.js ]; then
  pnpm --filter @munasip/shared build
fi

cd /app/apps/api

# shellcheck disable=SC1091
. /app/apps/api/scripts/bootstrap-runtime.sh

# Files named before the MunaSIP rename (configs, sounds folder) move once.
# shellcheck disable=SC1091
. /app/apps/api/scripts/migrate-legacy-names.sh

# Embedded Asterisk (NineDeploy all-in-one). Skipped when ASTERISK_ARI_URL points at `asterisk` host (Compose).
# shellcheck disable=SC1091
. /app/apps/api/scripts/start-asterisk.sh

# Embedded TTS (Edge / EMA) on 127.0.0.1:5500 — no sidecar required.
# shellcheck disable=SC1091
. /app/apps/api/scripts/start-tts.sh

echo "Waiting for postgres..."
i=0
ok=0
while [ "$i" -lt 30 ]; do
  if psql "$DATABASE_URL" -c 'select 1' >/dev/null 2>&1; then
    echo "postgres ok"
    ok=1
    break
  fi
  i=$((i + 1))
  sleep 1
done

if [ "$ok" != "1" ]; then
  echo "FATAL: Postgres not reachable with DATABASE_URL."
  exit 1
fi

pnpm exec tsx src/db/migrate.ts
pnpm exec tsx src/db/seed.ts

exec pnpm exec tsx src/index.ts
