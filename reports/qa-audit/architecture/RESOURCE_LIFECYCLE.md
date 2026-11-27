# Resource Lifecycle

## Listeners & timers

| Resource | Create | Cleanup | Evidence |
|---|---|---|---|
| `/ws` EventEmitter subs + intervals | after auth | `teardown()` on close; installed **before** await | `routes/ws.ts` L24–30, L119–130 |
| ARI poll `setInterval` 5s | `ari.start` | `ari.stop` clears | `ari.ts` |
| ARI WS sockets (3 apps) | `connectApps` | close + `sockets = []` | `ari.ts` |
| Job intervals | `start*Job` in `index.ts` | process lifetime (no graceful drain API) | jobs/* |
| asterisk-log look/beat intervals | route handler | must clear on close | `asterisk-log.ts` |

**Prior fix retained:** WS teardown-before-await prevents permanent listener leaks on quick disconnect.

## SIP / IVR session cleanup

| Map | Cleared when |
|---|---|
| `ari.calls` | rebuilt each poll |
| `dtmfWaiters` / `dtmfBuffers` / `playbackWaiters` | hangup / destroy paths |
| `pendingTransfers` | consume or fail |
| `cdr` open Map | end/destroy |
| `trunk-monitor` `lastState` | process lifetime (bounded by trunk count) |

## Database connections

- Drizzle/`pg` pool via `db/client` — standard pool release on query end.  
- No evidence of manual client checkout without release in app code.  
- Integration tests use dedicated test DB URL.

## Temporary files

| Kind | Cleanup |
|---|---|
| TTS WAV cache | `purgeExpiredTtsCache` on boot + expiry column |
| Recordings | retention + archive + empty purge |
| Archive temp | `unlink` in archive job `.catch` |
| Announce recordings | keep gate deletes short files |

## Unbounded collections (assessed)

| Collection | Bound | Risk |
|---|---|---|
| `sessions` table | pruned by retention | was unbounded before prune — **fixed** |
| `liveEvents` listeners | `setMaxListeners(100)` | many portal tabs |
| `ari.calls` | ≈ concurrent channels | OK |
| `lastState` (trunks) | #trunks | OK |
| Job `setInterval` without unref | 1 per job type | OK for single process |

## Memory leak posture

- No heap-snapshot campaign in this audit (non-destructive / read-only).  
- Structural leak class (WS auth race) already addressed in code with regression comments.  
- Architecture test `resource-lifecycle.test.ts` locks WS teardown + job `.catch` / try-catch guards.

## Worker restart behavior

- All workers are in-process: API restart cancels intervals and rebuilds on boot.  
- No durable job queue — at-most-once / next-tick semantics.  
- Dialplan write retries in boot loop until success (readiness gate).

## Graceful shutdown gap

**INFO:** `index.ts` does not register a comprehensive SIGTERM handler that stops ARI + clears all job intervals before exit. Docker stop relies on process kill; acceptable for single-container PBX, weaker for draining live calls.
