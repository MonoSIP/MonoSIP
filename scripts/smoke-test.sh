#!/usr/bin/env bash
# MonoSIP smoke test — verifies real functionality against a running instance.
# Not a "process is up / 200 OK" check: it exercises auth, authorization and the
# internal-hook guard, asserting response bodies, and exits non-zero on any fail.
#
# Usage:
#   BASE_URL=https://sip.example.com ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=... \
#     bash scripts/smoke-test.sh
# Defaults target a local dev instance on http://127.0.0.1:3000.
set -u

BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Admin123!}"
CURL=(curl -sk --max-time 15)
JAR="$(mktemp)"
pass=0; fail=0
ok(){ echo "  PASS: $1"; pass=$((pass+1)); }
no(){ echo "  FAIL: $1"; fail=$((fail+1)); }

echo "== MonoSIP smoke test against $BASE_URL =="

# 1. Health — the hard gate is database connectivity; overall "ok" also needs
#    Asterisk, which an API-only rig may not run, so report that but don't fail on it.
h=$("${CURL[@]}" "$BASE_URL/api/v1/health")
echo "$h" | grep -q '"db":true' && ok "health reports db:true (DB reachable)" || no "health db not reachable ($h)"
echo "$h" | grep -q '"ok":true' && echo "  INFO: health ok:true (all subsystems up)" \
  || echo "  INFO: health ok:false (a subsystem — e.g. Asterisk — is down in this environment)"

# 2. Unauthenticated identity endpoint must be rejected.
c=$("${CURL[@]}" -o /dev/null -w "%{http_code}" "$BASE_URL/api/v1/auth/me")
[ "$c" = "401" ] && ok "unauth /auth/me -> 401" || no "unauth /auth/me -> $c (want 401)"

# 3. Unauthenticated admin resource must be rejected.
c=$("${CURL[@]}" -o /dev/null -w "%{http_code}" "$BASE_URL/api/v1/admin/extensions")
[ "$c" = "401" ] && ok "unauth /admin/extensions -> 401" || no "unauth /admin/extensions -> $c (want 401)"

# 4. Admin login with valid credentials sets a session.
c=$("${CURL[@]}" -c "$JAR" -o /dev/null -w "%{http_code}" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" \
  "$BASE_URL/api/v1/admin/auth/login")
[ "$c" = "200" ] && ok "admin login -> 200" || no "admin login -> $c (want 200)"

# 5. Session resolves to an admin actor.
me=$("${CURL[@]}" -b "$JAR" "$BASE_URL/api/v1/auth/me")
echo "$me" | grep -q '"type":"admin"' && ok "/auth/me resolves admin actor" || no "/auth/me ($me)"

# 6. Admin resource returns data for the authenticated admin.
c=$("${CURL[@]}" -b "$JAR" -o /dev/null -w "%{http_code}" "$BASE_URL/api/v1/admin/extensions")
[ "$c" = "200" ] && ok "auth /admin/extensions -> 200" || no "auth /admin/extensions -> $c (want 200)"

# 7. Wrong password is rejected.
c=$("${CURL[@]}" -o /dev/null -w "%{http_code}" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"definitely-wrong\"}" \
  "$BASE_URL/api/v1/admin/auth/login")
[ "$c" = "401" ] || [ "$c" = "429" ] && ok "wrong password -> $c (rejected)" || no "wrong password -> $c (want 401/429)"

# 8. Internal dialplan hook is never open: no secret must be rejected (401 or,
#    on the all-in-one, 403 from the loopback guard).
c=$("${CURL[@]}" -o /dev/null -w "%{http_code}" -X POST -H 'Content-Type: application/json' \
  -d '{}' "$BASE_URL/api/v1/internal/security/ban")
{ [ "$c" = "401" ] || [ "$c" = "403" ]; } && ok "internal hook without secret -> $c" || no "internal hook -> $c (want 401/403)"

# 9. Logout clears the session.
c=$("${CURL[@]}" -b "$JAR" -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/v1/auth/logout")
[ "$c" = "200" ] && ok "logout -> 200" || no "logout -> $c (want 200)"
c=$("${CURL[@]}" -b "$JAR" -o /dev/null -w "%{http_code}" "$BASE_URL/api/v1/auth/me")
[ "$c" = "401" ] && ok "post-logout /auth/me -> 401" || no "post-logout /auth/me -> $c (want 401)"

rm -f "$JAR"
echo "== smoke: $pass passed, $fail failed =="
[ "$fail" -eq 0 ]
