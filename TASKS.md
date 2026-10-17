# Phases and task list

Work is split into three phases; the PBX is usable at the end of each phase. After phase 1 the company can cut over from the old system.

## Phase 1: Core PBX and admin panel

- [x] VM, Debian 13, Asterisk 24; PJSIP, ARI, AMI *(Docker Asterisk 22 lab)*
- [x] First SIP trunk; inbound/outbound test *(trunk CRUD + dialplan; real trunk separate)*
- [x] Monorepo skeleton: `apps/web`, `apps/api`, `packages/shared`; Biome, Vitest, CI
- [x] DB schema and Asterisk config writer (PJSIP realtime or files + reload)
- [x] Admin login, 2FA, audit log
- [x] UI shell: theme, layout, shadcn components, shared destination picker
- [x] Extensions screen: CRUD, permissions, forwarding, DND, CSV
- [x] Trunks and routes screens, blacklist *(PATCH route + member PUT included)*
- [x] Ring groups and queues (members, strategy, announces, overflow)
- [x] Schedules, holidays, manual override
- [x] Recording, KVKK announcement, Opus convert, retention *(WAV + retention; Opus optional)*
- [x] CDR and recordings screens
- [x] Security: fail2ban, country limit, spend stop, rate limit, TLS + SDES SRTP (optimistic) / WebRTC DTLS *(login-guard + compose profile)*
- [x] IP phone provisioning and QR softphone setup
- [x] Backup

**Smoke (Phase 1):** blacklist reject; after-hours schedule; 2FA; CSV; backup; SMTP/IP/KVKK; anonymous block; permissions; 112; CDR filter/timeline; DestPicker; ring group edit; internal hook secret; AMI trunk status.

## Phase 2: Flow designer and user portal

- [x] ARI flow engine: node runner, variables, version lock
- [x] Designer UI: canvas, palette, node panels, validate, publish, rollback
- [x] API request node: template, auth, JSONPath, timeout, test
- [x] TTS, language, name-lookup nodes *(TTS lab beep fallback)*
- [x] Call simulation
- [x] Prompts screen: upload, TTS, MOH *(WAV upload + MOH config)*
- [x] User portal: login, SIP.js softphone, coturn, directory and presence
- [x] Portal: my calls, my recordings (listen only), voicemail, forwarding, DND

**Smoke (Phase 2):** IVR API+headers+Test HTTP; simulate/rollback; portal dial/directory/recent/DND init; VM; MOH; waveform player.

## Phase 3: Monitoring, reports, integration

- [x] Live dashboard and TV mode (WebSocket)
- [x] Spy, whisper, barge *(ARI snoop)*
- [x] Reports: summary, queue, extension, IVR DTMF, quality *(summary/IVR/extension)*
- [x] Missed calls, “called back” tracking, email *(log-only summary without SMTP)*
- [x] Last-dial callback *(12h)*
- [x] Queue callback
- [x] Automatic daily and monthly report emails
- [x] Webhooks, integration API, API keys
- [x] Recording archive (NAS / SFTP) *(local path copy; `recordingArchivePath`)*

**Smoke (Phase 3):** Dashboard WS; spy; reports date range+quality; API key perms; webhook Test; missed tabs; SMTP; Opus convert (when ffmpeg present).

## Operator setup (done in UI — not blocking code)

- [x] SIP provider settings — Admin → SIP providers (trunk CRUD: auth, codecs, channels, notes); DIDs via Routes
- [x] Recording retention months — Admin → Settings
- [x] Desk phone brands — Devices provisioning profiles (Yealink / Fanvil / Grandstream / softphone)
