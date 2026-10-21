#!/bin/sh
set -e

ARI_USER="${ASTERISK_ARI_USER:-dsip}"
ARI_PASS="${ASTERISK_ARI_PASSWORD:-ari_secret_change_me}"
AMI_USER="${ASTERISK_AMI_USER:-dsip}"
AMI_PASS="${ASTERISK_AMI_PASSWORD:-ami_secret_change_me}"

mkdir -p /var/lib/asterisk/dsip /var/lib/asterisk/dsip/sounds/dsip \
  /var/lib/asterisk/dsip/sounds/tr/digits /var/lib/asterisk/dsip/sounds/tr/qpos \
  /var/lib/asterisk/dsip/sounds/en/digits /var/lib/asterisk/dsip/sounds/en/qpos \
  /var/lib/asterisk/dsip/voicemail \
  /var/lib/asterisk/moh/default \
  /var/lib/asterisk/sounds/en \
  /var/spool/asterisk/recording /var/lib/asterisk/sounds /etc/asterisk/keys \
  /var/log/asterisk
chmod 777 /var/spool/asterisk/recording /var/log/asterisk 2>/dev/null || true
# Ensure log files exist for fail2ban before Asterisk starts
touch /var/log/asterisk/messages /var/log/asterisk/full /var/log/asterisk/security 2>/dev/null || true
# Expose DSip prompt WAVs as sound:dsip/<id>
ln -sfn /var/lib/asterisk/dsip/sounds/dsip /var/lib/asterisk/sounds/dsip
# TR queue TTS: sounds/tr must be the symlink itself (not a dir containing a symlink)
rm -rf /var/lib/asterisk/sounds/tr
ln -sfn /var/lib/asterisk/dsip/sounds/tr /var/lib/asterisk/sounds/tr
# EN: overlay generated clips into stock en/ (keep builtin beep etc.)
overlay_en_sounds() {
  for f in /var/lib/asterisk/dsip/sounds/en/*.wav; do
    [ -f "$f" ] || continue
    ln -sfn "$f" "/var/lib/asterisk/sounds/en/$(basename "$f")"
  done
  for d in digits qpos qhold; do
    mkdir -p "/var/lib/asterisk/sounds/en/$d"
    for f in /var/lib/asterisk/dsip/sounds/en/$d/*.wav; do
      [ -f "$f" ] || continue
      ln -sfn "$f" "/var/lib/asterisk/sounds/en/$d/$(basename "$f")"
    done
  done
  chmod 755 /var/lib/asterisk/sounds/en /var/lib/asterisk/sounds/en/* 2>/dev/null || true
}
overlay_en_sounds

# Minimal 8 kHz WAV helpers (MOH + beep fallback for sound:beep)
python3 - <<'PY' 2>/dev/null || true
import math, struct, wave
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
    print("moh default wait.wav written")
# Compat for older musiconhold paths
import os
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
    print("beep.wav written")
# Also at sounds root for sound:beep without language
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
# Asterisk process runs as non-root and must read TLS cert (SIP 5061)
chown asterisk:asterisk /etc/asterisk/keys /etc/asterisk/keys/asterisk.pem 2>/dev/null || true
chmod 750 /etc/asterisk/keys 2>/dev/null || true
chmod 640 /etc/asterisk/keys/asterisk.pem 2>/dev/null || true

# Inject credentials into http/ari/manager if placeholders exist
sed -i "s|__ARI_USER__|${ARI_USER}|g" /etc/asterisk/ari.conf /etc/asterisk/http.conf 2>/dev/null || true
sed -i "s|__ARI_PASS__|${ARI_PASS}|g" /etc/asterisk/ari.conf 2>/dev/null || true
sed -i "s|__AMI_USER__|${AMI_USER}|g" /etc/asterisk/manager.conf 2>/dev/null || true
sed -i "s|__AMI_PASS__|${AMI_PASS}|g" /etc/asterisk/manager.conf 2>/dev/null || true

# Public IP for RTP (VPS). Empty keeps local/Docker Desktop behaviour.
EXTERNAL_IP="${EXTERNAL_IP:-}"
if [ -n "$EXTERNAL_IP" ]; then
  sed -i "s|;externaddr=__EXTERNAL_IP__|externaddr=${EXTERNAL_IP}|g" /etc/asterisk/rtp.conf
else
  sed -i "s|;externaddr=__EXTERNAL_IP__||g" /etc/asterisk/rtp.conf
fi

# Ensure generated includes exist
touch /var/lib/asterisk/dsip/pjsip_dsip.conf
touch /var/lib/asterisk/dsip/acl_dsip.conf
touch /var/lib/asterisk/dsip/queues_dsip.conf
touch /var/lib/asterisk/dsip/extensions_dsip.conf
touch /var/lib/asterisk/dsip/musiconhold_dsip.conf

# Named ACLs live in acl.conf (not pjsip type=acl)
cat > /etc/asterisk/acl.conf <<'EOF'
;
; Named Access Control Lists — DSip generated rules are included below.
;

#include /var/lib/asterisk/dsip/acl_dsip.conf
EOF

# Logging for fail2ban (messages.log on shared asterisk_logs volume)
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

# Asterisk base image ships a sample musiconhold.conf — always overwrite with DSip include
cat > /etc/asterisk/musiconhold.conf <<'EOF'
[general]

#include /var/lib/asterisk/dsip/musiconhold_dsip.conf

[default]
mode=files
directory=/var/lib/asterisk/moh/default
sort=alpha
EOF

# Background watcher: reload when API writes reload.flag
(
  LAST=""
  while true; do
    if [ -f /var/lib/asterisk/dsip/reload.flag ]; then
      CUR="$(cat /var/lib/asterisk/dsip/reload.flag 2>/dev/null || true)"
      if [ "$CUR" != "$LAST" ] && [ -n "$CUR" ]; then
        LAST="$CUR"
        sleep 1
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
      fi
    fi
    sleep 3
  done
) &

exec asterisk -f -vvv
