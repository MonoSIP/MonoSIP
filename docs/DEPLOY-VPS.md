# Deploy DSip on a VPS (Docker)

**Use Docker on Linux.** Do not install Asterisk / Node / Postgres by hand unless you have a strong reason. The Mac Docker Desktop NAT issue does not apply to a normal Linux VM with published UDP ports.

Recommended: Debian 12/13 or Ubuntu 22.04+, 2–4 vCPU, 4–8 GB RAM, public IPv4.

## 1. Server prep

```bash
sudo apt update && sudo apt install -y docker.io docker-compose-v2 git curl
sudo usermod -aG docker "$USER"   # re-login after this
```

Clone the repo, then:

```bash
cp .env.example .env
```

Edit `.env` (example for host `pbx.example.com` / IP `203.0.113.10`):

```env
EXTERNAL_IP=203.0.113.10
PUBLIC_HOST=pbx.example.com
PUBLIC_URL=https://pbx.example.com
SIP_DOMAIN=pbx.example.com
SIP_WSS_URL=wss://pbx.example.com/asterisk-ws
TURN_REALM=pbx.example.com

POSTGRES_PASSWORD=…          # strong
SESSION_SECRET=…             # ≥32 random chars
ENCRYPTION_KEY=…             # 64 hex chars
ADMIN_PASSWORD=…
ASTERISK_ARI_PASSWORD=…
ASTERISK_AMI_PASSWORD=…

# Optional
# RECORDING_ARCHIVE_PATH=/data/archive
# TZ=Europe/Istanbul
```

## 2. TLS certificate

For production, put a real cert in `docker/nginx/certs/`:

```bash
# Let's Encrypt (example with certbot standalone — stop nginx first if ports busy)
# then copy fullchain.pem → cert.pem, privkey.pem → key.pem
./scripts/gen-certs.sh   # only for lab / self-signed
```

## 3. Firewall

Open only what you need:

| Port | Proto | Who |
| --- | --- | --- |
| 443 | TCP | Everyone (panel + WSS softphone) |
| 80 | TCP | ACME / redirect (optional) |
| 5060 | UDP/TCP | Desk phones / softphones **or** SIP trunk provider only |
| 10000–10100 | UDP | RTP (same peers as SIP) |
| 3478 | UDP/TCP | TURN (off-site WebRTC) |
| 49152–49200 | UDP | TURN relay |

Prefer locking **5060 + RTP** to office / VPN / trunk IPs. Opening SIP to the whole internet invites toll-fraud scans.

```bash
# example ufw
sudo ufw allow 443/tcp
sudo ufw allow 80/tcp
sudo ufw allow from OFFICE_OR_VPN_CIDR to any port 5060 proto udp
sudo ufw allow from OFFICE_OR_VPN_CIDR to any port 10000:10100 proto udp
sudo ufw allow 3478
sudo ufw enable
```

Disable **SIP ALG** on the office router if desk phones sit behind NAT.

## 4. Start

```bash
docker compose up --build -d
docker compose ps
curl -sk https://"$PUBLIC_HOST"/api/v1/health || true
```

After first boot, open **Admin → Extensions** (or wait for API seed) so PJSIP config is written with `EXTERNAL_IP`. Restart API once if endpoints were generated before `.env` had `EXTERNAL_IP`:

```bash
docker compose restart api asterisk
```

## 5. Connect phones

### Portal WebRTC softphone

1. Browse `https://pbx.example.com`
2. Login `101` / `portal101` (change passwords in production)
3. Allow microphone → should show **Registered**

### Classic SIP softphone / desk phone (UDP)

| Setting | Value |
| --- | --- |
| SIP server / registrar | `EXTERNAL_IP` or `SIP_DOMAIN` |
| Port | `5060` UDP |
| User / Auth ID | extension number (`101`) |
| Password | SIP secret from **Portal → Credentials** (or admin-set) |
| Transport | UDP |
| Codecs | Opus / G.711 μ-law / A-law |

Verify on the server:

```bash
docker compose exec asterisk asterisk -rx 'pjsip show contacts'
docker compose exec asterisk asterisk -rx 'pjsip show endpoints'
```

Expect `Contact: 101/sip:101@…` and endpoint **Not in use** / **In use** after register.

### Call test

Register two extensions (e.g. 101 and 102), dial `102` from 101. Asterisk log should show `Dial(PJSIP/102…)` and bridge.

## 6. Why not bare-metal install?

| | Docker (this project) | Manual install |
| --- | --- | --- |
| Asterisk + API + DB + nginx + TURN | One `compose up` | Many packages, paths, systemd units |
| Config sync | API writes `/var/lib/asterisk/dsip` | You wire it yourself |
| Upgrades | Rebuild images | Mix of apt + Node versions |
| NAT | Set `EXTERNAL_IP` | Same Asterisk knobs, more footguns |

Use bare metal only if your hoster forbids Docker or you need kernel-level RTP tuning beyond what host networking provides. Even then, prefer `network_mode: host` for Asterisk rather than rewriting the whole stack.

## 7. Ops extras

- **Recording retention:** Admin → Settings → months; API retention job deletes expired files.
- **Recording archive:** set Settings `recordingArchivePath` or env `RECORDING_ARCHIVE_PATH`.
- **Daily report email:** Settings SMTP fields (`smtpHost`, `smtpTo`, …); without SMTP the API logs the summary only.
- **Fail2ban (lab):** `docker compose --profile fail2ban up -d` — mounts `asterisk_logs` + `api_logs` (not config vol). Prefer host firewall for SIP in production.
- **Host firewall:** Admin → Settings → Security → download nftables/ufw, or `SIP_ALLOW=… sudo ./scripts/harden-firewall.sh`.
- **IP policy:** Settings `adminIpAllowlist` / `portalIpAllowlist` / `sipIpAllowlist` / `sipIpDenylist`; bans under Security section.
- **Login flood guard:** API memory + `ip_bans` table after repeated failures (complements fail2ban).
- **TTS (Piper):** service `tts` in compose — see [TTS.md](TTS.md). First build downloads EN/TR voice models.

## 8. Troubleshooting

- **Registers but no audio:** `EXTERNAL_IP` wrong / RTP ports blocked / SIP ALG on.
- **401 forever:** wrong SIP password; AOR name must equal extension number (API generates this).
- **WSS fails:** nginx cert / `SIP_WSS_URL` host mismatch / port 443 closed.
- **WebRTC one-way audio off-site:** TURN `EXTERNAL_IP` and relay UDP range must be open.
