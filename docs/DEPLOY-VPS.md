# Deploy MonoSIP on a VPS (Docker)

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

# LOCAL_NETS comes from .env.example (Docker bridge + loopback). Leave it unless
# Asterisk is on the same L2 as desk phones without Docker NAT to EXTERNAL_IP.

# Optional
# RECORDING_ARCHIVE_PATH=/data/archive
# TZ=Europe/Istanbul
```

## 2. TLS certificate

**Preferred:** after the stack is up, open **Admin → Settings → Hostname & SSL**, set the public hostname, turn on **Automatic SSL**, and save. MonoSIP uses Let's Encrypt (HTTP-01 on port 80), writes `docker/nginx/certs/cert.pem` + `key.pem`, and renews automatically.

Lab / offline only:

```bash
./scripts/gen-certs.sh   # self-signed
```

## 3. Firewall

Open only what you need:

| Port | Proto | Who |
| --- | --- | --- |
| 443 | TCP | Everyone (panel + WSS softphone) |
| 80 | TCP | ACME / redirect (optional) |
| 5060 | UDP/TCP | Desk phones / classic softphones |
| 5070 | UDP | SIP providers. Outbound only: a registering trunk needs **no** inbound rule or port forward |
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

Desk phones that stay **Registered** in the phone UI but **Unavail** in MonoSIP usually mean Asterisk is advertising the Docker bridge address (`172.x`) in Via/Contact. That happens when `LOCAL_NETS` includes the phone LAN (e.g. `10.0.0.0/8`) while phones dial `EXTERNAL_IP` through Docker NAT. Current defaults and boot-time normalization prevent this; remove any vault override that still lists the phone LAN.

## 4b. Behind NAT, VPN or a private `EXTERNAL_IP`

`EXTERNAL_IP` is the address **your phones and browsers** use to reach the PBX. It may be private, for example the host's address on the office LAN or VPN (`10.6.6.9`). MonoSIP then uses two addresses:

| Who | Address in SIP/SDP | Why |
| --- | --- | --- |
| Desk phones, classic softphones, portal softphone | `EXTERNAL_IP` | They reach it directly. Sending them the router's WAN IP hairpins RTP through the router and calls answered from a queue or IVR have no audio |
| SIP providers, website widget guests | Public IP found via STUN (**Settings → STUN**) | They are on the internet |

- **SIP providers** register from their own UDP transport on port `5070` with a private Contact and `contact_user` set to the SIP login. The provider sends inbound calls back to the address and port it saw, so routers that rewrite the source port (5060 → 63166) no longer drop them. No port forward is needed, the same way 3CX works behind NAT.
- **WebRTC:** Docker gives Asterisk a `172.x` NIC that no browser can reach. Boot maps it to `EXTERNAL_IP` in `rtp.conf` (`[ice_host_candidates]`), so a browser that reaches `EXTERNAL_IP` (LAN/VPN) connects media directly.
- **Set `PUBLIC_HOST`.** Without it the API adopts the Host of the first request. Container, LAN, loopback and single-label hosts are ignored, but an explicit value is the only reliable one.
- Off-site browsers that cannot reach `EXTERNAL_IP` need RTP published on the WAN address or TURN (see [INSTALL.md](INSTALL.md#production-vps)).

Check the provider registration:

```bash
asterisk -rx 'pjsip show registrations'   # Registered
asterisk -rx 'pjsip show transports'      # transport-trunk on 0.0.0.0:5070
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
| Config sync | API writes `/var/lib/asterisk/monosip` | You wire it yourself |
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
- **TTS:** embedded in the main image (`127.0.0.1:5500`) — see [TTS.md](TTS.md). No sidecar.
- **Time zone and clock:** set the zone under Admin → Settings → Time and time zone (applied to the API at once; Asterisk logs follow after the next restart). The container cannot set the clock, so keep NTP on the host: `timedatectl set-ntp true` (systemd-timesyncd) or chrony. Settings shows the measured drift and flags more than 2 seconds.

## 8. Troubleshooting

- **Registers but no audio:** `EXTERNAL_IP` wrong / RTP ports blocked / SIP ALG on.
- **401 forever:** wrong SIP password; AOR name must equal extension number (API generates this).
- **Admin password forgotten:** on a single-image install the first-run password is in `docker logs` (`first-run admin login`). If it is lost, `docker compose exec api pnpm db:reset-admin` (single image: `docker exec monosip pnpm db:reset-admin`) temporarily restores the recovery password `Admin123!` — change it immediately after sign-in. Email and 2FA stay as they are. See [INSTALL.md](INSTALL.md).
- **WSS fails:** nginx cert / `SIP_WSS_URL` host mismatch / port 443 closed.
- **WebRTC one-way audio off-site:** TURN `EXTERNAL_IP` and relay UDP range must be open.
- **Provider registered, inbound calls never arrive:** `pjsip set logger on` and call the DID. No INVITE at all means the provider cannot reach the Contact: check that the registration leaves from `transport-trunk` (5070). An INVITE answered with `404` means the Request-URI user is not a DID; MonoSIP sets `contact_user` and also maps `s` to the DID in the To header.
- **Inbound caller shows the trunk's own number:** fixed in 1.8.5 (trunks no longer set endpoint `callerid=`). Redeploy so the config is rewritten.
- **Queue or IVR call to a desk phone has no audio:** `EXTERNAL_IP` must be the address the phones reach (LAN/VPN), not the router's WAN IP. See [4b](#4b-behind-nat-vpn-or-a-private-external_ip).
- **Softphone shows "This browser is not receiving the call" on calls the PBX sends it (IVR, queue):** fixed in 1.8.9. Hard-refresh the portal (Ctrl+F5) so the browser loads the new softphone code.
- **Softphone connects to `172.x` or the wrong host:** set `PUBLIC_HOST` and redeploy (1.8.7 and later never adopt a container address).
- **One IVR sentence sounds robotic:** that sentence fell back to espeak when the neural voice failed. Since 1.9.0 the fallback is not cached; on older versions delete the sentence under **Prompts** (TTS cache) so it is synthesized again.
