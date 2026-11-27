# Operator procedure — production admin hardening

**Scope:** `sip.dgn.tr` (and any existing install that still has the legacy
`admin@example.com` / `Admin123!` credential with TOTP off).

**Constraints for this QA pass:** credentials must **not** be changed by
automation. An operator performs the steps below in the admin UI (or equivalent
authenticated API calls) during a controlled window.

Do **not** paste production passwords, TOTP secrets, or recovery codes into
tickets, chat, or git.

---

## Why this is required

Fresh installs (1.9.7+) generate a unique first-run admin password and print it
once in the container log. Long-lived deployments that predate that change may
still use the documented lab default `Admin123!` with TOTP disabled. That is an
operator-action residual, not an application defect.

## Pre-checks (read-only)

1. Confirm you can open the admin UI over HTTPS for the production host.
2. Confirm you have a second factor device ready (Authy / 1Password / Aegis / etc.).
3. Confirm you have an out-of-band break-glass path (SSH/console to the host) in
   case TOTP enrollment goes wrong — see Recovery below.
4. Optionally, from a workstation, verify login still works with the *current*
   password (do not log the password). Note whether TOTP is prompted.

## Procedure

### 1. Sign in as the current admin

- URL: `https://<host>/` → admin sign-in.
- Email: the existing admin email (often still `admin@example.com` on older
  installs — change it in step 3 if so).
- Password: current password.
- If TOTP is already enabled, enter the current code.

### 2. Change to a strong unique password

In **Settings → Admin sign-in** (or `POST /api/v1/admin/auth/password`):

- `currentPassword`: current password
- `newPassword`: generate a unique password (≥16 chars, password manager).
  Must differ from the current password (API enforces this).
- Optionally set `email` to a real operator mailbox (not `admin@example.com`).

**API effect:** password (and optional email) update; **all other admin sessions
for this account are deleted** (the calling session is kept). Capture this as
session invalidation evidence.

Store the new password only in the operator password manager.

### 3. Enable TOTP

1. `POST /api/v1/admin/auth/totp/setup` (or UI “Set up authenticator”) while
   authenticated — returns `otpauth` URI + QR. **Do not screenshot into git.**
2. Scan with the authenticator app; confirm the rotating 6-digit code.
3. `POST /api/v1/admin/auth/totp/enable` with `{ "code": "<6 digits>" }`.
4. `GET /api/v1/admin/auth/totp/status` → `{ "enabled": true }`.

### 4. Verify authentication end-to-end

1. Sign out (or use a private window).
2. Sign in with email + **new** password only → expect TOTP challenge
   (`totpRequired` / no session cookie yet).
3. Wrong TOTP → rejected.
4. Correct TOTP → session issued; `GET /api/v1/admin/auth/me` succeeds.
5. Confirm the **old** password is rejected.
6. Confirm a second browser that still held an old cookie is logged out
   (password change already dropped other sessions; optionally repeat a
   password-change no-op is not available — logout + login is enough).

### 5. Confirm no default credentials remain

- Attempt login as `admin@example.com` / `Admin123!` → must fail (401), unless
  that email was intentionally kept **and** the password was rotated away from
  `Admin123!`.
- `GET /api/v1/admin/auth/totp/status` as the live admin → `enabled: true`.
- Document completion date + operator initials in the ops runbook (not in git).

## Recovery procedures

MonoSIP does **not** email TOTP backup codes. Break-glass options:

1. **Host console / SSH** into the deployment host and use the container shell
   to clear TOTP on the admin row (authorized emergency only), e.g. via
   `psql` against the app database:
   - Set `totp_enabled = false`, `totp_secret = null` for the known admin id.
   - Then sign in with password only and re-enroll TOTP immediately.
2. **Password lost + TOTP lost:** use `db:reset-admin` / bootstrap tooling on
   the host (see project README) to set a new admin password from the console,
   then re-enable TOTP. This is a privileged host operation.
3. After any break-glass, rotate the password again and re-enroll TOTP; review
   audit log for `admin.password_change` / `admin.totp_enable`.

## Verification checklist (operator signs off)

| Check | Pass? |
|---|---|
| Strong unique admin password set (not `Admin123!`) | ☐ |
| Admin email is a real mailbox (not left as example.com if avoidable) | ☐ |
| TOTP enabled and login requires code | ☐ |
| Other sessions invalidated after password change | ☐ |
| Old password rejected | ☐ |
| Break-glass recovery path known to the operator | ☐ |
| Defaults confirmed dead (`Admin123!` fails) | ☐ |

## Explicit non-actions for this QA pass

- No production credential was read, printed, or changed by the auditor.
- No TOTP secret was generated against production.
- This document is the deliverable for “Administrative Security”.
