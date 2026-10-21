# Screens

The admin panel has 15 screens; the user portal has 5. Both live in the same Vite app with different layouts by role.

## Admin panel

| Screen | Content |
| --- | --- |
| Dashboard | Active calls, queue waiters, extension state, trunk status, today’s summary; full-screen (TV) mode |
| Extensions | List (state, DND, device); detail tabs: general, forwarding, permissions, recording, portal, devices; CSV import/export |
| Ring groups | List and edit |
| Queues | List; detail: settings, members (drag-and-drop order, pause), announces, overflow destinations |
| Schedules | Weekly editor, holiday calendar, manual override, “now” status |
| IVR (flows) | List; designer: canvas, node palette, node settings, simulation panel, version history |
| Trunks | SIP provider list, create form, live status |
| Routes | Inbound and outbound routes, blacklist |
| Prompts | Upload announcements, generate via TTS, live TTS cache |
| Music on hold | Classes (unique names), upload, preview, delete |
| Recordings | Filtered list, waveform player, download, access log |
| Call logs | Filtered CDR table; a clicked row expands in place with call facts and the IVR step timeline; CSV export |
| Missed calls | Waiting / called-back list |
| Reports | Summary, queue, extension, IVR DTMF, quality; date range |
| Integration | Webhooks, API keys |
| Settings | General; security (admin/portal/SIP IP allowlists, denylist, bans, firewall export, login flood); country/spend limits; KVKK; email; backup; audit log; 2FA |

## User portal

| Screen | Content |
| --- | --- |
| Phone | Softphone: keypad, call on the phone screen, recent calls behind a button; a mini phone appears on every other portal page |
| Directory | Coworkers and presence, dial |
| My calls | Inbound, outbound, missed; callback |
| My recordings | List and player (listen only) |
| My settings | DND, forwarding, voicemail, password, audio devices |

## Shared UI rules

- Desktop left nav; mobile bottom tabs (portal) or hamburger (admin)
- Light/dark theme; follows system preference, overridable
- Tables become cards on mobile; flow designer is view-only on mobile
- Default UI language is **English** (Turkish available in-app). Dates/numbers use locale formatting
