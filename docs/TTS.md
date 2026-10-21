# TTS (embedded in the main image)

DSip generates IVR / prompt audio **inside the all-in-one container** — no sidecar and no
extra network dependency. Engines: **Microsoft Edge Neural** (online) and **EMA Lightning**
(Turkish offline). English has no offline engine: Kokoro-82M was removed because its model
crowded a small PBX's memory and pushed EMA into swap. A stored `kokoro` voice plays as Edge.

## Engines

| Engine | Quality | Needs internet | Notes |
| --- | --- | --- | --- |
| **edge** (default via `auto`) | High — e.g. `tr-TR-EmelNeural` / `en-US-JennyNeural` | Yes (at generate time) | Free unofficial Edge voices |
| **ema** | High neural (TR) | No | EMA Lightning; Settings / Prompts: `ema-lightning` |

Weights for EMA are baked into the root `Dockerfile` at build time.

## Voices

| Language | Preferred (Edge) | Offline neural |
| --- | --- | --- |
| Turkish | `tr-TR-EmelNeural` | `ema-lightning` |
| English | `en-US-JennyNeural` | — |

## Config

```env
TTS_URL=http://127.0.0.1:5500
TTS_EMBEDDED=1
TTS_ENGINE=auto          # auto | edge | ema
TTS_ENABLE_EMA=1
```

- Entrypoint starts gunicorn on `127.0.0.1:5500` (`apps/api/scripts/start-tts.sh`).
- `TTS_EMBEDDED=0` skips the local process (only if you point `TTS_URL` elsewhere).

## Health

```bash
# All-in-one / compose api container
docker exec <container> curl -fsS http://127.0.0.1:5500/health
```

## Notes

- Offline Turkish (EMA) works with no outbound network after the image is built; English needs Edge.
- IVR speech is split into sentences and synthesized while the previous sentence plays; results are cached on disk.
- Neural synthesis runs on the PBX CPU: plan 2 vCPU / 4 GB RAM. Under memory pressure the model is swapped out and fresh sentences become slow.
- Edge needs outbound HTTPS when selected (or when `auto` reaches Microsoft).
- Output is always 8 kHz mono WAV for Asterisk.
- Optional standalone image remains at `docker/tts/` for debugging only.
