#!/bin/sh
# Start embedded Asterisk for NineDeploy / all-in-one image (background).
# Sourced or executed from docker-entrypoint after bootstrap-runtime.
set -e

ARI_USER="${ASTERISK_ARI_USER:-dsip}"
ARI_PASS="${ASTERISK_ARI_PASSWORD:-ari_secret_change_me}"
AMI_USER="${ASTERISK_AMI_USER:-dsip}"
AMI_PASS="${ASTERISK_AMI_PASSWORD:-ami_secret_change_me}"

if ! command -v asterisk >/dev/null 2>&1; then
  echo "WARN: asterisk binary not found — skip embed"
  return 0 2>/dev/null || exit 0
fi

# Compose sets ASTERISK_ARI_URL=http://asterisk:8088 — do not start a second PBX.
case "${ASTERISK_ARI_URL:-}" in
  http://asterisk:*|http://asterisk/*|https://asterisk:*)
    echo "Using external Asterisk at $ASTERISK_ARI_URL — skip embed"
    return 0 2>/dev/null || exit 0
    ;;
esac

DATA_DIR="${DSIP_DATA_DIR:-/data}"
AST_CFG="${ASTERISK_CONFIG_DIR:-$DATA_DIR/asterisk}"

mkdir -p "$AST_CFG" /var/lib/asterisk /var/spool/asterisk /etc/asterisk/keys \
  /var/lib/asterisk/dsip/sounds/dsip \
  /var/lib/asterisk/dsip/sounds/tr/digits /var/lib/asterisk/dsip/sounds/tr/qpos \
  /var/lib/asterisk/dsip/sounds/en/digits /var/lib/asterisk/dsip/sounds/en/qpos \
  /var/lib/asterisk/dsip/voicemail \
  /var/lib/asterisk/moh/default \
  /var/lib/asterisk/sounds/en \
  /var/log/asterisk

# Persist generated dialplan/PJSIP on the NineDeploy volume.
if [ -e /var/lib/asterisk/dsip ] && [ ! -L /var/lib/asterisk/dsip ]; then
  # Move any seed files into the data dir once, then replace with symlink.
  cp -a /var/lib/asterisk/dsip/. "$AST_CFG/" 2>/dev/null || true
  rm -rf /var/lib/asterisk/dsip
fi
ln -sfn "$AST_CFG" /var/lib/asterisk/dsip

# Asterisk drops to runuser=asterisk — /data must be traversable and confs readable.
# World-readable is enough; never chown -R (hangs NineDeploy volumes).
chmod 755 "$DATA_DIR" "$AST_CFG" 2>/dev/null || true
chmod 644 "$AST_CFG"/pjsip_dsip.conf "$AST_CFG"/acl_dsip.conf \
  "$AST_CFG"/queues_dsip.conf "$AST_CFG"/extensions_dsip.conf \
  "$AST_CFG"/musiconhold_dsip.conf "$AST_CFG"/reload.flag 2>/dev/null || true
# Prompt WAVs are written by the API (often as root with umask 077). Asterisk must read them.
chmod 755 "$AST_CFG"/sounds "$AST_CFG"/sounds/dsip \
  "$AST_CFG"/sounds/en "$AST_CFG"/sounds/tr \
  "$AST_CFG"/moh "$AST_CFG"/voicemail 2>/dev/null || true
find "$AST_CFG"/sounds "$AST_CFG"/moh -type f \( -name '*.wav' -o -name '*.ulaw' -o -name '*.sln*' \) \
  -exec chmod 644 {} + 2>/dev/null || true

# MixMonitor path in dialplan ↔ API RECORDINGS_DIR
mkdir -p "${RECORDINGS_DIR:-$DATA_DIR/recordings}"
if [ -e /var/spool/asterisk/recording ] && [ ! -L /var/spool/asterisk/recording ]; then
  rm -rf /var/spool/asterisk/recording
fi
ln -sfn "${RECORDINGS_DIR:-$DATA_DIR/recordings}" /var/spool/asterisk/recording

chmod 777 "${RECORDINGS_DIR:-$DATA_DIR/recordings}" /var/log/asterisk 2>/dev/null || true
touch /var/log/asterisk/messages /var/log/asterisk/full /var/log/asterisk/security 2>/dev/null || true

ln -sfn /var/lib/asterisk/dsip/sounds/dsip /var/lib/asterisk/sounds/dsip
rm -rf /var/lib/asterisk/sounds/tr
ln -sfn /var/lib/asterisk/dsip/sounds/tr /var/lib/asterisk/sounds/tr

overlay_en_sounds() {
  for f in /var/lib/asterisk/dsip/sounds/en/*.wav; do
    [ -f "$f" ] || continue
    ln -sfn "$f" "/var/lib/asterisk/sounds/en/$(basename "$f")"
  done
  mkdir -p /var/lib/asterisk/sounds/en/digits /var/lib/asterisk/sounds/en/qpos
  for f in /var/lib/asterisk/dsip/sounds/en/digits/*.wav; do
    [ -f "$f" ] || continue
    ln -sfn "$f" "/var/lib/asterisk/sounds/en/digits/$(basename "$f")"
  done
  for f in /var/lib/asterisk/dsip/sounds/en/qpos/*.wav; do
    [ -f "$f" ] || continue
    ln -sfn "$f" "/var/lib/asterisk/sounds/en/qpos/$(basename "$f")"
  done
}
overlay_en_sounds

python3 - <<'PY' 2>/dev/null || true
import math, struct, wave, os
from pathlib import Path

def write_tone(path: Path, secs: float, freq: float, duty: float = 1.0):
    path.parent.mkdir(parents=True, exist_ok=True)
    rate = 8000
    n = int(rate * secs)
    with wave.open(str(path), "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        frames = bytearray()
        for i in range(n):
            on = (i % rate) < int(rate * duty) if duty < 1 else True
            env = 0.35 if on else 0.0
            sample = int(env * 16000 * math.sin(2 * math.pi * freq * i / rate))
            frames += struct.pack("<h", max(-32767, min(32767, sample)))
        w.writeframes(frames)

moh = Path("/var/lib/asterisk/dsip/moh/default/wait.wav")
if not moh.is_file():
    write_tone(moh, 4.0, 440, duty=0.2)
Path("/var/lib/asterisk/moh").mkdir(parents=True, exist_ok=True)
legacy = Path("/var/lib/asterisk/moh/default")
if not legacy.exists():
    try:
        os.symlink("/var/lib/asterisk/dsip/moh/default", str(legacy))
    except OSError:
        pass
beep = Path("/var/lib/asterisk/sounds/en/beep.wav")
if not beep.is_file():
    write_tone(beep, 0.25, 880, duty=1.0)
root_beep = Path("/var/lib/asterisk/sounds/beep.wav")
if not root_beep.is_file():
    write_tone(root_beep, 0.25, 880, duty=1.0)
PY

if [ ! -f /etc/asterisk/keys/asterisk.pem ]; then
  openssl req -x509 -newkey rsa:2048 -nodes \
    -keyout /tmp/asterisk.key \
    -out /tmp/asterisk.crt \
    -days 3650 \
    -subj "/CN=asterisk" 2>/dev/null
  cat /tmp/asterisk.key /tmp/asterisk.crt > /etc/asterisk/keys/asterisk.pem
  rm -f /tmp/asterisk.key /tmp/asterisk.crt
fi
chown asterisk:asterisk /etc/asterisk/keys /etc/asterisk/keys/asterisk.pem 2>/dev/null || true
chmod 750 /etc/asterisk/keys 2>/dev/null || true
chmod 640 /etc/asterisk/keys/asterisk.pem 2>/dev/null || true

sed -i "s|__ARI_USER__|${ARI_USER}|g" /etc/asterisk/ari.conf /etc/asterisk/http.conf 2>/dev/null || true
sed -i "s|__ARI_PASS__|${ARI_PASS}|g" /etc/asterisk/ari.conf 2>/dev/null || true
sed -i "s|__AMI_USER__|${AMI_USER}|g" /etc/asterisk/manager.conf 2>/dev/null || true
sed -i "s|__AMI_PASS__|${AMI_PASS}|g" /etc/asterisk/manager.conf 2>/dev/null || true

# All-in-one: never publish Asterisk HTTP/AMI on 0.0.0.0 — PaaS may route
# public HTTPS to EXPOSE 8088 and steal traffic from the Node API on :3000.
sed -i 's/^bindaddr=.*/bindaddr=127.0.0.1/' /etc/asterisk/http.conf 2>/dev/null || true
sed -i 's/^bindaddr = .*/bindaddr = 127.0.0.1/' /etc/asterisk/manager.conf 2>/dev/null || true
# AMI ACL is docker-nets only in Compose; allow localhost for embedded API.
if ! grep -q 'permit = 127.0.0.1' /etc/asterisk/manager.conf 2>/dev/null; then
  sed -i '/^permit = 10.0.0.0\/8/a\
permit = 127.0.0.1/32' /etc/asterisk/manager.conf 2>/dev/null || true
fi

EXTERNAL_IP="${EXTERNAL_IP:-}"
if [ -n "$EXTERNAL_IP" ]; then
  sed -i "s|;externaddr=__EXTERNAL_IP__|externaddr=${EXTERNAL_IP}|g" /etc/asterisk/rtp.conf
else
  sed -i "s|;externaddr=__EXTERNAL_IP__||g" /etc/asterisk/rtp.conf
fi

touch /var/lib/asterisk/dsip/pjsip_dsip.conf
touch /var/lib/asterisk/dsip/acl_dsip.conf
touch /var/lib/asterisk/dsip/queues_dsip.conf
touch /var/lib/asterisk/dsip/extensions_dsip.conf
touch /var/lib/asterisk/dsip/musiconhold_dsip.conf

cat > /etc/asterisk/acl.conf <<'EOF'
;
; Named Access Control Lists — DSip generated rules are included below.
;

#include /var/lib/asterisk/dsip/acl_dsip.conf
EOF

cat > /etc/asterisk/logger.conf <<'EOF'
[general]
dateformat=%F %T
queue_log = no
rotatestrategy = sequential

[logfiles]
console => notice,warning,error
messages => notice,warning,error
full => notice,warning,error,verbose
security => security
EOF

cat > /etc/asterisk/musiconhold.conf <<'EOF'
[general]

#include /var/lib/asterisk/dsip/musiconhold_dsip.conf

[default]
mode=files
directory=/var/lib/asterisk/moh/default
sort=alpha
EOF

# Reload watcher (same as compose Asterisk sidecar)
(
  # reload.flag persists in /data: a stale flag from the previous boot must not
  # trigger a reload, and nothing may reload before Asterisk is fully booted —
  # `module reload res_pjsip.so` during startup deadlocks the module loader
  # (SIP over WebSocket then never answers).
  LAST="$(cat /var/lib/asterisk/dsip/reload.flag 2>/dev/null || true)"
  until asterisk -rx "core waitfullybooted" >/dev/null 2>&1; do sleep 2; done
  while true; do
    if [ -f /var/lib/asterisk/dsip/reload.flag ]; then
      CUR="$(cat /var/lib/asterisk/dsip/reload.flag 2>/dev/null || true)"
      if [ "$CUR" != "$LAST" ] && [ -n "$CUR" ]; then
        LAST="$CUR"
        sleep 1
        # Same lock as the API's CLI reload (config-writer.ts): overlapping
        # `module reload res_pjsip.so` runs deadlock Asterisk's module loader.
        exec 9>/var/lib/asterisk/dsip/reload.lock
        flock -w 60 9 || true
        overlay_en_sounds 2>/dev/null || true
        asterisk -rx "module reload acl" 2>/dev/null || true
        asterisk -rx "reload acl" 2>/dev/null || true
        # `module load` first revives any module that DECLINED at cold start (config
        # was unreadable/empty before the API wrote it); `reload` then refreshes the
        # already-running ones. A declined module is NOT reloadable, so without the
        # load pbx_config/app_queue stay down and every internal call 404s.
        asterisk -rx "module load res_pjsip.so" 2>/dev/null || true
        asterisk -rx "module reload res_pjsip.so" 2>/dev/null || true
        asterisk -rx "module load app_queue.so" 2>/dev/null || true
        asterisk -rx "module reload app_queue.so" 2>/dev/null || true
        asterisk -rx "module reload res_musiconhold.so" 2>/dev/null || true
        asterisk -rx "module load pbx_config.so" 2>/dev/null || true
        asterisk -rx "module reload pbx_config.so" 2>/dev/null || true
        echo "DSip: Asterisk reloaded"
        flock -u 9 || true
        exec 9>&-
      fi
    fi
    sleep 3
  done
) &

# Stop stale instance if volume/reuse left a pid
asterisk -rx "core stop now" >/dev/null 2>&1 || true
sleep 1

echo "Starting embedded Asterisk…"
asterisk -f -vvv >>/var/log/asterisk/console.log 2>&1 &
echo $! >/tmp/asterisk.pid

export ASTERISK_ARI_URL="${ASTERISK_ARI_URL:-http://127.0.0.1:8088}"
export ASTERISK_AMI_HOST="${ASTERISK_AMI_HOST:-127.0.0.1}"

i=0
while [ "$i" -lt 60 ]; do
  if curl -sf -u "${ARI_USER}:${ARI_PASS}" "${ASTERISK_ARI_URL}/ari/asterisk/info" >/dev/null 2>&1; then
    echo "Embedded Asterisk ARI ready at $ASTERISK_ARI_URL"
    return 0 2>/dev/null || exit 0
  fi
  i=$((i + 1))
  sleep 1
done

echo "WARN: embedded Asterisk ARI not ready after 60s — API will report disconnected"
tail -n 40 /var/log/asterisk/console.log 2>/dev/null || true
return 0 2>/dev/null || exit 0
