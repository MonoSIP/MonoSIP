# TTS (Edge Neural + Piper fallback)

DSip generates IVR / prompt audio with **Microsoft Edge Neural TTS** (`edge-tts`) by default — clearer than Piper for many languages. **Piper** remains the offline fallback.

## Engines

| Engine | Quality | Needs internet | Notes |
| --- | --- | --- | --- |
| **edge** (default via `auto`) | High — e.g. `tr-TR-EmelNeural` / `en-US-JennyNeural` | Yes (at generate time) | Free unofficial Edge voices |
| **piper** | Offline — EN `lessac-high`, TR `fettah-medium` | No | MIT; used when Edge cannot reach Microsoft |

## Voices

| Language | Preferred (Edge) | Offline (Piper) |
| --- | --- | --- |
| Turkish | `tr-TR-EmelNeural` | `tr_TR-fettah-medium` (only quality published upstream) |
| English | `en-US-JennyNeural` | `en_US-lessac-high` |

Offline models are vendored into the image from `docker/tts/voices/` when present (`./docker/tts/fetch-voices.sh`), otherwise downloaded during `docker compose build tts`.

Male Turkish: set `TTS_EDGE_VOICE_TR=tr-TR-AhmetNeural` in `.env`.

## Config

```env
TTS_ENGINE=auto          # auto | edge | piper
TTS_EDGE_VOICE_TR=tr-TR-EmelNeural
TTS_EDGE_VOICE_EN=en-US-JennyNeural
TTS_URL=http://tts:5500
```

- `auto`: try Edge, fall back to Piper if network/API fails
- `edge`: Edge only (fails if offline)
- `piper`: offline only

## Usage

1. `docker compose up --build -d tts api`
2. Admin → **Prompts** → enter text → **Create + generate TTS** (or **Generate TTS**)
3. Prefer **pre-generated** prompts in flows (live TTS adds latency)

## Health

```bash
docker compose exec tts curl -fsS http://127.0.0.1:5500/health
```

## Notes

- Edge synthesis needs outbound HTTPS from the `tts` container (local “nice” voice). If the VPS blocks Microsoft speech endpoints, you hear Piper instead — rebuild `tts` so the image includes `en_US-lessac-high` + `tr_TR-fettah-medium`.
- Output is always 8 kHz mono WAV for Asterisk.
- Air-gapped VPS: run `./docker/tts/fetch-voices.sh` on a machine with Hugging Face access, copy `docker/tts/voices/*.onnx*` onto the VPS, then `docker compose build tts`, or set `TTS_ENGINE=piper`.
