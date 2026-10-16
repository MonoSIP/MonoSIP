# Technical features

Open-source **company PBX** (~20 extensions): Asterisk media plane + React admin/portal + Fastify control plane. Default UI language: English (Turkish available).

## Core telephony

- **Extensions** — CRUD, CSV import/export, outbound CLI, call permissions (local / mobile / 444 / international), DND (`*78` / `*79`), forwarding chains (max depth 5), voicemail, pickup, BLF hints, distinctive ring
- **Emergency** — `112` always allowed (ignores spend limits / permission blocks)
- **Ring groups** — ringall or linear; unanswered destination
- **Queues** — strategies (ringall, leastrecent, fewestcalls, rrmemory, linear, random), penalty, wrap-up, max wait / max callers, MOH, position & hold-time announce (TTS pack), overflow, callback (“press 1 to keep your place”)
- **Schedules** — weekly ranges + lunch, holidays (TR pack), manual override, per-status destinations (Europe/Istanbul)
- **Trunks & routes** — multi-trunk, inbound DID / caller pattern, outbound patterns & permissions, blacklist, anonymous inbound block, country allowlist, spend limits, last-dial callback (12h)
- **Recording** — MixMonitor + KVKK announcement, retention job, optional Opus convert, local/NAS/SFTP archive
- **CDR** — filters, CSV export, call timeline, missed-call tracking (“called back”)

## IVR / flow designer

- Visual canvas with palette, node panels, validation, publish / rollback, version lock
- Nodes: menu (DTMF), play, dial, queue, schedule gate, API request (auth, JSONPath, timeout, test), TTS, name lookup, variables
- ARI runtime executes published graphs; simulate endpoint for dry runs

## Softphone & devices

- Portal **SIP.js** softphone over WSS (`/asterisk-ws`), coturn for off-site WebRTC
- Desk phone provisioning (Yealink / Fanvil / Grandstream style) + QR softphone setup
- Presence / directory, own CDR & recordings (listen-only), voicemail, forwarding, DND

## Admin & ops

- Live dashboard + TV mode (WebSocket): calls, queues, extensions, trunks
- Spy / whisper / barge (ARI snoop), hangup
- Reports: summary, queues, extensions, IVR DTMF, quality; daily/monthly email (SMTP or log-only)
- Webhooks + API keys (originate, CDR, recordings)
- Backup / restore JSON; Asterisk config reload from panel
- **Hostname & automatic SSL** — Let’s Encrypt HTTP-01, install into nginx certs, periodic renew check
- Security: admin 2FA (TOTP + Apple Passwords link), IP allowlists, login flood ban, optional fail2ban profile, firewall export

## Stack (technical)

| Layer | Technology |
| --- | --- |
| Media / SIP | Asterisk 22, PJSIP, ARI, AMI, WebRTC |
| API | Node 24, Fastify, Drizzle, PostgreSQL 17 |
| UI | React, Vite, TanStack Query, SIP.js |
| Edge | nginx (TLS, WSS), coturn |
| TTS | Piper (+ edge-tts fallback in TTS service) |

Persistence: Docker named volumes (`pgdata`, `recordings`, …) — see [INSTALL.md](INSTALL.md).

## Out of scope

Payment / PCI, canned e-commerce plugins, predictive dialer / İYS blast campaigns — see [01-ozellikler.md](01-ozellikler.md).
