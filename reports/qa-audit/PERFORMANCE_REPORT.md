# Performance Report

**Environment:** local macOS, Node 26, API run via `tsx` against Postgres 17
(Docker). API-only rig — embedded Asterisk/TTS not running, so `health.ok` is
`false` (asterisk down) but `db:true`. Tool: ApacheBench (`ab`). All numbers are
from actual executed runs; none are invented.

> Load tests were NOT run against production (`sip.dgn.tr`). Only read-only
> verification was done on prod earlier in the session.

## Startup time
Measured from process launch to first served HTTP response (`/auth/me` → 401):
**≈ 3.3 s** (includes migrate-check, config write, lazy route registration). TTS
model warm-up and Asterisk connect happen asynchronously and do not block listen.

## Baseline + load (ApacheBench)

### `GET /api/v1/health` — 2000 requests, concurrency 50
| Metric | Value |
|---|---|
| Requests/sec | **2,817** |
| Failed requests | **0** |
| Latency p50 | 16 ms |
| Latency p90 | 22 ms |
| Latency p95 | 25 ms |
| Latency p99 | 35 ms |
| Mean (per request) | 17.7 ms |

Health runs a DB `SELECT 1` plus an Asterisk reachability probe (fails fast
here), so this reflects DB round-trip + framework overhead.

### `GET /api/v1/admin/extensions` — authed DB read, 2000 requests, concurrency 25
| Metric | Value |
|---|---|
| Requests/sec | **1,773** |
| Failed requests | **0** |
| Latency p50 | 13 ms |
| Latency p95 | 18 ms |
| Latency p99 | 37 ms |

Includes session-token lookup (`sessions` join) + extensions query. Comfortably
fast; no connection-pool errors at 25 concurrent.

### `POST /api/v1/admin/auth/login` — scrypt, 200 requests, concurrency 4
| Metric | Value |
|---|---|
| Requests/sec | **44** |
| Mean per request | 90 ms |
| p50 / p95 / p99 | 89 / 111 / 131 ms |
| Failed requests | 0 |

**Analysis:** login is by far the heaviest endpoint (~90 ms), dominated by
`scryptSync(password, salt, 64)`. This is *intentional* — scrypt is a deliberately
slow KDF and is the correct choice for password hashing. Throughput is therefore
CPU-bound (~44/s per few cores).

- **Risk (P3):** a burst of login attempts from many distinct IPs could saturate
  CPU (each costs ~90 ms of synchronous-ish hashing). Mitigations in place:
  per-IP in-memory failure counter + DB ban after `securityLoginMaxRetry` (default
  8), and an admin-IP allowlist. These bound a single-IP attacker well; a
  distributed attempt is throttled per-IP but not globally rate-limited.
- **Recommendation:** keep scrypt; optionally cap concurrent in-flight login
  hashes (a small semaphore) so a login flood can't starve other requests. Not
  urgent given the existing throttle.

## Endurance / resource notes
- No full endurance run (hours) was performed. However a concrete **resource
  leak was found and fixed**: the `sessions` table grew without bound (every
  login inserts a row; expired rows were never deleted — only filtered on read).
  See FIXES_APPLIED.md (`pruneExpiredSessions`). Over a long-running deployment
  this would have slowly enlarged the hottest lookup table (session resolution on
  every authenticated request).
- Background jobs (retention, archive, recording-convert, trunk-monitor, ssl,
  clock, summary-email, queue-callback, sip-guard) are all interval timers with
  `.catch()` guards; none spin-loop. The recording-convert job processes 20
  files/hour and skips files modified in the last 5 min (avoids racing in-progress
  recordings).

## Not measured (BLOCKED / out of scope here)
- SIP call setup latency, RTP media, TTS synthesis latency — need the full
  Asterisk + coturn + TTS stack (the web `test:e2e:perf` Playwright suite).
- Sustained multi-hour endurance and memory-growth curves.
- 100-concurrent stress to breaking point — not run to avoid an unbounded local
  resource test; the 50-concurrent health run showed 0 errors with low latency,
  so headroom exists well beyond typical PBX admin traffic.
