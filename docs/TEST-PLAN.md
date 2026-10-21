# MunaSIP full product test plan

Exhaustive checklist for verifying every in-scope feature and call path. Use this before a release, after major refactors, or when validating a new environment (lab Compose or VPS).

Related docs: [FEATURES.md](FEATURES.md), [SCREENS.md](SCREENS.md), [FLOW-DESIGNER.md](FLOW-DESIGNER.md), [API.md](API.md), [USER-PORTAL.md](USER-PORTAL.md), [INSTALL.md](INSTALL.md), [SERVER-SECURITY.md](SERVER-SECURITY.md).

---

## 1. Purpose and scope

**Done** means every case below is **Pass** or explicitly **Skip** with a reason (e.g. no SIP trunk in lab). Failures block release unless waived in writing.

### In scope

- Admin panel (all routes), portal softphone, Asterisk telephony config, IVR designer + live ARI execution, recordings/CDR, dashboard/live ops, reports, integrations, settings/security/SSL, background jobs, Docker / VPS install paths.

### Out of scope (from FEATURES.md — do not test as product requirements)

Card payments, e-commerce plugins, predictive dialer / mass SMS, ticketing/CRM forms, WhatsApp/live chat/video, hot desking / LDAP, hotel module, call park / paging / DISA, digital fax / GSM, first-party mobile apps.

---

## 2. Prerequisites

| Item | Lab default |
| --- | --- |
| Stack | `docker compose up --build -d` from repo root; volumes intact |
| URL | `https://localhost` (accept self-signed cert) |
| Admin | `admin@example.com` / `Admin123!` |
| Portal | `101` / `portal101` (also `100`–`103` / `portal{n}`) |
| Softphone | Browser on HTTPS; mic permission; optional second browser / desk phone |
| Optional | Real SIP trunk credentials, SMTP, public hostname for LE SSL, SFTP archive |

**Automated suite** (does not replace MANUAL/LIVE cases):

```bash
pnpm test
# or targeted: pnpm --filter @munasip/api exec vitest run
#              pnpm --filter @munasip/web exec vitest run
```

---

## 3. How to use this plan

Copy a section into your run sheet or mark in place:

| Column | Meaning |
| --- | --- |
| **ID** | Stable case id |
| **Steps** | What to do |
| **Expected** | Pass criteria |
| **Type** | `AUTO` = covered by vitest/int; `MANUAL`; `LIVE` = needs real SIP/media/network |
| **Result** | Pass / Fail / Skip |
| **Notes** | Build, evidence, bug link |

**Legend:** `[ ]` unchecked · mark `P` / `F` / `S` when executed.

---

## 4. Smoke day (run first)

Execute in order before deep sections. Abort smoke on critical Fail.

| ID | Steps | Expected | Type | Result |
| --- | --- | --- | --- | --- |
| S0-01 | `docker compose ps`; `curl -sk https://localhost/api/v1/health` | All required services up; health JSON `ok` (db true) | MANUAL | |
| S0-02 | Admin login | Dashboard loads | MANUAL | |
| S0-03 | Portal login as 101 | Softphone page; register attempt | LIVE | |
| S0-04 | Create/open Main IVR → Validate → Publish | Publish succeeds or clear validation errors | MANUAL | |
| S0-05 | Portal 101 ↔ 102 internal call | Both hear audio; CDR row appears | LIVE | |
| S0-06 | Inbound DID (or dial flow extension e.g. 900) through published menu | DTMF routes correctly | LIVE | |
| S0-07 | Settings → Reload Asterisk | Reload OK; subsequent call uses config | MANUAL | |
| S0-08 | Integrations → webhook Test | Test returns success or logged failure | MANUAL | |
| S0-09 | `pnpm test` | All packages green | AUTO | |

---

## A. Environment and health

| ID | Steps | Expected | Type | Result |
| --- | --- | --- | --- | --- |
| A-01 | `docker compose ps` | postgres, asterisk, api, web, nginx, coturn healthy/up (TTS embedded in api) | MANUAL | |
| A-02 | `GET /api/v1/health` | `{ ok, db, … }` — document asterisk flag if false | MANUAL | |
| A-03 | Open https://localhost | SPA loads; no asset 404 | MANUAL | |
| A-04 | Browser DevTools → WS `/ws` after admin login | Connects; live events possible | MANUAL | |
| A-05 | Softphone WSS `/asterisk-ws` | Upgrade succeeds when registered | LIVE | |
| A-06 | Asterisk: `pjsip show endpoints` (compose exec) | Seed extensions present | MANUAL | |
| A-07 | TTS health via admin Prompts / TTS status | TTS service reachable (Edge/EMA) | MANUAL | |
| A-08 | Restart api only; volumes persist | Settings/extensions still present | MANUAL | |
| A-09 | Fail api with bad `DATABASE_URL` (isolated) | Health fails; clear logs | MANUAL | |
| A-10 | nginx serves TLS; HTTP→HTTPS or ACME path as configured | No mixed-content on panel | MANUAL | |

---

## B. Auth and shell

| ID | Steps | Expected | Type | Result |
| --- | --- | --- | --- | --- |
| B-01 | Admin login correct credentials | Session cookie; dashboard | AUTO+MANUAL | |
| B-02 | Admin wrong password | 401; no session | AUTO | |
| B-03 | Portal login extension+password | Portal layout | AUTO+MANUAL | |
| B-04 | Portal wrong password | Error; stay on login | AUTO | |
| B-05 | Switch Admin / Portal on login form | Correct fields for each mode | MANUAL | |
| B-06 | Enable TOTP in Settings → logout → login without code | Prompt / reject | AUTO+MANUAL | |
| B-07 | Login with valid TOTP | Success | MANUAL | |
| B-08 | Login with invalid TOTP | Reject | AUTO | |
| B-09 | Disable TOTP with code | Next login without TOTP works | MANUAL | |
| B-10 | Logout | Cookie cleared; `/login` | MANUAL | |
| B-11 | Hit admin API without cookie | 401 | AUTO | |
| B-12 | Portal user opens `/extensions` URL | Redirect / forbidden | MANUAL | |
| B-13 | Admin opens portal-only softphone as admin | Role-appropriate UI | MANUAL | |
| B-14 | Theme toggle light/dark | Persists in `localStorage`; UI updates | MANUAL | |
| B-15 | Locale EN ↔ TR | Nav labels switch; persist | MANUAL | |
| B-16 | Mobile viewport: admin hamburger | Nav accessible | MANUAL | |
| B-17 | Mobile viewport: portal bottom tabs | Phone/Directory/Calls reachable | MANUAL | |
| B-18 | Session restore refresh mid-session | Still logged in via `/auth/me` | MANUAL | |
| B-19 | Login flood beyond `securityLoginMaxRetry` | Temporary ban | AUTO+MANUAL | |

---

## C. Extensions

| ID | Steps | Expected | Type | Result |
| --- | --- | --- | --- | --- |
| C-01 | List extensions | Seed 100–103 visible with state | AUTO+MANUAL | |
| C-02 | Create extension (valid number 2–8 digits) | Appears; SIP secret set server-side | AUTO+MANUAL | |
| C-03 | Create invalid number | 400 / validation | AUTO | |
| C-04 | Edit name, email, portal enabled | Saves | AUTO | |
| C-05 | Set call permissions (landline/mobile/444/intl) | Outbound respects flags | LIVE | |
| C-06 | Recording mode never / always / external / on_demand | Matching MixMonitor behavior | LIVE | |
| C-07 | Portal listen-allowed off | Portal cannot hear others’ (or own if disabled per policy) | MANUAL | |
| C-08 | Forwarding: noanswer + DestPicker + ring seconds | Unanswered call follows dest | LIVE | |
| C-09 | Forwarding busy / unavailable | Correct branch | LIVE | |
| C-10 | Forwarding chain / loop | Max hop / no self-loop | MANUAL | |
| C-11 | Mobile forward only if permission | Blocked otherwise | MANUAL | |
| C-12 | DND toggle panel | Calls to busy dest; skipped in queues | LIVE | |
| C-13 | DND `*78` / `*79` from phone | Same as panel | LIVE | |
| C-14 | CSV export | File downloads | MANUAL | |
| C-15 | CSV import create/update | Counts; bad rows reported | AUTO+MANUAL | |
| C-16 | Reset portal password | New password works; old fails | MANUAL | |
| C-17 | Delete extension | Removed; dialplan updated after reload | MANUAL | |
| C-18 | Spend limit daily/monthly | Outbound blocked when exceeded | LIVE | |
| C-19 | Outbound CLI per extension | CID presented on trunk | LIVE | |
| C-20 | Emergency `112` | Always allowed despite permissions/spend | LIVE | |

---

## D. Ring groups and queues

### Ring groups

| ID | Steps | Expected | Type | Result |
| --- | --- | --- | --- | --- |
| D-01 | Create ring group + members | Saves | AUTO | |
| D-02 | Strategy ringall | All members ring | LIVE | |
| D-03 | Strategy linear | Sequential ring | LIVE | |
| D-04 | Ring seconds + unanswered destination | Falls through | LIVE | |
| D-05 | Delete ring group | Gone; routes updated | MANUAL | |

### Queues

| ID | Steps | Expected | Type | Result |
| --- | --- | --- | --- | --- |
| D-06 | Create queue (strategy rrmemory) | Saves | AUTO | |
| D-07 | Add members; set penalty/order | Order respected | MANUAL | |
| D-08 | Pause member from panel | Paused agent not rung | LIVE | |
| D-09 | Strategies: ringall, leastrecent, fewestcalls, linear, random | Document smoke per strategy | LIVE | |
| D-10 | MOH class on queue | Caller hears MOH | LIVE | |
| D-11 | Announce position / hold time | Announcements play | LIVE | |
| D-12 | Overflow max wait | Timeout dest | LIVE | |
| D-13 | Overflow full / joinempty | Correct overflow | LIVE | |
| D-14 | Queue callback “press 1” | Callback job dials when free | LIVE | |
| D-15 | Flow VIP / priority into queue | Higher priority ahead | LIVE | |
| D-16 | DND member skipped | Not rung | LIVE | |

---

## E. Schedules and holidays

| ID | Steps | Expected | Type | Result |
| --- | --- | --- | --- | --- |
| E-01 | Create schedule with weekly open ranges | Saves | AUTO | |
| E-02 | Lunch ranges | Status lunch when in range | MANUAL | |
| E-03 | Timezone Europe/Istanbul | Status matches local wall clock | MANUAL | |
| E-04 | Override Open / Closed / Auto + until | Status forces override | AUTO+MANUAL | |
| E-05 | Destinations per status (open/lunch/closed/holiday) | Inbound follows | LIVE | |
| E-06 | Holiday CRUD | Listed; status holiday | AUTO | |
| E-07 | TR holiday pack / import | Inserts year pack | MANUAL | |
| E-08 | Custom day priority over weekly | Custom wins | MANUAL | |
| E-09 | `GET …/schedules/:id/status` | Matches UI “now” | AUTO | |
| E-10 | Flow `time_condition` node uses schedule | Correct exit | AUTO+LIVE | |

---

## F. Trunks and routes

### Trunks

| ID | Steps | Expected | Type | Result |
| --- | --- | --- | --- | --- |
| F-01 | Create userpass trunk | Saves; PJSIP config after reload | AUTO+MANUAL | |
| F-02 | Create IP-auth trunk | Saves | AUTO | |
| F-03 | Transport udp/tcp/tls, codecs, max channels, proxy | Stored; reflected in config | MANUAL | |
| F-04 | Enable/disable trunk | Disabled skipped for outbound/monitor | MANUAL | |
| F-05 | Live status registered/latency | UI shows state | LIVE | |
| F-06 | Trunk down alert | Email if SMTP else log | LIVE | |
| F-07 | Delete trunk | Removed from dialplan after reload | MANUAL | |

### Routes / blacklist

| ID | Steps | Expected | Type | Result |
| --- | --- | --- | --- | --- |
| F-08 | Inbound DID → extension/queue/flow | Correct dest | LIVE | |
| F-09 | Inbound caller pattern + priority | Higher priority wins | LIVE | |
| F-10 | Default inbound route | Catch-all works | LIVE | |
| F-11 | `blockAnonymousInbound` | Anonymous rejected when on | LIVE | |
| F-12 | Outbound pattern strip/prepend | Digits transformed | LIVE | |
| F-13 | Outbound multi-trunk failover | Next trunk on fail | LIVE | |
| F-14 | Permission localFixed/mobile/short444/international | Deny without perm | LIVE | |
| F-15 | Blacklist inbound | Blocked caller | LIVE | |
| F-16 | Blacklist outbound | Blocked dial | LIVE | |
| F-17 | Last-dial / missed callback (12h) | Callback routes to extension | LIVE | |
| F-18 | Country allowlist | Non-allowed country blocked | LIVE | |
| F-19 | Dial-rate / maxOutboundPerHour | Excessive dialing stopped | LIVE | |

---

## G. IVR / flow designer (UI + validate)

### Designer chrome

| ID | Steps | Expected | Type | Result |
| --- | --- | --- | --- | --- |
| G-01 | Flows list create/rename | Flow appears | AUTO+MANUAL | |
| G-02 | Open designer | Canvas, palette, Test call sidebar | MANUAL | |
| G-03 | Drag node | Moves; settings do **not** open | MANUAL | |
| G-04 | Pencil icon | Settings modal opens | MANUAL | |
| G-05 | Escape / Done / backdrop | Modal closes | MANUAL | |
| G-06 | Trash + confirm | Node and edges removed | MANUAL | |
| G-07 | Add from palette | Node added; settings open once | MANUAL | |
| G-08 | Connect exits by handles | Edges labeled | MANUAL | |
| G-09 | Mobile designer | View-only (no connect/drag if enforced) | MANUAL | |
| G-10 | Save draft | Persists reload | MANUAL | |
| G-11 | Validate missing exits | Errors listed | AUTO | |
| G-12 | Publish | Version increments; live uses published | AUTO+MANUAL | |
| G-13 | Rollback | Draft restored to version | AUTO | |
| G-14 | Export JSON | File downloads | MANUAL | |
| G-15 | Import JSON | Draft replaced | MANUAL | |
| G-16 | Simulate: caller/DID/DTMF/mock API | Steps + vars shown | MANUAL | |
| G-17 | Mid-call publish | In-progress call keeps old version | LIVE | |

### Every node type

| ID | Node | Steps | Expected | Type | Result |
| --- | --- | --- | --- | --- | --- |
| G-20 | `start` | Entry only | `caller`/`did`/`time` ready; next exit | AUTO | |
| G-21 | `announce` | Text + lang + gender | Plays TTS or prompt | AUTO+LIVE | |
| G-22 | `announce` | promptId WAV | Plays file | LIVE | |
| G-23 | `tts` | Text with `$caller` / `{{caller}}` | Expanded speech | AUTO+LIVE | |
| G-24 | `menu` | Digits 1,2 + timeout/invalid | Correct exits; retries | AUTO+LIVE | |
| G-25 | `menu` | maxDigits > 1 | Multi-digit collect | AUTO+LIVE | |
| G-26 | `get_key` | name=`pin`, min/max digits | Stores `$pin`; next/timeout | AUTO+LIVE | |
| G-27 | `get_key` | Use `$pin` in later TTS/API | Value substituted | AUTO+LIVE | |
| G-28 | `api` | GET/POST/PUT/PATCH/DELETE select | Method sent | AUTO+MANUAL | |
| G-29 | `api` | Auth bearer/basic/header + secret | Secret injected; not in JSON | AUTO | |
| G-30 | `api` | JSONPath mappings | Vars set; `http_status` | AUTO | |
| G-31 | `api` | Test HTTP button | Status + mapped preview | MANUAL | |
| G-32 | `api` | Timeout / non-2xx | `error` exit | AUTO | |
| G-33 | `api` | Wait prompt / MOH | Audio while waiting | LIVE | |
| G-34 | `condition` | = ≠ > < contains empty regex | true/false | AUTO | |
| G-35 | `condition` | area_code / country_code | Uses caller/DID if empty var | AUTO | |
| G-36 | `set_var` | name/value with `$x` | Var bag updated | AUTO | |
| G-37 | `language` | Set tr then announce | Turkish voice path | LIVE | |
| G-38 | `time_condition` | Bound schedule | open/lunch/closed/holiday | AUTO+LIVE | |
| G-39 | `directory` | Dial-by-name digits | found → connect; not_found | LIVE | |
| G-40 | `transfer` | Extension + ring timeout | Dial; noanswer/busy/chanunavail | LIVE | |
| G-41 | `transfer` | Self-transfer | Refused; speech + chanunavail | AUTO+LIVE | |
| G-42 | `transfer` | Offline extension | chanunavail | LIVE | |
| G-43 | `transfer` | Non-extension dest | Leaves flow; no dial-status exits | LIVE | |
| G-44 | `queue` | queueNumber + priority | Enters queue; leaves Stasis | LIVE | |
| G-45 | `voicemail` | Mailbox extension | VM app | LIVE | |
| G-46 | `subflow` | Other published flow | Runs then `return` | AUTO+LIVE | |
| G-47 | `subflow` | Self-reference | Validate error | AUTO | |
| G-48 | `hangup` | Terminal | Call ends | AUTO+LIVE | |
| G-49 | Publish with unconnected api `error` | Blocked | AUTO | |
| G-50 | Cycle / unreachable node | Validate errors | AUTO | |

---

## H. Live IVR call (Asterisk ARI)

Simulate alone is insufficient. Mark LIVE.

| ID | Steps | Expected | Type | Result |
| --- | --- | --- | --- | --- |
| H-01 | Dial published flow extension from softphone | Enters start → announce | LIVE | |
| H-02 | Menu DTMF correct digit | Follows edge | LIVE | |
| H-03 | Menu wrong digit → retries → invalid/timeout | Path matches design | LIVE | |
| H-04 | Get key PIN then API with `$pin` | HTTP sees digits; success path | LIVE | |
| H-05 | API failure | error exit | LIVE | |
| H-06 | Schedule gate after hours | closed/holiday dest | LIVE | |
| H-07 | Transfer to registered 102 | Rings; answer bridges | LIVE | |
| H-08 | Queue from flow | Waiter visible on dashboard | LIVE | |
| H-09 | Directory found | Connects to extension | LIVE | |
| H-10 | Hangup node | Channel hangs up | LIVE | |
| H-11 | Subflow nested | Returns to parent | LIVE | |
| H-12 | callEvents / CDR timeline | Flow node / DTMF events present | MANUAL | |

---

## I. Prompts, MOH, TTS

| ID | Steps | Expected | Type | Result |
| --- | --- | --- | --- | --- |
| I-01 | Create prompt + TTS synthesize | WAV stored; playable | AUTO+MANUAL | |
| I-02 | Upload WAV | Stored; stream works | AUTO | |
| I-03 | Replace audio | New content plays | MANUAL | |
| I-04 | TTS status en/tr voices | Listed | MANUAL | |
| I-05 | MOH class create | Appears | AUTO | |
| I-06 | MOH upload (convert to 8 kHz if needed) | File listed; stream | AUTO+MANUAL | |
| I-07 | MOH delete file | Removed | MANUAL | |
| I-08 | Queue/IVR wait uses MOH/prompt | Audible | LIVE | |

---

## J. Devices and provisioning

| ID | Steps | Expected | Type | Result |
| --- | --- | --- | --- | --- |
| J-01 | Create device model + MAC | Saved | AUTO | |
| J-02 | `GET /cfg/:mac` | Provisioning XML/config | MANUAL | |
| J-03 | QR softphone | QR encodes setup URL/creds form | MANUAL | |
| J-04 | Desk phone fetches cfg | Registers | LIVE | |
| J-05 | Delete device | Removed | MANUAL | |

---

## K. Recording, CDR, missed calls

| ID | Steps | Expected | Type | Result |
| --- | --- | --- | --- | --- |
| K-01 | Call with recording always | MixMonitor file created | LIVE | |
| K-02 | KVKK announcement enabled | Announce before record | LIVE | |
| K-03 | Admin recordings list + filters | Rows match calls | MANUAL | |
| K-04 | Waveform / stream play | Audio plays | MANUAL | |
| K-05 | Download recording | File downloads; access log entry | MANUAL | |
| K-06 | Portal my recordings listen-only | Play OK; no download control | MANUAL | |
| K-07 | Portal cannot access others’ recording | 404/403 | AUTO | |
| K-08 | CDR filters | Results narrow | MANUAL | |
| K-09 | CDR export CSV/Excel | File valid | AUTO+MANUAL | |
| K-10 | CDR timeline | Flow steps visible | MANUAL | |
| K-11 | DND inbound flagged on CDR | Flag set | LIVE | |
| K-12 | Quality fields jitter/loss/MOS | Present when available | MANUAL | |
| K-13 | Missed call list | Entry on missed inbound | LIVE | |
| K-14 | Missed → called back | Status updates | LIVE | |
| K-15 | Missed email notify | SMTP or log-only | LIVE | |
| K-16 | Opus convert job | ogg when ffmpeg present | AUTO | |
| K-17 | Retention job | Expired deleted (respect archive) | AUTO | |
| K-18 | Archive local/SFTP | Marked archived | AUTO+MANUAL | |

---

## L. Dashboard and live ops

| ID | Steps | Expected | Type | Result |
| --- | --- | --- | --- | --- |
| L-01 | Active calls update over WS | Near-real-time | LIVE | |
| L-02 | Queue waiters / members | Match Asterisk | LIVE | |
| L-03 | Extension presence | Idle/on-call/DND | LIVE | |
| L-04 | Trunk status widgets | Match monitor | LIVE | |
| L-05 | Today summary cards | Answered/missed/avg talk | MANUAL | |
| L-06 | TV / fullscreen mode | Layout expands | MANUAL | |
| L-07 | Spy with listener extension | Listener hears; audited | LIVE | |
| L-08 | Whisper | Agent hears whisper | LIVE | |
| L-09 | Barge | Three-way | LIVE | |
| L-10 | Spy when listener offline | Clear error | MANUAL | |
| L-11 | Hangup active call from dashboard | Channel ends | LIVE | |
| L-12 | Clear stuck spy | Snoops cleaned | MANUAL | |

---

## M. Reports

| ID | Steps | Expected | Type | Result |
| --- | --- | --- | --- | --- |
| M-01 | Summary date range | Answered/missed/abandoned/SLA/avg | AUTO+MANUAL | |
| M-02 | Extensions report | Per-ext stats | AUTO | |
| M-03 | Queues report | Wait/talk/SLA | AUTO | |
| M-04 | IVR DTMF report | Keys / hangup points | AUTO | |
| M-05 | Quality report | MOS/jitter/loss | AUTO | |
| M-06 | Empty range | Empty tables, no crash | MANUAL | |
| M-07 | Daily/monthly email job | CSV attached or log-only | AUTO | |

---

## N. Integrations

| ID | Steps | Expected | Type | Result |
| --- | --- | --- | --- | --- |
| N-01 | Create webhook + events | Secret shown once | AUTO | |
| N-02 | Webhook Test | Delivery attempt; status shown | MANUAL | |
| N-03 | Fire call.ringing/answered/ended/missed | External URL receives HMAC body | LIVE | |
| N-04 | Webhook failure retries | Up to 3 attempts | AUTO | |
| N-05 | Deactivate webhook | No further delivery | MANUAL | |
| N-06 | Create API key permissions | Raw key once; prefix listed | AUTO | |
| N-07 | `POST /ext/calls/originate` | Extension rings | LIVE | |
| N-08 | `GET /ext/cdr` | Returns CDR | AUTO+MANUAL | |
| N-09 | Recording stream with key | Authorized stream | MANUAL | |
| N-10 | Wrong key / missing permission | 401/403 | AUTO | |
| N-11 | Patch key permissions / delete | Enforced | AUTO | |
| N-12 | Admin secrets for API node | Create/list/delete; value never listed | AUTO | |

---

## O. Settings and security

| ID | Steps | Expected | Type | Result |
| --- | --- | --- | --- | --- |
| O-01 | Load settings | Defaults sensible (company MunaSIP, locale en, …) | AUTO | |
| O-02 | Patch companyName / locale / retention | Persists | AUTO | |
| O-03 | KVKK on/off + prompt | Affects recording path | LIVE | |
| O-04 | Country allowlist / spend / maxOutboundPerHour / blockAnonymous | Enforced on calls | LIVE | |
| O-05 | SMTP fields | Saved; used by jobs or log-only | MANUAL | |
| O-06 | Archive path + test SFTP | Success/fail message | MANUAL | |
| O-07 | Manual archive run | Files copied | MANUAL | |
| O-08 | adminIpAllowlist empty vs set | Empty=open lab; set blocks foreign IP | MANUAL | |
| O-09 | portalIpAllowlist | Portal login restricted | MANUAL | |
| O-10 | sipIpAllowlist / denylist + apply ACL | Asterisk ACL updated | MANUAL | |
| O-11 | Login ban list add/delete | Bans enforced | AUTO | |
| O-12 | Firewall export | Downloadable rules | MANUAL | |
| O-13 | Security status / fail2ban hint | Informative | MANUAL | |
| O-14 | Hostname + autoSsl | LE flow or clear error | LIVE | |
| O-15 | SSL status renew button | Renew attempt logged | MANUAL | |
| O-16 | Backup download JSON | No SIP secrets in plaintext | AUTO | |
| O-17 | Restore backup | Data restored; reload dialplan | MANUAL | |
| O-18 | Audit log | Sensitive actions listed | MANUAL | |
| O-19 | System reload | Asterisk config rewritten/reloaded | MANUAL | |
| O-20 | Invalid settings payload | 400 | AUTO | |

---

## P. Portal and softphone

| ID | Steps | Expected | Type | Result |
| --- | --- | --- | --- | --- |
| P-01 | Register over WSS | Status registered | LIVE | |
| P-02 | Dial extension | Audio both ways | LIVE | |
| P-03 | Dial external via trunk | Completes per permissions | LIVE | |
| P-04 | Answer inbound | Audio; notification if permitted | LIVE | |
| P-05 | Keypad / in-call DTMF | Digits sent | LIVE | |
| P-06 | Mute / unmute | Remote silence | LIVE | |
| P-07 | Hold / resume | Music/silence then resume | LIVE | |
| P-08 | Blind transfer | Target rings | LIVE | |
| P-09 | Attended transfer consult + complete | Bridged | LIVE | |
| P-10 | Attended cancel | Back to original | LIVE | |
| P-11 | Hangup | Clean teardown | LIVE | |
| P-12 | `?dial=` prefill | Number filled | AUTO | |
| P-13 | DND from portal | Matches server DND | LIVE | |
| P-14 | Directory presence + click-to-dial | Dials idle peers; DND not dialable | MANUAL | |
| P-15 | My calls inbound/outbound/missed | Lists populate | AUTO+MANUAL | |
| P-16 | Callback from missed | Dial attempt | LIVE | |
| P-17 | My recordings listen | Play only | MANUAL | |
| P-18 | Forwarding in my settings | Saved; honored | MANUAL | |
| P-19 | Voicemail list/play/mark read | Works | MANUAL | |
| P-20 | Change password (≥8) | New login; old fails | AUTO+MANUAL | |
| P-21 | Audio device selection | Mic/speaker/ring persist | AUTO+MANUAL | |
| P-22 | Dual registration desk+browser | First answer wins | LIVE | |
| P-23 | Off-site without TURN | Document failure; with coturn succeeds | LIVE | |
| P-24 | HTTP (non-TLS) mic | Expected fail | MANUAL | |

---

## Q. Background jobs

| ID | Steps | Expected | Type | Result |
| --- | --- | --- | --- | --- |
| Q-01 | Retention | Expired recordings removed | AUTO | |
| Q-02 | Archive job / manual run | Files on path/SFTP; flagged | AUTO | |
| Q-03 | Opus convert | Converts when ffmpeg present; skip archived | AUTO | |
| Q-04 | Queue callback job | Dials waiting callback | AUTO+LIVE | |
| Q-05 | Summary email daily/monthly | Sent or log-only | AUTO | |
| Q-06 | Trunk monitor | Detects down; alerts | AUTO+LIVE | |
| Q-07 | Nightly backup | Settings JSON without SIP secrets | AUTO | |
| Q-08 | SSL renew check | Near-expiry renew; nginx reload | LIVE | |
| Q-09 | Queue announce TTS pack on boot | Generated/skipped logged | MANUAL | |

---

## R. Deploy

| ID | Steps | Expected | Type | Result |
| --- | --- | --- | --- | --- |
| R-01 | Fresh `cp .env.example .env`; gen-certs; compose up | Lab usable | MANUAL | |
| R-02 | Health + seed admin/portal | Logins work | MANUAL | |
| R-03 | `docker compose down` (keep volumes) | Data persists on up | MANUAL | |
| R-04 | Document `down -v` destroys data | Operator aware | MANUAL | |
| R-06 | One-click image deploy with managed Postgres | Uses `DATABASE_URL` | LIVE | |
| R-07 | Build from repo root (`docker build .`, root `Dockerfile`) | Image builds | MANUAL | |
| R-08 | SPA from API `WEB_DIST` | Domain root not 404 | LIVE | |
| R-09 | VPS: EXTERNAL_IP, WSS, TURN, firewall script | Softphone off-site works | LIVE | |
| R-10 | Ports 443/80/5060/RTP/3478 | Documented exposure only | MANUAL | |
| R-11 | fail2ban profile optional | Starts when profile enabled | MANUAL | |

---

## S. Regression matrix (cross-feature)

| ID | Journey | Expected | Type | Result |
| --- | --- | --- | --- | --- |
| S-01 | Inbound DID → schedule open → published IVR menu → queue → answer | Full path; CDR+recording | LIVE | |
| S-02 | Inbound → schedule closed → voicemail | VM message left | LIVE | |
| S-03 | IVR get_key → API `$pin` → transfer | Correct agent | LIVE | |
| S-04 | API key originate → 101 answers | Bridged call | LIVE | |
| S-05 | Webhook on answered + CRM | Event received signed | LIVE | |
| S-06 | Blacklist + anonymous block + allowlist | Each control independently | LIVE | |
| S-07 | Spend limit trip mid-day | Further outbound fail | LIVE | |
| S-08 | Trunk failover outbound | Second trunk used | LIVE | |
| S-09 | Dual softphone ring race | One audio path | LIVE | |
| S-10 | Admin spy during queue call | Audit log + audio | LIVE | |
| S-11 | Backup → wipe settings → restore → reload → dial | Service restored | MANUAL | |
| S-12 | Locale TR + theme light full admin click-through | No crashes | MANUAL | |
| S-13 | Flow import from export of another env | Validates and publishes | MANUAL | |
| S-14 | After Asterisk restart | Endpoints re-register; ARI reconnects | LIVE | |

---

## Sign-off

| Role | Name | Date | Build / commit | Notes |
| --- | --- | --- | --- | --- |
| Tester | | | | |
| Reviewer | | | | |

**Smoke:** ___ / 9 · **Critical LIVE:** ___ · **Open fails:** ___

---

## Appendix: automated coverage map

| Area | Primary tests |
| --- | --- |
| Auth / TOTP | `apps/api/src/routes/auth.int.test.ts` |
| Portal API | `portal.int.test.ts` |
| Admin CRUD | `admin-resources*.int.test.ts`, `admin-extensions.int.test.ts` |
| Flow engine/runtime | `flow-engine.test.ts`, `flow-runtime.test.ts`, `flow-logic.test.ts` |
| Jobs | `jobs.int.test.ts`, `jobs2.int.test.ts` |
| Media | `media.int.test.ts` |
| Internal ingest | `internal-ingest.int.test.ts` |
| Security bans | `security.int.test.ts` |
| Admin UI smoke | `apps/web/src/pages/admin/admin-pages.test.tsx` |
| Portal UI | `PhonePage.test.tsx`, `portal.*.test.tsx` |
| Softphone lib | `apps/web/src/lib/softphone.test.ts` |

Re-run `pnpm test` on every release candidate; treat AUTO cases as regression guards, not a substitute for LIVE telephony paths.
