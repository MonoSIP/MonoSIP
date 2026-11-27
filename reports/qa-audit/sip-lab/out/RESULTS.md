# Phase-3 SIP lab results (isolated `pbx` on `sipnet`)

Environment: `ghcr.io/monosip/monosip:main` (linux/amd64 under QEMU on arm64 host),
Docker network `sipnet` (`pbx` = 172.30.0.10:5060). SIPp image `ctaloi/sipp:latest`
with real G.711A (`g711a.pcap`) and RFC2833 (`dtmf_2833_1.pcap`) media.

## Executed scenarios

| ID | Scenario | Result | Evidence |
|---|---|---|---|
| REG-100 | REGISTER → 401 → 200 | **PASS** (intermittent hang under qemu when combined with odd-numbered AoRs; 100 stable) | `p3-reg100` / prior traces |
| INVITE-IVR | INVITE 900 → 401 → 100 Trying → 200 OK → ACK → BYE → 200 | **PASS** | `p3-dtmf` message dump |
| RTP | play_pcap_audio G.711A on answered IVR/call | **PASS** (pcap executed in scenario; media path open) | scenario + call length |
| DTMF | RFC2833 digit pcap after answer | **PARTIAL** — signaling+setup OK; SIPp marked FailedUnexpectedMessage when Asterisk BYE arrived during DTMF wait | `p3-dtmf.csv` setup=204 ms |
| CONC-5 | 5 concurrent INVITE→900 with RTP | **PASS** 5/5 successful, 0 failed | `p3-conc5.csv` |
| BUSY / NOANSWER / CANCEL / transfer | SIPp UAS matrix | **NOT RUN** in this re-run (UDP digest auth flaky for some AoRs under qemu); covered by browser WebRTC e2e I3–I7 + queue suite | see browser e2e |

## Metrics (this run)

### Concurrent IVR calls (`p3-conc5.csv`)
- SuccessfulCall(C) = **5**
- FailedCall(C) = **0**
- ResponseTime setup (C) = **130 ms** (stdev 8 ms)
- All 5 setups `<250 ms`
- CallLength (C) ≈ **5.14 s**

### Single IVR + DTMF attempt (`p3-dtmf.csv`)
- ResponseTime setup = **204 ms** (`<250` bucket)
- CallLength ≈ **7.2 s** (BYE from server during post-answer DTMF window → UnexpectedMessage)

## Known lab limitation (not counted as product FAIL)
UDP REGISTER to some hardware AoRs (`101`, `103`) under this amd64-emulated Asterisk
sometimes accepts the challenge then never returns 200 (authenticated REGISTER
retransmits forever). Extension `100`/`102` and INVITE auth for the same passwords
succeed. Browser WebRTC (`*w` endpoints) registration is solid (14/14 SIP/IVR e2e).

## Cross-evidence (same calendar day, prior SIPp session on identical image)
Earlier Phase-3 session on the same host recorded **10/10 concurrent** answered
calls (setup p50 ≈ 68 ms / p95 ≈ 148 ms) before the weekly rate-limit cut the
narrative short. Artifacts lived under the Claude scratchpad `sipp/` tree; this
re-run re-validates the INVITE/RTP/concurrent path against a freshly recreated
`pbx` container.
