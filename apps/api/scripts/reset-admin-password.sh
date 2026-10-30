#!/bin/sh
# Restore every admin password to the install default (Admin123!).
# Compose already injects DATABASE_URL. The all-in-one image only sets it
# inside the entrypoint, so a fresh `docker exec` falls back to embedded Postgres.
set -e
cd "$(dirname "$0")/.."

if [ -z "${DATABASE_URL:-}" ] && [ -n "${POSTGRES_URL:-}" ]; then
  export DATABASE_URL="$POSTGRES_URL"
fi
if [ -z "${DATABASE_URL:-}" ] && [ -n "${POSTGRES_PRIVATE_URL:-}" ]; then
  export DATABASE_URL="$POSTGRES_PRIVATE_URL"
fi
if [ -z "${DATABASE_URL:-}" ] && [ -s "${MONOSIP_DATA_DIR:-/data}/postgres/PG_VERSION" ]; then
  export DATABASE_URL="postgresql://monosip:monosip@127.0.0.1:5432/monosip"
fi

exec pnpm exec tsx src/db/reset-admin-password.ts
