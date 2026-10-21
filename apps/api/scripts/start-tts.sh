#!/bin/sh
# Embedded TTS (Edge / EMA) — runs inside the all-in-one container.
# Sourced from docker-entrypoint.sh. No sidecar / no external TTS host required.
# Set TTS_EMBEDDED=0 to skip (e.g. point TTS_URL at an external service).

DATA_DIR="${DSIP_DATA_DIR:-/data}"
TTS_DIR="${TTS_DIR:-/app/docker/tts}"
TTS_HOST_BIND="${TTS_HOST_BIND:-127.0.0.1}"
TTS_PORT_BIND="${TTS_PORT_BIND:-5500}"
TTS_PID_FILE="${TTS_PID_FILE:-/tmp/dsip-tts.pid}"
TTS_LOG="${TTS_LOG:-$DATA_DIR/logs/tts.log}"

if [ "${TTS_EMBEDDED:-1}" = "0" ] || [ "${TTS_EMBEDDED:-1}" = "false" ]; then
  echo "Embedded TTS skipped (TTS_EMBEDDED=0)"
  return 0 2>/dev/null || exit 0
fi

if [ ! -f "$TTS_DIR/server.py" ]; then
  echo "WARN: embedded TTS missing ($TTS_DIR/server.py) — set TTS_URL or rebuild image"
  return 0 2>/dev/null || exit 0
fi

# Default API target to the local process (override still allowed via env).
if [ -z "${TTS_URL:-}" ]; then
  export TTS_URL="http://${TTS_HOST_BIND}:${TTS_PORT_BIND}"
fi

# Already healthy (restart / hot path)?
if curl -fsS --max-time 2 "http://${TTS_HOST_BIND}:${TTS_PORT_BIND}/health" >/dev/null 2>&1; then
  echo "Embedded TTS already up at ${TTS_URL}"
  return 0 2>/dev/null || exit 0
fi

mkdir -p "$(dirname "$TTS_LOG")" "$DATA_DIR/logs" 2>/dev/null || true
export HF_HOME="${HF_HOME:-/models/hf}"
export TTS_ENGINE="${TTS_ENGINE:-auto}"
export TTS_ENABLE_EMA="${TTS_ENABLE_EMA:-1}"

echo "Starting embedded TTS on ${TTS_HOST_BIND}:${TTS_PORT_BIND}..."
(
  cd "$TTS_DIR" || exit 1
  # Single worker: EMA is memory-heavy; timeout covers cold neural synth.
  exec gunicorn \
    -b "${TTS_HOST_BIND}:${TTS_PORT_BIND}" \
    -w 1 \
    --timeout 120 \
    --access-logfile - \
    --error-logfile - \
    "server:app"
) >>"$TTS_LOG" 2>&1 &
echo $! >"$TTS_PID_FILE"

# Wait until /health answers (models may already be cached in the image).
i=0
while [ "$i" -lt 60 ]; do
  if curl -fsS --max-time 2 "http://${TTS_HOST_BIND}:${TTS_PORT_BIND}/health" >/dev/null 2>&1; then
    echo "Embedded TTS ready (${TTS_URL})"
    return 0 2>/dev/null || exit 0
  fi
  i=$((i + 1))
  sleep 1
done

echo "WARN: embedded TTS did not become healthy within 60s — check $TTS_LOG"
return 0 2>/dev/null || exit 0
