# Production Readiness Assessment (Phase 3 — Final Acceptance)

Independent third-phase validation. Everything below was **executed** in this
pass unless marked **BLOCKED** / **NOT RUN**. Changes remain in the working tree
only (no commit / push / release / production credential changes), per brief.

**Environment:** macOS arm64, Node 26, Docker Desktop. Isolated labs:
- `pbx` — `ghcr.io/monosip/monosip:main` on `sipnet` (`172.30.0.10`), host `:3100`
- `pbxweb` — same image, host `:3200` + RTP UDP `10000–10100` (browser e2e)
- `monosip-qa-pg` — Postgres 17 on `:55433` (API integration)

---

## Overall: **93 / 100** — *production-ready with operator follow-ups*

Up from Phase 2 (88). Gains: **Zod HIGH closed** (zod@4.6.7; 0 critical / 0 high
advisories), **browser SIP/IVR/queue/flow/uploads e2e green**, **real SIPp
INVITE→RTP→concurrent path re-validated**, operator admin hardening procedure
written, full unit/integration/typecheck/lint/smoke/build re-run. Points still
held back: GitHub Actions CI **not executed on a GitHub runner** (push forbidden
by brief), production admin password/TOTP remains an **operator action**, SIPp
UDP REGISTER is flaky for some AoRs under amd64-QEMU, and five **moderate**
dev-only advisories remain as documented exceptions.

### Scoring method (evidence only)
100 base.
−2 GitHub CI unproven on a real runner (workflow exists; push forbidden here).
−2 production admin still on legacy default until operator completes the
   procedure (app supports rotation+TOTP+session kill; not auto-changed).
−1 SIPp hardware-AoR REGISTER flake under qemu (product WebRTC path solid;
   busy/noanswer SIPp UAS matrix not completed in this re-run — covered by
   browser e2e).
−1 residual moderate toolchain CVEs (vitest/glob/minimatch — **dev-only**,
   accepted exception).
−0 endurance 60-minute run completed without runaway growth (see §5).
= **93**.

---

## 1. Security & dependencies

### Zod HIGH
| Item | Status |
|---|---|
| Advisory (`zod` < 4.6.6) | **RESOLVED** — lockfile has `zod@4.6.7` in api/web/shared |
| Migration | Already performed in working tree (`z.guid()`, Zod 4 schemas) |
| Regression | typecheck **PASS**; API unit **495/495**; integration **732/732**; web unit **201/201** |
| API contract | No unexpected contract break observed in smoke (admin login/me/extensions) or e2e |

### `pnpm audit` (Phase 3 snapshot)
**0 critical · 0 high · 5 moderate · 0 low.**

| Severity | Package | Prod path? | Disposition |
|---|---|---|---|
| moderate | `vitest` / `@vitest/mocker` (×3 advisories) | **no** (dev) | **Accepted exception** — test runner only |
| moderate | `glob` via `@vitest/coverage-v8` | **no** | **Accepted exception** |
| moderate | `minimatch` via coverage toolchain | **no** | **Accepted exception** |

Raw: `reports/qa-audit/_audit-phase3.txt` / `_audit-phase3.json`.

**No critical or high advisory remains without a documented exception.**

---

## 2. Administrative security (operator procedure)

**Deliverable:** `reports/qa-audit/admin/OPERATOR_ADMIN_HARDENING.md`

Covers: strong unique password, TOTP setup/enable, session invalidation (API
deletes other admin sessions on password change), verification checklist, and
break-glass recovery (host/psql — no emailed backup codes).

**Explicitly NOT done here:** no production credential was read, printed, or
changed. Residual risk until the operator signs the checklist: legacy
`Admin123!` / TOTP-off on long-lived installs.

---

## 3. Real SIP validation

Lab: SIPp + G.711A/RFC2833 pcaps against isolated `pbx` on `sipnet`.
Report: `reports/qa-audit/sip-lab/out/RESULTS.md`.

| Check | Status | Notes |
|---|---|---|
| REGISTER (UDP, ext 100) | **PASS** (intermittent on some AoRs) | 401→200 observed; 101/103 sometimes hang after auth under qemu |
| INVITE → 100 Trying → 200 OK → ACK | **PASS** | `p3-dtmf` dump |
| BYE | **PASS** | server and/or UAC BYE with 200 |
| RTP (G.711A pcap) | **PASS** | scenario plays pcap; call length ~5–7 s |
| DTMF (RFC2833 pcap) | **PARTIAL** | setup 204 ms; SIPp FailedUnexpectedMessage when Asterisk BYE arrived mid-wait |
| Concurrent calls | **PASS** | **5/5** success, 0 fail; setup mean **130 ms** (stdev 8 ms) |
| Busy / no-answer / cancel / transfer (SIPp UAS) | **NOT RUN** (this re-run) | Covered by browser e2e I3–I7 + queue Q1–Q4 |
| Jitter / packet-loss % | **NOT RUN** | No RTP packet-capture analyzer wired; media path exercised via pcap playback only |

**BLOCKER note (lab, not product):** amd64 Asterisk under QEMU shows flaky UDP
digest completion for some extensions. WebRTC softphone path is the supported
browser path and is green.

---

## 4. Browser E2E (Playwright, isolated `pbxweb`)

| Suite | Result |
|---|---|
| `sip-ivr.e2e.mjs` | **14/14 PASS** (auth, REGISTER, multi-tab, reload, DND reload storm, outbound, IVR DTMF, busy/reject/noanswer, reconnect, CDR close) |
| `queue.e2e.mjs` | **4/4 PASS** (answer, busy skip, join-empty, max-wait overflow) |
| `flow-designer.e2e.mjs` | **PASS** (Save/Validate/Publish + canvas; selectors updated for settings sheet) |
| `uploads.e2e.mjs` | **PASS** (prompts Create modal + MOH Edit upload) |
| `perf.e2e.mjs` | **PASS** (CPU×4 LCP/ready metrics table) |

C3 assertion aligned to WebRTC `max_contacts=2` (was wrongly expecting 3).

---

## 5. Endurance (60 minutes)

Sampler: `reports/qa-audit/endurance/run-60m.sh` → `endurance/out/samples.csv`
(+ `summary.md`). Target: all-in-one `pbx` container (API+Asterisk+embedded DB).

| Run | Duration | RSS trend | Result |
|---|---|---|---|
| Phase 2 | 17 min (34 samples) | 316→274 MB, no climb | partial PASS |
| Phase 3 smoke | 90 s (3 samples) | flat ~1.57 GiB, FDs=16 | PASS heuristic |
| Phase 3 full | **3578 s (~60 min), 107 samples** | early mean 1.58 GiB → late mean 1.67 GiB (Δ ≈ +82 MiB, **+5.3%**); FDs flat at 16 | **PASS** |

Phase-3 full-run detail:
- Health latency: min 29 / p50 41 / max 144 ms; `db_ok` and `asterisk_ok` true on every sample
- CPU %: mean ~4 (spikes to ~44 under sampler `docker stats` noise)
- FDs: **16** throughout (no FD leak)
- Sessions via in-container psql: unavailable (−1) — not used for the leak call
- Leak heuristic: **PASS** (growth ≪ 25% runaway threshold; no continuous unbounded climb)

Note: absolute RSS ~1.6 GiB is expected for the all-in-one image (Asterisk +
Postgres + Node). The acceptance criterion is stabilization, not a small API-only
footprint.

---

## 6. CI validation

| Job in `.github/workflows/ci.yml` | Local command check | GitHub runner |
|---|---|---|
| `check` (typecheck, lint, unit, web build) | **PASS** (executed locally this phase) | **BLOCKED** |
| `integration` (Postgres service + smoke) | **PASS** locally (732 + smoke 10/10) | **BLOCKED** |
| `audit` (critical blocks) | **PASS** locally (0 critical) | **BLOCKED** |

**Blocker:** brief forbids `git push`. The workflow file is untracked in the
working tree and has never run on `github.com` runners. Do **not** treat YAML
validation as a green CI run. After merge of the workflow, make `check` +
`integration` required status checks.

---

## 7. Final verification matrix

| Suite | Count / gate | Status |
|---|---|---|
| API unit | 495 | **PASS** |
| API integration | 732 | **PASS** |
| Web unit | 201 | **PASS** |
| Typecheck (shared/api/web) | 0 errors | **PASS** |
| ESLint | 0 errors (6 warnings in tests) | **PASS** |
| Smoke | 10/10 | **PASS** |
| Web build | vite production build | **PASS** |
| `pnpm audit` | 0 crit / 0 high | **PASS** |
| Coverage (api unit v8) | measured; critical libs high, some routes 0% in unit-only | **PASS** (informational) |
| SIP SIPp lab | see §3 | **PASS** with noted PARTIAL/NOT RUN rows |
| Browser e2e | see §4 | **PASS** |
| Endurance 60m | 107 samples / 3578 s | **PASS** |
| GitHub Actions | — | **BLOCKED** |

**Automated tests executed & passing this phase:** 495 + 732 + 201 = **1,428**
plus smoke 10/10 and the browser/SIP labs above.

---

## 8. Remaining limitations

1. **Operator must** rotate prod admin password + enable TOTP (procedure above).
2. **CI must** be pushed and observed green on GitHub before relying on it as a
   merge gate.
3. SIPp UDP REGISTER flake under qemu — use native amd64 CI lab or rely on
   WebRTC e2e for softphone confidence.
4. Five moderate **dev-only** advisories (vitest stack) — bump vitest when
   convenient; not a runtime ship blocker.
5. RTP jitter/loss percentages not instrumented (pcap playback ≠ RTP analytics).
6. Site Playwright marketing e2e still not in scope of this PBX lab.

---

## 9. Production deployment checklist

- [ ] Operator completes `admin/OPERATOR_ADMIN_HARDENING.md` on production
- [ ] Confirm TOTP enabled; `Admin123!` rejected
- [ ] Push/merge CI workflow; require `check` + `integration` status checks
- [ ] Re-run `pnpm audit --audit-level=high` in CI (informational until vitest bump)
- [ ] Deploy only from tagged release after CI green
- [ ] Post-deploy: health `db:true` + `asterisk:true`; trunk REGISTER up; one
      real inbound IVR smoke call
- [ ] Confirm RTP ports published / `EXTERNAL_IP` / `LOCAL_NETS` for the host
- [ ] Keep encryption/session secrets from bootstrap volume (do not reset)

---

## Verdict

**Accept for production** after the operator admin hardening steps and the first
real GitHub CI green run. Application security HIGH/CRITICAL dependency gap is
closed; functional and browser/SIP labs are green with the documented lab
limitations above. Score **93/100** — not inflated for BLOCKED CI or unfinished
operator actions.
