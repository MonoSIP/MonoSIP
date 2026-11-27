# Security Report

Two efforts feed this report: (A) a full **external penetration audit** performed
earlier this session against a local instance plus a code review of every
internet-reachable surface — real findings were reproduced, fixed and shipped
(releases 1.9.5–1.9.7); (B) this QA pass, which re-reviewed the OWASP classes and
added regression tests. No new exploitable vulnerability was found in (B).

## A. Reproduced findings — FIXED & SHIPPED

### S1 — Internal dialplan endpoints reachable from the internet (HIGH, fixed 1.9.5)
`/api/v1/internal/*` (CDR, recording, voicemail, ban, blacklist, DND) skipped the
admin IP guard and were proxied to the internet by nginx, guarded only by a shared
secret. **Reproduced locally:** with the default secret, an unauthenticated client
banned an arbitrary IP and injected a forged CDR (both persisted in the DB).
- Impact: DoS (ban the admin's own IP), CDR/recording/voicemail data injection.
- Fix: in the all-in-one image the internal routes now require a **loopback** peer
  (the dialplan is on 127.0.0.1); external peers are refused even with a leaked
  secret. Secret compare switched to **constant-time** (`safeEqual`). Verified on
  prod: external POST now returns 403.

### S2 — No default-secret guard (HIGH→context, fixed 1.9.5/1.9.7)
`config.ts` fell back to public built-in defaults for `ENCRYPTION_KEY`,
`INTERNAL_API_SECRET`, `SESSION_SECRET`, ARI/AMI and admin passwords and booted
anyway. Fix: boot-time warning listing each defaulted secret, refuse-to-boot under
`MONOSIP_REQUIRE_SECRETS=1`, plus `db:rotate-key` + `ENCRYPTION_KEY_OLD` fallback
for safe key rotation. **Note:** the all-in-one image already self-generates and
persists strong per-install secrets (`bootstrap-runtime.sh`); 1.9.7 extends this
to the admin password (no more public `Admin123!` on a fresh install).

### S3 — CORS reflected any Origin with credentials (LOW/MEDIUM, fixed 1.9.5)
`cors({ origin: true, credentials: true })` echoed any `Origin` with
`Allow-Credentials: true`. Mitigated by `SameSite=Lax` cookies but fragile. Fix:
origin allowlist (configured host/URL/SIP domain + loopback + RFC-1918 LAN).
Verified on prod: `evil.example` is no longer reflected.

### S4 — Call-back widget open dialer / toll fraud (MEDIUM, fixed 1.9.5)
`POST /api/v1/public/widgets/:key/callback` with an empty prefix list would dial
any visitor-supplied number via `Local/<n>@from-internal`. Fix: refuse when no
prefixes are configured (fail closed).

### S5 — Revoking portal access left live sessions (INFO, fixed 1.9.5)
`resolveActor` re-checked the extension exists but not `portalEnabled`. Fix: a
disabled portal now drops live sessions, not just new logins.

### S6 — 500 handler leaked `error.message` (LOW, fixed 1.9.5)
Generic "Internal error" now returned to clients; detail stays in server logs.

## B. OWASP re-review (this QA pass) — current state

| Class | Finding |
|---|---|
| SQL injection | **None.** Drizzle parameterizes all queries; the number search strips `% _ \`. |
| Command injection | **None.** `execFile`/`spawn` use argument arrays (ffmpeg, pg_dump, espeak, asterisk -rx). The one `sh -c` (`reloadScript`) wraps only static Asterisk reload verbs, no user data. |
| XSS (stored/reflected) | **None found.** Web app has no `dangerouslySetInnerHTML`/`innerHTML` sinks; React auto-escapes. |
| AuthN | scrypt + 16-byte salt, `timingSafeEqual`; 48-byte random DB session tokens, re-issued on login (no fixation); optional TOTP (otplib). |
| AuthZ / IDOR | **Blocked.** Portal recording/voicemail streams are ownership-checked via CDR join / `extensionId`; foreign/random IDs → 404 (verified live earlier). |
| SSRF | Config-controlled upstreams (ARI/TTS); widget callback dials via ARI with URL-encoded params. No user-controlled fetch target. |
| Path traversal | Recording/voicemail file paths come from the DB; the greeting media id derives from the session's own extension number, not request input. |
| Session mgmt | httpOnly, `SameSite=Lax`, `Secure` when HTTPS. Expired rows now pruned (QA fix). |
| Rate limiting | Per-IP login throttle + DB bans; per-API-key rate limit + IP allowlist; widget per-IP-hour + daily caps. No global request rate limit (see below). |
| Crypto | AES-256-GCM (random IV, auth tag); scrypt; HMAC via `createHmac`. Sound. |
| Trust proxy | `req.ip` trusts only hop-0 (the socket peer) — correct design; prevents XFF spoofing behind the intended proxy. |
| RCE / self-update | The updates route is a read-only GET; no code execution path. |

### Open security-adjacent items (recommendations, not exploited)
- **Dependency CVEs** — 12 high on prod paths (node-forge via acme-client, etc.).
  See DEPENDENCY_AUDIT.md. Highest real-world relevance: ACME/TLS stack.
- **No global request rate limit** — only per-IP login + per-key limits. A
  distributed flood of unauthenticated requests (e.g. login, hitting scrypt) is
  throttled per-IP but not globally. P3; consider a lightweight global limiter.
- **Admin password on the existing prod** is still `Admin123!` with TOTP off (the
  auto-generation only applies to fresh installs). Operator action required.

## Regression tests added
- Security unit tests added earlier this session: `cors-origin.test.ts`,
  `secret-check.test.ts`, `internal-auth.test.ts` (loopback guard + const-time),
  `crypto-rotation.test.ts` (key-rotation fallback). All pass.
- Live verification of S1/S3 against prod (403 on internal, no CORS reflection).
