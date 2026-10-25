#!/bin/sh
# Prepare secrets + optional embedded Postgres so Deploy works with zero panel env.
# Must be sourced:  . /app/apps/api/scripts/bootstrap-runtime.sh
set -e

# Before the MonoSIP rename the env prefix was DSIP_: an old DSIP_X fills
# MONOSIP_X when that is not set (vaults of existing deployments keep working).
for legacy in $(env | sed -n 's/^DSIP_\([A-Za-z0-9_]*\)=.*/\1/p'); do
  if [ -z "$(printenv "MONOSIP_$legacy")" ]; then
    export "MONOSIP_$legacy=$(printenv "DSIP_$legacy")"
  fi
done

DATA_DIR="${MONOSIP_DATA_DIR:-/data}"
SECRETS_FILE="$DATA_DIR/.monosip-secrets"
PERSIST_MARKER="$DATA_DIR/.monosip-persistent"
# Files written under the old name move once
for pair in ".dsip-secrets:.monosip-secrets" ".dsip-persistent:.monosip-persistent"; do
  old="$DATA_DIR/${pair%%:*}"
  new="$DATA_DIR/${pair#*:}"
  if [ -f "$old" ] && [ ! -e "$new" ]; then
    mv "$old" "$new" && echo "Renamed $old → $new"
  fi
done
PGDATA="$DATA_DIR/postgres"
PGLOG="$PGDATA/server.log"
# Tiny shared memory profile — NineDeploy/Docker often leave /dev/shm at 64MB.
PG_OPTS="-c listen_addresses=127.0.0.1 -c port=5432 -c unix_socket_directories=/var/run/postgresql -c logging_collector=off -c shared_buffers=32MB -c max_connections=40 -c work_mem=1MB -c maintenance_work_mem=16MB -c wal_buffers=1MB -c min_wal_size=32MB -c max_wal_size=64MB -c dynamic_shared_memory_type=posix"

# /data must be a real volume/bind mount. If it sits on the container overlay,
# every redeploy wipes Postgres, secrets, trunks, and recordings.
data_is_persistent_mount() {
  grep -q " ${DATA_DIR} " /proc/mounts 2>/dev/null
}

if ! data_is_persistent_mount; then
  echo ""
  echo "╔══════════════════════════════════════════════════════════════════════╗"
  echo "║  FATAL RISK: ${DATA_DIR} is NOT a Docker volume — data will vanish ║"
  echo "║  on every rebuild/redeploy (settings, extensions, trunks, CDR).    ║"
  echo "║  Fix (NineDeploy): Service → Volume → mount path ${DATA_DIR}       ║"
  echo "║  Fix (docker):     -v monosip-data:${DATA_DIR}                        ║"
  echo "╚══════════════════════════════════════════════════════════════════════╝"
  echo ""
  # Production hosts must not boot on ephemeral storage (silent wipe).
  # Local/dev: set MONOSIP_ALLOW_EPHEMERAL_DATA=1 to skip this check.
  if [ "${MONOSIP_REQUIRE_PERSISTENT_DATA:-}" = "1" ] || [ "${MONOSIP_REQUIRE_PERSISTENT_DATA:-}" = "true" ]; then
    echo "FATAL: MONOSIP_REQUIRE_PERSISTENT_DATA=1 and ${DATA_DIR} is not a mount"
    return 1
  fi
  if [ -n "${PUBLIC_HOST:-}" ] && [ "$PUBLIC_HOST" != "localhost" ] && [ "$PUBLIC_HOST" != "127.0.0.1" ]; then
    if [ "${MONOSIP_ALLOW_EPHEMERAL_DATA:-}" != "1" ] && [ "${MONOSIP_ALLOW_EPHEMERAL_DATA:-}" != "true" ]; then
      echo "FATAL: PUBLIC_HOST=${PUBLIC_HOST} requires a persistent volume at ${DATA_DIR}"
      echo "  (set MONOSIP_ALLOW_EPHEMERAL_DATA=1 only for disposable lab deploys)"
      return 1
    fi
  fi
fi

HAD_SECRETS=0
HAD_PG=0
[ -f "$SECRETS_FILE" ] && HAD_SECRETS=1
[ -s "$PGDATA/PG_VERSION" ] && HAD_PG=1

mkdir -p "$DATA_DIR/recordings" "$DATA_DIR/uploads" "$DATA_DIR/asterisk" "$PGDATA" /var/run/postgresql

# NineDeploy volumes may be owned by a non-root UID — reclaim postgres data dir every boot.
chown -R postgres:postgres "$PGDATA" /var/run/postgresql 2>/dev/null || true
chmod 700 "$PGDATA" 2>/dev/null || true

echo "MonoSIP data dir: $DATA_DIR (secrets=$HAD_SECRETS pg_cluster=$HAD_PG)"
if [ "$HAD_SECRETS" = "1" ] && [ "$HAD_PG" = "0" ]; then
  echo "╔══════════════════════════════════════════════════════════════════════╗"
  echo "║  DATA LOSS RISK: secrets file exists but Postgres cluster is gone  ║"
  echo "║  /data volume may not be mounted persistently across deploys.      ║"
  echo "║  Fix: ensure NineDeploy volume → /data, or set DATABASE_URL.       ║"
  echo "╚══════════════════════════════════════════════════════════════════════╝"
  if [ "${MONOSIP_REQUIRE_PERSISTENT_DATA:-}" = "1" ]; then
    echo "FATAL: MONOSIP_REQUIRE_PERSISTENT_DATA=1 — refusing to init empty DB over existing secrets"
    return 1
  fi
fi
if [ "$HAD_SECRETS" = "0" ] && [ "$HAD_PG" = "0" ] && [ -f "$PERSIST_MARKER" ]; then
  echo "WARN: persistence marker found but secrets+Postgres missing — volume was wiped"
fi

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
# ARI/AMI — persist so redeploys keep dialplan curl + ARI clients in sync
if [ -z "${ASTERISK_ARI_PASSWORD:-}" ]; then
  ASTERISK_ARI_PASSWORD="$(openssl rand -hex 16)"
fi
if [ -z "${ASTERISK_AMI_PASSWORD:-}" ]; then
  ASTERISK_AMI_PASSWORD="$(openssl rand -hex 16)"
fi
if [ -z "${ASTERISK_ARI_USER:-}" ]; then
  ASTERISK_ARI_USER="monosip"
fi
if [ -z "${ASTERISK_AMI_USER:-}" ]; then
  ASTERISK_AMI_USER="monosip"
fi

# Only the secrets file is private: a global umask 077 leaked into Asterisk's
# sound folders (root 700), which Asterisk (runuser=asterisk) then cannot read.
if ! (umask 077 && cat > "$SECRETS_FILE") <<EOF
export SESSION_SECRET='$SESSION_SECRET'
export ENCRYPTION_KEY='$ENCRYPTION_KEY'
export INTERNAL_API_SECRET='$INTERNAL_API_SECRET'
export ASTERISK_ARI_USER='$ASTERISK_ARI_USER'
export ASTERISK_ARI_PASSWORD='$ASTERISK_ARI_PASSWORD'
export ASTERISK_AMI_USER='$ASTERISK_AMI_USER'
export ASTERISK_AMI_PASSWORD='$ASTERISK_AMI_PASSWORD'
EOF
then
  echo "WARN: cannot write $SECRETS_FILE (volume permissions?) — secrets will not persist"
fi
# shellcheck disable=SC1090
[ -f "$SECRETS_FILE" ] && . "$SECRETS_FILE"
export SESSION_SECRET ENCRYPTION_KEY INTERNAL_API_SECRET
export ASTERISK_ARI_USER ASTERISK_ARI_PASSWORD ASTERISK_AMI_USER ASTERISK_AMI_PASSWORD

export ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
export ADMIN_PASSWORD="${ADMIN_PASSWORD:-Admin123!}"
export RECORDINGS_DIR="${RECORDINGS_DIR:-$DATA_DIR/recordings}"
export UPLOADS_DIR="${UPLOADS_DIR:-$DATA_DIR/uploads}"
export ASTERISK_CONFIG_DIR="${ASTERISK_CONFIG_DIR:-$DATA_DIR/asterisk}"

# Public identity — vault should set these for production (e.g. pbx.example.com)
if [ -n "${PUBLIC_HOST:-}" ] && { [ -z "${PUBLIC_URL:-}" ] || [ "$PUBLIC_URL" = "https://localhost" ]; }; then
  export PUBLIC_URL="https://${PUBLIC_HOST}"
fi
if [ -n "${PUBLIC_HOST:-}" ] && { [ -z "${SIP_DOMAIN:-}" ] || [ "$SIP_DOMAIN" = "localhost" ]; }; then
  export SIP_DOMAIN="$PUBLIC_HOST"
fi
if [ -n "${PUBLIC_HOST:-}" ] && { [ -z "${SIP_WSS_URL:-}" ] || [ "$SIP_WSS_URL" = "wss://localhost/asterisk-ws" ]; }; then
  export SIP_WSS_URL="wss://${PUBLIC_HOST}/asterisk-ws"
fi
# WebRTC/RTP needs a public address in ICE candidates (softphone audio).
if [ -z "${EXTERNAL_IP:-}" ] && [ -n "${PUBLIC_HOST:-}" ]; then
  RESOLVED="$(getent ahostsv4 "$PUBLIC_HOST" 2>/dev/null | awk '{print $1; exit}')"
  if [ -n "$RESOLVED" ]; then
    export EXTERNAL_IP="$RESOLVED"
    echo "EXTERNAL_IP unset — using $EXTERNAL_IP from PUBLIC_HOST=$PUBLIC_HOST"
  fi
fi

# Softphone audio = host UDP RTP. Users often skip this; shout early in deploy logs.
if [ -n "${PUBLIC_HOST:-}" ] && [ "$PUBLIC_HOST" != "localhost" ] && [ "$PUBLIC_HOST" != "127.0.0.1" ]; then
  if [ "${MONOSIP_RTP_PUBLISHED:-}" != "1" ] && [ "${MONOSIP_RTP_PUBLISHED:-}" != "true" ]; then
    echo ""
    echo "╔══════════════════════════════════════════════════════════════════════╗"
    echo "║  MonoSIP softphone AUDIO: publish UDP 10000-10100 to this container   ║"
    echo "║  Then set: EXTERNAL_IP=<public IP>  MONOSIP_RTP_PUBLISHED=1            ║"
    echo "║  Without this, calls connect but stay SILENT.                      ║"
    echo "╚══════════════════════════════════════════════════════════════════════╝"
    echo ""
  fi
fi

# All-in-one defaults (Compose overrides with http://asterisk:8088)
export ASTERISK_ARI_URL="${ASTERISK_ARI_URL:-http://127.0.0.1:8088}"
export ASTERISK_AMI_HOST="${ASTERISK_AMI_HOST:-127.0.0.1}"
export ASTERISK_AMI_PORT="${ASTERISK_AMI_PORT:-5038}"

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

wipe_pgdata() {
  echo "Resetting embedded Postgres data dir…"
  # Stop if running
  su -s /bin/sh postgres -c "$PG_BIN/pg_ctl -D '$PGDATA' -m fast stop" >/dev/null 2>&1 || true
  rm -f "$PGDATA/postmaster.pid"
  find "$PGDATA" -mindepth 1 -maxdepth 1 -exec rm -rf {} + 2>/dev/null || true
  chown -R postgres:postgres "$PGDATA" /var/run/postgresql
  chmod 700 "$PGDATA"
}

init_pgdata() {
  chown -R postgres:postgres "$PGDATA" /var/run/postgresql
  chmod 700 "$PGDATA"
  if [ ! -s "$PGDATA/PG_VERSION" ]; then
    echo "Initializing embedded Postgres cluster…"
    su -s /bin/sh postgres -c "$PG_BIN/initdb -D '$PGDATA' --auth-local=trust --auth-host=trust --encoding=UTF8 --locale=C"
  fi
}

start_pg() {
  # Clear stale pid from previous container instance (volume reuse)
  if [ -f "$PGDATA/postmaster.pid" ]; then
    su -s /bin/sh postgres -c "$PG_BIN/pg_ctl -D '$PGDATA' -m fast stop" >/dev/null 2>&1 || true
    rm -f "$PGDATA/postmaster.pid"
  fi
  # Truncate log so failures are readable
  : > "$PGLOG" 2>/dev/null || true
  chown postgres:postgres "$PGLOG" 2>/dev/null || true
  su -s /bin/sh postgres -c "$PG_BIN/pg_ctl -D '$PGDATA' -l '$PGLOG' -o \"$PG_OPTS\" -w start"
}

# Only wipe incomplete inits (no PG_VERSION). Never destroy a real cluster by default —
# a failed start after image upgrade used to wipe /data/postgres and look like a "reset".
if [ -d "$PGDATA" ] && [ ! -s "$PGDATA/PG_VERSION" ]; then
  echo "WARN: incomplete Postgres dir (no PG_VERSION) — clearing for initdb"
  wipe_pgdata
fi

init_pgdata

if [ -s "$PGDATA/PG_VERSION" ]; then
  echo "Embedded Postgres data version=$(cat "$PGDATA/PG_VERSION") at $PGDATA"
fi

echo "Starting embedded Postgres…"
if ! start_pg; then
  echo "ERROR: Postgres failed to start with existing data (NOT wiping)."
  echo "  If this is a major-version mismatch, attach a managed DATABASE_URL or set"
  echo "  MONOSIP_PG_WIPE_ON_FAIL=1 once (destructive) after backing up /data."
  tail -n 80 "$PGLOG" 2>/dev/null || true
  ls -la "$DATA_DIR" "$PGDATA" 2>/dev/null || true
  df -h "$DATA_DIR" /dev/shm 2>/dev/null || true
  if [ "${MONOSIP_PG_WIPE_ON_FAIL:-}" = "1" ] && [ -s "$PGDATA/PG_VERSION" ]; then
    echo "MONOSIP_PG_WIPE_ON_FAIL=1 — wiping cluster and re-initializing (DATA LOSS)"
    wipe_pgdata
    init_pgdata
    if ! start_pg; then
      echo "FATAL: embedded Postgres failed after wipe"
      tail -n 80 "$PGLOG" 2>/dev/null || true
      return 1
    fi
  else
    return 1
  fi
fi

i=0
while [ "$i" -lt 30 ]; do
  if su -s /bin/sh postgres -c "$PG_BIN/pg_isready -h 127.0.0.1 -p 5432" >/dev/null 2>&1; then
    break
  fi
  i=$((i + 1))
  sleep 1
done

if ! su -s /bin/sh postgres -c "$PG_BIN/pg_isready -h 127.0.0.1 -p 5432" >/dev/null 2>&1; then
  echo "FATAL: embedded Postgres not accepting connections"
  tail -n 80 "$PGLOG" 2>/dev/null || true
  return 1
fi

# Clusters created before the MonoSIP rename have role + database "dsip":
# rename them once (nothing is connected yet — the API starts later).
pgq() { su -s /bin/sh postgres -c "$PG_BIN/psql -h 127.0.0.1 -d postgres -tAc \"$1\""; }
if [ "$(pgq "SELECT 1 FROM pg_roles WHERE rolname='dsip'")" = "1" ] && [ "$(pgq "SELECT 1 FROM pg_roles WHERE rolname='monosip'")" != "1" ]; then
  pgq "ALTER ROLE dsip RENAME TO monosip" >/dev/null && pgq "ALTER ROLE monosip PASSWORD 'monosip'" >/dev/null \
    && echo "Renamed Postgres role dsip → monosip"
fi
if [ "$(pgq "SELECT 1 FROM pg_database WHERE datname='dsip'")" = "1" ] && [ "$(pgq "SELECT 1 FROM pg_database WHERE datname='monosip'")" != "1" ]; then
  pgq "ALTER DATABASE dsip RENAME TO monosip" >/dev/null && echo "Renamed database dsip → monosip"
fi

su -s /bin/sh postgres -c "$PG_BIN/psql -h 127.0.0.1 -d postgres -tc \"SELECT 1 FROM pg_roles WHERE rolname='monosip'\"" | grep -q 1 \
  || su -s /bin/sh postgres -c "$PG_BIN/psql -h 127.0.0.1 -d postgres -c \"CREATE ROLE monosip LOGIN PASSWORD 'monosip' SUPERUSER;\""

su -s /bin/sh postgres -c "$PG_BIN/psql -h 127.0.0.1 -d postgres -tc \"SELECT 1 FROM pg_database WHERE datname='monosip'\"" | grep -q 1 \
  || su -s /bin/sh postgres -c "$PG_BIN/psql -h 127.0.0.1 -d postgres -c \"CREATE DATABASE monosip OWNER monosip;\""

export DATABASE_URL="postgresql://monosip:monosip@127.0.0.1:5432/monosip"
# Marker proves /data survived at least one previous boot (helps spot volume wipes).
if [ ! -f "$PERSIST_MARKER" ]; then
  echo "first_boot=$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$PERSIST_MARKER" 2>/dev/null || true
  echo "Embedded Postgres ready (fresh cluster — lab seed may create defaults)"
else
  echo "Embedded Postgres ready (existing /data volume)"
fi
