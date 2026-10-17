#!/bin/sh
# Prepare secrets + optional embedded Postgres so Deploy works with zero panel env.
# Must be sourced:  . /app/apps/api/scripts/bootstrap-runtime.sh
set -e

DATA_DIR="${DSIP_DATA_DIR:-/data}"
SECRETS_FILE="$DATA_DIR/.dsip-secrets"
PGDATA="$DATA_DIR/postgres"

mkdir -p "$DATA_DIR/recordings" "$DATA_DIR/uploads" "$DATA_DIR/asterisk" "$PGDATA" /var/run/postgresql

# --- Secrets (persist across redeploys via volume) ---
if [ -f "$SECRETS_FILE" ]; then
  # shellcheck disable=SC1090
  . "$SECRETS_FILE"
fi

if [ -z "${SESSION_SECRET:-}" ]; then
  SESSION_SECRET="$(openssl rand -hex 32)"
fi
if [ -z "${ENCRYPTION_KEY:-}" ]; then
  ENCRYPTION_KEY="$(openssl rand -hex 32)"
fi
if [ -z "${INTERNAL_API_SECRET:-}" ]; then
  INTERNAL_API_SECRET="$(openssl rand -hex 24)"
fi

umask 077
cat > "$SECRETS_FILE" <<EOF
export SESSION_SECRET='$SESSION_SECRET'
export ENCRYPTION_KEY='$ENCRYPTION_KEY'
export INTERNAL_API_SECRET='$INTERNAL_API_SECRET'
EOF
# shellcheck disable=SC1090
. "$SECRETS_FILE"
export SESSION_SECRET ENCRYPTION_KEY INTERNAL_API_SECRET

export ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
export ADMIN_PASSWORD="${ADMIN_PASSWORD:-Admin123!}"
export RECORDINGS_DIR="${RECORDINGS_DIR:-$DATA_DIR/recordings}"
export UPLOADS_DIR="${UPLOADS_DIR:-$DATA_DIR/uploads}"
export ASTERISK_CONFIG_DIR="${ASTERISK_CONFIG_DIR:-$DATA_DIR/asterisk}"

# Prefer injected / vault DATABASE_URL (or common aliases).
if [ -z "${DATABASE_URL:-}" ] && [ -n "${POSTGRES_URL:-}" ]; then
  export DATABASE_URL="$POSTGRES_URL"
fi
if [ -z "${DATABASE_URL:-}" ] && [ -n "${POSTGRES_PRIVATE_URL:-}" ]; then
  export DATABASE_URL="$POSTGRES_PRIVATE_URL"
fi

if [ -n "${DATABASE_URL:-}" ]; then
  echo "Using DATABASE_URL from environment"
  return 0
fi

PG_BIN=""
for cand in /usr/lib/postgresql/*/bin; do
  if [ -x "$cand/initdb" ]; then
    PG_BIN="$cand"
    break
  fi
done

if [ -z "$PG_BIN" ]; then
  echo "FATAL: No DATABASE_URL and embedded Postgres binaries not found in image."
  return 1
fi

echo "No DATABASE_URL — starting embedded Postgres in $PGDATA"
chown -R postgres:postgres "$PGDATA" /var/run/postgresql

if [ ! -s "$PGDATA/PG_VERSION" ]; then
  su -s /bin/sh postgres -c "$PG_BIN/initdb -D '$PGDATA' --auth-local=trust --auth-host=trust --encoding=UTF8 --locale=C"
fi

if ! su -s /bin/sh postgres -c "$PG_BIN/pg_ctl -D '$PGDATA' status" >/dev/null 2>&1; then
  su -s /bin/sh postgres -c "$PG_BIN/pg_ctl -D '$PGDATA' -l '$DATA_DIR/postgres.log' -o \"-c listen_addresses=127.0.0.1 -c port=5432 -c unix_socket_directories=/var/run/postgresql\" -w start"
fi

i=0
while [ "$i" -lt 30 ]; do
  if su -s /bin/sh postgres -c "$PG_BIN/pg_isready -h 127.0.0.1 -p 5432" >/dev/null 2>&1; then
    break
  fi
  i=$((i + 1))
  sleep 1
done

su -s /bin/sh postgres -c "$PG_BIN/psql -h 127.0.0.1 -d postgres -tc \"SELECT 1 FROM pg_roles WHERE rolname='dsip'\"" | grep -q 1 \
  || su -s /bin/sh postgres -c "$PG_BIN/psql -h 127.0.0.1 -d postgres -c \"CREATE ROLE dsip LOGIN PASSWORD 'dsip' SUPERUSER;\""

su -s /bin/sh postgres -c "$PG_BIN/psql -h 127.0.0.1 -d postgres -tc \"SELECT 1 FROM pg_database WHERE datname='dsip'\"" | grep -q 1 \
  || su -s /bin/sh postgres -c "$PG_BIN/psql -h 127.0.0.1 -d postgres -c \"CREATE DATABASE dsip OWNER dsip;\""

export DATABASE_URL="postgresql://dsip:dsip@127.0.0.1:5432/dsip"
echo "Embedded Postgres ready"
