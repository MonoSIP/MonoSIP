#!/bin/sh
set -e
cd /app
pnpm --filter @dsip/shared build
cd /app/apps/api

echo "Waiting for postgres..."
i=0
while [ "$i" -lt 40 ]; do
  if pnpm exec tsx -e "import pg from 'pg'; const p=new pg.Pool({connectionString:process.env.DATABASE_URL}); p.query('select 1').then(()=>p.end()).then(()=>console.log('ok')).catch((e)=>{console.error(e); process.exit(1)})"; then
    break
  fi
  i=$((i+1))
  sleep 2
done

if [ ! -d drizzle ] || [ -z "$(ls -A drizzle 2>/dev/null)" ]; then
  pnpm exec drizzle-kit generate
fi

pnpm exec tsx src/db/migrate.ts
pnpm exec tsx src/db/seed.ts

exec pnpm exec tsx src/index.ts
