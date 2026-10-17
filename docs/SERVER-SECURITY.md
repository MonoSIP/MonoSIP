# Server, network, security, and KVKK

## Server

All components run on a single on-prem or hosted VM. Sizing assumes at most ~8–10 concurrent calls.

| Resource | Value |
| --- | --- |
| CPU | 2–4 vCPU, dedicated (no overcommit) |
| RAM | 4–8 GB |
| System disk | 40 GB |
| Recording disk | Separate disk, 200–500 GB |
| OS | Debian 13 |
| On the same host | Asterisk, API, PostgreSQL, Nginx (panel + TLS), coturn |

## Network

- **Recording footprint:** WAV ≈ 1 MB/min; 1,000 minutes/day ≈ 20–25 GB/month. Opus cuts that ~5–8×
- **Network:** Stable private IP. Disable SIP ALG on modem/firewall
- **Exposed:** 443 for panel/portal (HTTPS + WSS). TURN 3478 + relay range. SIP/RTP toward the carrier only on the provider’s IPs
- **Not exposed:** 5060/5061 SIP, AMI, ARI, PostgreSQL. Off-site desk phones use VPN
- **Audio quality:** No CPU overcommit on the hypervisor; QoS (DSCP 46) when possible
- **Backup:** Nightly DB + settings to NAS or SFTP; VM snapshot separately
- **Outage:** If the host or uplink fails, carrier-side failover of inbound to mobile is configured in the SIP provider panel

## Security

The largest financial risk is toll fraud from a compromised extension. Call restrictions and spend limits ship in phase 1.

### PBX

- SIP secrets are 32-character random; users never see them
- Fail2ban: block IPs after bad SIP register / admin login (`docker compose --profile fail2ban`; prefer host firewall in production)
- Panel → Settings → Security: `sipIpAllowlist` / `sipIpDenylist` → PJSIP ACL; nftables/ufw export for the host
- Host firewall template: `scripts/harden-firewall.sh` (SIP/RTP allowlist only)
- Outbound country allowlist; default Turkey-only
- Dial-rate limit: extension that dials abnormally is stopped; admin gets email
- Spend stop: global and per-extension daily/monthly limits
- SIP TLS; desk media offers SDES SRTP (`media_encryption=sdes` + optimistic fallback); WebRTC uses DTLS-SRTP

### Panel and portal

- HTTPS only; Let’s Encrypt automatic certificates
- Admin login requires 2FA; `adminIpAllowlist` applies to the whole admin API (empty = open in lab)
- Portal: optional `portalIpAllowlist`; login flood → temporary ban (`ip_bans` + memory)
- Trunk and API-node secrets encrypted at rest
- Every admin change is written to the audit log

## KVKK (privacy)

- Disclosure announcement on recorded inbound and outbound calls
- Retention is configurable; expired recordings are deleted automatically and logged
- Access by role: admin hears all; extension hears only own; extension cannot download
- Every listen, download, and live spy is logged
- Recordings and CDR stay in-company; not sent to third-party services
- Inform employees that calls may be recorded
