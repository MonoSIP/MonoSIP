# Architecture

```
                 ┌─────────────────────────────────────────┐
  Browser        │  nginx :443 / :80                       │
  Softphone ────►│  TLS, ACME challenge, /api /ws /asterisk-ws │
  Desk phone ───►│                                         │
       │         └───────────┬─────────────┬───────────────┘
       │                     │             │
       │              ┌──────▼──────┐ ┌────▼─────┐
       │              │  web        │ │  api     │
       │              │  React SPA  │ │ Fastify  │
       │              └─────────────┘ │ ARI flow │
       │                              │ config   │
       │                              └────┬─────┘
       │                     ┌─────────────┼─────────────┐
       │                     │             │             │
       │              ┌──────▼──────┐ ┌────▼─────┐ ┌─────▼────┐
       └─────────────►│  asterisk   │ │ postgres │ │  tts     │
          SIP/RTP     │  PJSIP ARI  │ │  data    │ │ Piper    │
                      └──────┬──────┘ └──────────┘ └──────────┘
                             │
                      ┌──────▼──────┐
                      │  coturn     │  TURN for remote WebRTC
                      └─────────────┘
```

## Control plane (`api`)

- Writes Asterisk config files into a shared volume and reloads via AMI/ARI
- Runs IVR graphs over ARI Stasis
- Serves admin + portal REST, WebSocket fan-out, Let’s Encrypt client (writes `cert.pem` / `key.pem`)
- Background jobs: retention, archive, reports, queue callback, trunk monitor, SSL renew check

## Media plane (`asterisk`)

- PJSIP endpoints, queues, dialplan generated from DB
- MixMonitor recordings → shared `recordings` volume (also mounted on `api`)

## Data

- **PostgreSQL** — source of truth for extensions, routes, flows, CDR, settings JSON
- Volumes survive image rebuild; bind-mount certs for host backup of TLS material

## Trust boundaries

- Admin API: session cookie + optional TOTP; optional `adminIpAllowlist`
- Portal: extension login; softphone credentials are short-lived
- Integration: API keys + webhook HMAC
- Internal Asterisk → API hooks: `INTERNAL_API_SECRET`
- SIP should not be world-open; prefer office/VPN/trunk ACLs ([SERVER-SECURITY.md](SERVER-SECURITY.md))
