# TTS (Edge Neural + Piper fallback)

DSip generates IVR / prompt audio with **Microsoft Edge Neural TTS** (`edge-tts`) by default — clearer than Piper for many languages. **Piper** remains the offline fallback.

## Engines

| Engine | Quality | Needs internet | Notes |
| --- | --- | --- | --- |
| **edge** (default via `auto`) | High — e.g. `tr-TR-EmelNeural` / `en-US-JennyNeural` | Yes (at generate time) | Free unofficial Edge voices |
| **piper** | Medium — e.g. `tr_TR-fettah-medium` | No | MIT, fully offline |

## Voices

| Language | Preferred (Edge) | Offline (Piper) |
| --- | --- | --- |
| Turkish | `tr-TR-EmelNeural` | `tr_TR-fettah-medium` |
| English | `en-US-JennyNeural` | `en_US-lessac-medium` |

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

- Edge synthesis needs outbound HTTPS from the `tts` container.
- Output is always 8 kHz mono WAV for Asterisk.
- Air-gapped VPS: set `TTS_ENGINE=piper`.
