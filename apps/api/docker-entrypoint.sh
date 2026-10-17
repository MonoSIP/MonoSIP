#!/bin/sh
set -e
cd /app
pnpm --filter @dsip/shared build
cd /app/apps/api

# shellcheck disable=SC1091
. /app/apps/api/scripts/bootstrap-runtime.sh

echo "Waiting for postgres..."
i=0
ok=0
while [ "$i" -lt 60 ]; do
  if pnpm exec tsx -e "import pg from 'pg'; const p=new pg.Pool({connectionString:process.env.DATABASE_URL}); await p.query('select 1'); await p.end(); console.log('postgres ok');"; then
    ok=1
    break
  fi
  i=$((i + 1))
  sleep 2
done

if [ "$ok" != "1" ]; then
  echo "FATAL: Postgres not reachable with DATABASE_URL after ~2 minutes."
  exit 1
fi

pnpm exec tsx src/db/migrate.ts
pnpm exec tsx src/db/seed.ts

exec pnpm exec tsx src/index.ts
