# TTS (embedded in the main image)

DSip generates IVR / prompt audio **inside the all-in-one container** — no sidecar and no
extra network dependency. Engines: **Microsoft Edge Neural** (online), **EMA Lightning**
(Turkish offline), **Kokoro-82M** (English offline).

## Engines

| Engine | Quality | Needs internet | Notes |
| --- | --- | --- | --- |
| **edge** (default via `auto`) | High — e.g. `tr-TR-EmelNeural` / `en-US-JennyNeural` | Yes (at generate time) | Free unofficial Edge voices |
| **ema** | High neural (TR) | No | EMA Lightning; Settings / Prompts: `ema-lightning` |
| **kokoro** | High neural (EN) | No | Kokoro-82M ONNX; Settings / Prompts: `kokoro` |

Weights for EMA + Kokoro are baked into the root `Dockerfile` at build time.

## Voices

| Language | Preferred (Edge) | Offline neural |
| --- | --- | --- |
| Turkish | `tr-TR-EmelNeural` | `ema-lightning` |
| English | `en-US-JennyNeural` | `kokoro` (`af_heart`) |

## Config

```env
TTS_URL=http://127.0.0.1:5500
TTS_EMBEDDED=1
TTS_ENGINE=auto          # auto | edge | ema | kokoro
TTS_ENABLE_EMA=1
TTS_ENABLE_KOKORO=1
TTS_KOKORO_VOICE=af_heart
```

- Entrypoint starts gunicorn on `127.0.0.1:5500` (`apps/api/scripts/start-tts.sh`).
- `TTS_EMBEDDED=0` skips the local process (only if you point `TTS_URL` elsewhere).

## Health

```bash
# All-in-one / compose api container
docker exec <container> curl -fsS http://127.0.0.1:5500/health
```

## Notes

- Offline TR/EN works with no outbound network after the image is built.
- Edge needs outbound HTTPS when selected (or when `auto` reaches Microsoft).
- Output is always 8 kHz mono WAV for Asterisk.
- Optional standalone image remains at `docker/tts/` for debugging only.
