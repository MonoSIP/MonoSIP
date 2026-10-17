# Feature scope

This list combines the agreed product scope with ideas from Netsipp, Verimor, Karel, Yeastar, and Aircall reviews. Which features land in which phase is tracked in [TASKS.md](../TASKS.md).

## Extensions

- Create, edit, delete extensions (admin only); bulk CSV import/export
- Call permissions: local landline, mobile, 444, international; per-extension recording and call block
- Per-extension outbound CLI (caller ID)
- Forwarding: no-answer (with ring time), busy, unavailable — each with its own destination. Chains max 5 hops; never loops back to the same extension
- Mobile forward, per-extension permission
- Server-side DND: phone button, `*78` on / `*79` off, panel and portal toggles. Calls to DND go to the busy destination; skipped in queues
- Voicemail with email delivery
- Call pickup; extensions ringing together
- Attended and blind transfer, hold
- BLF busy lamps; distinctive ring for internal vs external
- Emergency `112` always allowed (ignores permission / spend limits)
- IP phone auto-provisioning (Yealink, Fanvil, Grandstream; by MAC) and QR softphone setup

## Groups and queues

- Ring groups: ringall or linear
- Queues: strategies (ringall, leastrecent, fewestcalls, rrmemory, linear, random)
- Members added/removed from the panel only; admin can pause a member
- Agent ring time, wrap-up, penalty
- Caller side: MOH, position and estimated wait announce
- Overflow: max wait, queue full, no agents
- Callback: “Press 1 to keep your place and be called back”
- Priority queue: a flow variable (e.g. `vip=true`) moves the caller ahead

## Schedules

- Weekly plan: multiple ranges per day; lunch as a separate status
- Holidays: fixed holidays auto, religious holidays yearly list, half-day eves; company-specific days
- Priority: custom day > holiday > weekly plan
- Manual override: Auto / Open now / Closed now, optional end time
- Separate destination or menu per status (open, lunch, after hours, holiday)
- Timezone: Europe/Istanbul

## Trunks and routes

- Multiple SIP providers (Admin → SIP providers): registered (user/password) or IP-based; transport, From domain, outbound proxy, codecs, channel limit, notes / DID memo
- Trunk status (registration, latency) in the panel; email if trunk drops
- Outbound routes: prefix rules, provider priority and failover
- Inbound routes: DID → destination; caller pattern; blacklist; anonymous block; default route
- Shared destination model: extension, ring group, queue, menu, schedule, voicemail, external number, play-and-hangup. Same destination picker everywhere
- Last-dial callback (12h): if a number the extension missed calls back, route straight to that extension
- Spend stop: daily and monthly minute limits
- Country allowlist for outbound; stop an extension on abnormal dial rate

## Recording and logs

- Per-extension or per-queue recording; KVKK announcement on inbound/outbound when recording
- Optional Opus convert; retention job deletes expired files; NAS or SFTP archive
- Waveform player in the panel; admin can download
- CDR: filters, CSV export, link to recording, DND inbound flagged
- Missed calls: list, email notify, auto “called back” when returned

## Monitoring and reports

- Live dashboard: active calls, queue waiters, extension state; full-screen TV mode
- Admin spy / whisper / barge (every use audited)
- Reports: answered, missed, abandoned; wait and talk times; service level; by extension and queue
- IVR DTMF report: which key, where hung up
- Call quality: jitter, packet loss, MOS per call
- Automatic email reports: daily summary and monthly (CSV attachment; log-only without SMTP)

## Integration

- Webhooks: ringing, answered, ended, missed (open CRM cards)
- REST API: originate (click-to-call), CDR and recording access; API key
- Email on critical events: trunk down, spend limit, suspicious dialing

## Out of scope

| Feature | Why |
| --- | --- |
| Card payments, door payment approval | PCI burden; not needed for a company PBX |
| Canned e-commerce plugins | Use the API node if needed |
| Predictive dialer / mass outbound SMS campaigns | Contact-center scale |
| Ticketing, call forms, tagging | Connect existing tools via webhooks |
| Agent scoring | Short survey in a flow |
| Separate TV app | Dashboard full-screen is enough |
| Digital fax, GSM SIM, multi-branch trunks | Extra hardware; trunk model stays general |
| DISA (remote PBX dial-out) | Fraud risk |
| First-party mobile/desktop apps | Portal + ready softphones are enough |
| Google Drive / Contacts | Prefer NAS / SFTP archive |
| WhatsApp, live chat, video, team chat | Not the PBX’s job |
| Hot desking, LDAP / AD | Overkill for ~20 extensions and one admin |
| Hotel module | Out of scope |
| Call park, camp-on, paging / intercom, boss–secretary | Out of scope |
| AI transcript (Whisper), AI voice-assistant node | Out of scope |
| SMS node | Out of scope |

## Technical stack

| Layer | Technology |
| --- | --- |
| Media / SIP | Asterisk 22, PJSIP, ARI, AMI, WebRTC |
| API | Node 24, Fastify, Drizzle, PostgreSQL 17 |
| UI | React, Vite, TanStack Query, SIP.js |
| Edge | nginx (TLS, WSS), coturn |
| TTS | Piper (+ edge-tts fallback in the TTS service) |

Persistence: Docker named volumes (`pgdata`, `recordings`, …) — see [INSTALL.md](INSTALL.md).

## Admin and ops (summary)

- Live dashboard + TV mode (WebSocket): calls, queues, extensions, trunks
- Spy / whisper / barge (ARI snoop), hangup
- Reports: summary, queues, extensions, IVR DTMF, quality; daily/monthly email (SMTP or log-only)
- Webhooks + API keys (originate, CDR, recordings)
- Backup / restore JSON; Asterisk config reload from panel
- **Hostname & automatic SSL** — Let’s Encrypt HTTP-01, install into nginx certs, periodic renew check
- Security: admin 2FA (TOTP + Apple Passwords link), IP allowlists, login flood ban, optional fail2ban profile, firewall export
