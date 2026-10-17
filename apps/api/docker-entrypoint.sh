#!/bin/sh
set -e
cd /app

# Image already builds @dsip/shared — only rebuild if dist is missing (dev/override images).
if [ ! -f /app/packages/shared/dist/index.js ]; then
  pnpm --filter @dsip/shared build
fi

cd /app/apps/api

# shellcheck disable=SC1091
. /app/apps/api/scripts/bootstrap-runtime.sh

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
