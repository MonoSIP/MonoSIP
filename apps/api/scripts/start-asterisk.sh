#!/bin/sh
# Start embedded Asterisk for NineDeploy / all-in-one image (background).
# Sourced or executed from docker-entrypoint after bootstrap-runtime.
set -e
# Asterisk drops to runuser=asterisk: everything created here must be readable.
umask 022

ARI_USER="${ASTERISK_ARI_USER:-munasip}"
ARI_PASS="${ASTERISK_ARI_PASSWORD:-ari_secret_change_me}"
AMI_USER="${ASTERISK_AMI_USER:-munasip}"
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

DATA_DIR="${MUNASIP_DATA_DIR:-/data}"
AST_CFG="${ASTERISK_CONFIG_DIR:-$DATA_DIR/asterisk}"

mkdir -p "$AST_CFG" /var/lib/asterisk /var/spool/asterisk /etc/asterisk/keys \
  /var/lib/asterisk/munasip/sounds/munasip \
  /var/lib/asterisk/munasip/sounds/tr/digits /var/lib/asterisk/munasip/sounds/tr/qpos \
  /var/lib/asterisk/munasip/sounds/en/digits /var/lib/asterisk/munasip/sounds/en/qpos \
  /var/lib/asterisk/munasip/voicemail \
  /var/lib/asterisk/moh/default \
  /var/lib/asterisk/sounds/en \
  /var/log/asterisk

# Persist generated dialplan/PJSIP on the NineDeploy volume.
if [ -e /var/lib/asterisk/munasip ] && [ ! -L /var/lib/asterisk/munasip ]; then
  # Move any seed files into the data dir once, then replace with symlink.
  cp -a /var/lib/asterisk/munasip/. "$AST_CFG/" 2>/dev/null || true
  rm -rf /var/lib/asterisk/munasip
fi
ln -sfn "$AST_CFG" /var/lib/asterisk/munasip

# Asterisk drops to runuser=asterisk — /data must be traversable and confs readable.
# World-readable is enough; never chown -R (hangs NineDeploy volumes).
chmod 755 "$DATA_DIR" "$AST_CFG" 2>/dev/null || true
chmod 644 "$AST_CFG"/pjsip_munasip.conf "$AST_CFG"/acl_munasip.conf \
  "$AST_CFG"/queues_munasip.conf "$AST_CFG"/extensions_munasip.conf \
  "$AST_CFG"/musiconhold_munasip.conf "$AST_CFG"/reload.flag 2>/dev/null || true
# Prompt WAVs are written by the API as root (older images: umask 077). Asterisk must read them.
# Every level counts: a single 700 subfolder (qpos/, qhold/, a MOH class) silently
# mutes queue announcements or hold music.
chmod 755 "$AST_CFG"/voicemail 2>/dev/null || true
find "$AST_CFG"/sounds "$AST_CFG"/moh -type d ! -perm -005 -exec chmod 755 {} + 2>/dev/null || true
find "$AST_CFG"/sounds "$AST_CFG"/moh -type f ! -perm -004 -exec chmod 644 {} + 2>/dev/null || true

# MixMonitor path in dialplan ↔ API RECORDINGS_DIR
mkdir -p "${RECORDINGS_DIR:-$DATA_DIR/recordings}"
if [ -e /var/spool/asterisk/recording ] && [ ! -L /var/spool/asterisk/recording ]; then
  rm -rf /var/spool/asterisk/recording
fi
ln -sfn "${RECORDINGS_DIR:-$DATA_DIR/recordings}" /var/spool/asterisk/recording

chmod 777 "${RECORDINGS_DIR:-$DATA_DIR/recordings}" /var/log/asterisk 2>/dev/null || true
touch /var/log/asterisk/messages /var/log/asterisk/full /var/log/asterisk/security 2>/dev/null || true

ln -sfn /var/lib/asterisk/munasip/sounds/munasip /var/lib/asterisk/sounds/munasip
rm -rf /var/lib/asterisk/sounds/tr
ln -sfn /var/lib/asterisk/munasip/sounds/tr /var/lib/asterisk/sounds/tr

overlay_en_sounds() {
  for f in /var/lib/asterisk/munasip/sounds/en/*.wav; do
    [ -f "$f" ] || continue
    ln -sfn "$f" "/var/lib/asterisk/sounds/en/$(basename "$f")"
  done
  # Per-queue voice packs (sounds/tr_ema, en_male …) — Asterisk language variants
  for d in /var/lib/asterisk/munasip/sounds/*_*; do
    [ -d "$d" ] || continue
    ln -sfn "$d" "/var/lib/asterisk/sounds/$(basename "$d")"
  done
  for d in digits qpos qhold; do
    mkdir -p "/var/lib/asterisk/sounds/en/$d"
    for f in /var/lib/asterisk/munasip/sounds/en/$d/*.wav; do
      [ -f "$f" ] || continue
      ln -sfn "$f" "/var/lib/asterisk/sounds/en/$d/$(basename "$f")"
    done
  done
  # Older images created these root-only (umask 077); Asterisk must traverse them.
  chmod 755 /var/lib/asterisk/sounds /var/lib/asterisk/sounds/en /var/lib/asterisk/sounds/en/* 2>/dev/null || true
  chmod 644 /var/lib/asterisk/sounds/beep.wav /var/lib/asterisk/sounds/en/beep.wav 2>/dev/null || true
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

moh = Path("/var/lib/asterisk/munasip/moh/default/wait.wav")
if not moh.is_file():
    write_tone(moh, 4.0, 440, duty=0.2)
Path("/var/lib/asterisk/moh").mkdir(parents=True, exist_ok=True)
legacy = Path("/var/lib/asterisk/moh/default")
if not legacy.exists():
    try:
        os.symlink("/var/lib/asterisk/munasip/moh/default", str(legacy))
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

touch /var/lib/asterisk/munasip/pjsip_munasip.conf
touch /var/lib/asterisk/munasip/acl_munasip.conf
touch /var/lib/asterisk/munasip/queues_munasip.conf
touch /var/lib/asterisk/munasip/extensions_munasip.conf
touch /var/lib/asterisk/munasip/musiconhold_munasip.conf

cat > /etc/asterisk/acl.conf <<'EOF'
;
; Named Access Control Lists — MunaSIP generated rules are included below.
;

#include /var/lib/asterisk/munasip/acl_munasip.conf
EOF

cat > /etc/asterisk/logger.conf <<'EOF'
[general]
dateformat=%F %T
queue_log = no
rotatestrategy = sequential

[logfiles]
; No notices on the console: failed SIP requests from scanners are notices and
; flooded console.log (900 MB/h). They still reach messages (capped) and the
; security channel, which the API's SIP guard turns into bans.
console => warning,error
messages => notice,warning,error
full => notice,warning,error,verbose
security => security
EOF

cat > /etc/asterisk/musiconhold.conf <<'EOF'
[general]

#include /var/lib/asterisk/munasip/musiconhold_munasip.conf

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
  LAST="$(cat /var/lib/asterisk/munasip/reload.flag 2>/dev/null || true)"
  until asterisk -rx "core waitfullybooted" >/dev/null 2>&1; do sleep 2; done
  while true; do
    if [ -f /var/lib/asterisk/munasip/reload.flag ]; then
      CUR="$(cat /var/lib/asterisk/munasip/reload.flag 2>/dev/null || true)"
      if [ "$CUR" != "$LAST" ] && [ -n "$CUR" ]; then
        LAST="$CUR"
        sleep 1
        # Same lock as the API's CLI reload (config-writer.ts): overlapping
        # `module reload res_pjsip.so` runs deadlock Asterisk's module loader.
        exec 9>/var/lib/asterisk/munasip/reload.lock
        flock -w 60 9 || true
        overlay_en_sounds 2>/dev/null || true
        # Fallback path only (the API reloads over the CLI itself). Never
        # `module reload acl` right before `module reload res_pjsip.so`: the ACL
        # reload makes res_pjsip reload asynchronously and the overlap never
        # finishes. A reload refused while another runs is retried, not dropped.
        rl() { i=0; while [ $i -lt 30 ]; do out=$(asterisk -rx "$1" 2>&1); case "$out" in *"didn't finish yet"*|*"already in progress"*) i=$((i+1)); sleep 1;; *) return 0;; esac; done; }
        # `module load` revives a module that DECLINED at cold start (config was
        # unreadable/empty before the API wrote it); on a running module it is a no-op.
        rl "module load res_pjsip.so"
        rl "module reload res_pjsip.so"
        rl "module load app_queue.so"
        rl "module reload app_queue.so"
        rl "module reload res_musiconhold.so"
        rl "module load pbx_config.so"
        rl "module reload pbx_config.so"
        echo "MunaSIP: Asterisk reloaded"
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

# Keep Asterisk logs bounded: a SIP scanner alone writes hundreds of MB a day.
# Over 50 MB a file keeps its newest 5 MB (in place — Asterisk appends on).
(
  while true; do
    for f in /var/log/asterisk/console.log /var/log/asterisk/messages /var/log/asterisk/full /var/log/asterisk/security; do
      [ -f "$f" ] || continue
      if [ "$(stat -c %s "$f" 2>/dev/null || echo 0)" -gt 52428800 ]; then
        tail -c 5242880 "$f" > "$f.trim" && cat "$f.trim" > "$f"
        rm -f "$f.trim"
      fi
    done
    sleep 600
  done
) &

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
