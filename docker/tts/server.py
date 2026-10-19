#!/usr/bin/env python3
"""DSip TTS HTTP API — Edge Neural (high quality TR/EN) with EMA Lightning (offline
Turkish neural) and Kokoro-82M (offline English neural)."""

from __future__ import annotations

import asyncio
import importlib.util
import io
import logging
import os
import subprocess
import tempfile
import wave
from pathlib import Path

try:
    import audioop  # stdlib through Python 3.12
except ModuleNotFoundError:  # Python 3.13+
    import audioop_lts as audioop  # type: ignore[no-redef]

from flask import Flask, jsonify, request, send_file

HOST = os.environ.get("TTS_HOST", "0.0.0.0")
PORT = int(os.environ.get("TTS_PORT", "5500"))
# auto | edge | ema | kokoro — auto prefers Edge Neural, then EMA (TR) / Kokoro (EN).
ENGINE = (os.environ.get("TTS_ENGINE") or "auto").strip().lower()
# EMA Lightning: tiny (~8.6M param) offline neural Turkish TTS, native 8 kHz output.
EMA_ENABLED = (os.environ.get("TTS_ENABLE_EMA") or "1").strip().lower() not in ("0", "false", "no")
EMA_VOICE_ID = "ema-lightning"
# Kokoro-82M ONNX: high-quality offline English neural TTS (~80 MB int8).
KOKORO_ENABLED = (os.environ.get("TTS_ENABLE_KOKORO") or "1").strip().lower() not in (
    "0",
    "false",
    "no",
)
KOKORO_VOICE_ID = "kokoro"
KOKORO_DIR = Path(os.environ.get("KOKORO_DIR", "/models/kokoro"))
KOKORO_SPEAKER = (os.environ.get("TTS_KOKORO_VOICE") or "af_heart").strip() or "af_heart"

EDGE_VOICES = {
    "en": os.environ.get("TTS_EDGE_VOICE_EN", "en-US-JennyNeural"),
    "en-US": os.environ.get("TTS_EDGE_VOICE_EN", "en-US-JennyNeural"),
    "en_us": os.environ.get("TTS_EDGE_VOICE_EN", "en-US-JennyNeural"),
    "tr": os.environ.get("TTS_EDGE_VOICE_TR", "tr-TR-EmelNeural"),
    "tr-TR": os.environ.get("TTS_EDGE_VOICE_TR", "tr-TR-EmelNeural"),
    "tr_tr": os.environ.get("TTS_EDGE_VOICE_TR", "tr-TR-EmelNeural"),
}

EDGE_VOICES_MALE = {
    "en": os.environ.get("TTS_EDGE_VOICE_EN_MALE", "en-US-GuyNeural"),
    "en-US": os.environ.get("TTS_EDGE_VOICE_EN_MALE", "en-US-GuyNeural"),
    "en_us": os.environ.get("TTS_EDGE_VOICE_EN_MALE", "en-US-GuyNeural"),
    "tr": os.environ.get("TTS_EDGE_VOICE_TR_MALE", "tr-TR-AhmetNeural"),
    "tr-TR": os.environ.get("TTS_EDGE_VOICE_TR_MALE", "tr-TR-AhmetNeural"),
    "tr_tr": os.environ.get("TTS_EDGE_VOICE_TR_MALE", "tr-TR-AhmetNeural"),
}

_ema_cache: dict[str, object] = {}
_kokoro_cache: dict[str, object] = {}
log = logging.getLogger("tts")
logging.basicConfig(level=logging.INFO)

app = Flask(__name__)


def lang_key(lang: str) -> str:
    key = (lang or "en").strip()
    if key in EDGE_VOICES:
        return key
    base = key.split("-")[0].split("_")[0].lower()
    return base if base in ("en", "tr") else "en"


def resample_wav_8k_mono(wav_bytes: bytes) -> bytes:
    """Asterisk native WAV playback expects 8 kHz mono 16-bit PCM."""
    with wave.open(io.BytesIO(wav_bytes), "rb") as r:
        nch, sw, rate, nframes = r.getnchannels(), r.getsampwidth(), r.getframerate(), r.getnframes()
        frames = r.readframes(nframes)
    if rate == 8000 and nch == 1 and sw == 2:
        return wav_bytes
    if nch == 2:
        frames = audioop.tomono(frames, sw, 1, 1)
        nch = 1
    if sw != 2:
        frames = audioop.lin2lin(frames, sw, 2)
        sw = 2
    if rate != 8000:
        frames, _ = audioop.ratecv(frames, sw, 1, rate, 8000, None)
    out = io.BytesIO()
    with wave.open(out, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(8000)
        w.writeframes(frames)
    return out.getvalue()


def mp3_to_wav_8k(mp3_bytes: bytes) -> bytes:
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tin:
        tin.write(mp3_bytes)
        tin.flush()
        in_path = tin.name
    out_path = in_path + ".wav"
    try:
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i",
                in_path,
                "-ac",
                "1",
                "-ar",
                "8000",
                "-c:a",
                "pcm_s16le",
                out_path,
            ],
            check=True,
            capture_output=True,
        )
        with open(out_path, "rb") as f:
            return f.read()
    finally:
        for p in (in_path, out_path):
            try:
                os.unlink(p)
            except OSError:
                pass


def length_to_edge_rate(length_scale: float) -> str:
    # length_scale > 1 = slower speech → negative rate %
    pct = int(round((1.0 - length_scale) * 100))
    pct = max(-40, min(40, pct))
    return f"{pct:+d}%"


async def synthesize_edge_async(text: str, lang: str, length_scale: float) -> tuple[bytes, str]:
    import edge_tts

    key = lang_key(lang)
    voice = EDGE_VOICES.get(key) or EDGE_VOICES["tr" if key.startswith("tr") else "en"]
    rate = length_to_edge_rate(length_scale)
    communicate = edge_tts.Communicate(text, voice, rate=rate)
    buf = io.BytesIO()
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            buf.write(chunk["data"])
    mp3 = buf.getvalue()
    if len(mp3) < 64:
        raise RuntimeError("edge-tts returned empty audio")
    return mp3_to_wav_8k(mp3), voice


def synthesize_edge(text: str, lang: str, length_scale: float) -> tuple[bytes, str]:
    return asyncio.run(synthesize_edge_async(text, lang, length_scale))


def ema_available() -> bool:
    """Cheap check (no torch import) that EMA Lightning is installed."""
    return EMA_ENABLED and importlib.util.find_spec("ema_lightning") is not None


def load_ema():
    if "ema" in _ema_cache:
        return _ema_cache["ema"]
    from ema_lightning import EMA  # heavy: pulls in torch + downloads ~34 MB weights

    tts = EMA()
    _ema_cache["ema"] = tts
    return tts


def synthesize_ema(text: str, length_scale: float) -> tuple[bytes, str]:
    """EMA Lightning → 8 kHz mono 16-bit PCM WAV (Asterisk native). Turkish only."""
    import numpy as np

    tts = load_ema()
    # length_scale > 1 = slower; EMA speed > 1 = faster → invert and clamp to its range.
    speed = max(0.25, min(4.0, 1.0 / max(0.1, length_scale)))
    speech = tts.say(text, sample_rate=8000, speed=speed)
    audio = np.asarray(speech.audio, dtype=np.float32)
    pcm = (np.clip(audio, -1.0, 1.0) * 32767.0).astype("<i2").tobytes()
    out = io.BytesIO()
    with wave.open(out, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(8000)
        w.writeframes(pcm)
    return out.getvalue(), EMA_VOICE_ID


def kokoro_available() -> bool:
    if not KOKORO_ENABLED:
        return False
    if importlib.util.find_spec("kokoro_onnx") is None:
        return False
    onnx = KOKORO_DIR / "kokoro-v1.0.int8.onnx"
    voices = KOKORO_DIR / "voices-v1.0.bin"
    if not onnx.is_file():
        onnx = KOKORO_DIR / "kokoro-v1.0.onnx"
    return onnx.is_file() and voices.is_file()


def load_kokoro():
    if "kokoro" in _kokoro_cache:
        return _kokoro_cache["kokoro"]
    from kokoro_onnx import Kokoro

    onnx = KOKORO_DIR / "kokoro-v1.0.int8.onnx"
    if not onnx.is_file():
        onnx = KOKORO_DIR / "kokoro-v1.0.onnx"
    voices = KOKORO_DIR / "voices-v1.0.bin"
    if not onnx.is_file() or not voices.is_file():
        raise FileNotFoundError(f"Kokoro model missing under {KOKORO_DIR}")
    tts = Kokoro(str(onnx), str(voices))
    _kokoro_cache["kokoro"] = tts
    return tts


def synthesize_kokoro(text: str, length_scale: float, speaker: str = "") -> tuple[bytes, str]:
    """Kokoro-82M ONNX → 8 kHz mono WAV. English (en-us)."""
    import numpy as np

    tts = load_kokoro()
    # length_scale > 1 = slower; Kokoro speed > 1 = faster.
    speed = max(0.5, min(2.0, 1.0 / max(0.1, length_scale)))
    voice_name = (speaker or KOKORO_SPEAKER).strip() or "af_heart"
    samples, sample_rate = tts.create(text, voice=voice_name, speed=speed, lang="en-us")
    audio = np.asarray(samples, dtype=np.float32)
    pcm = (np.clip(audio, -1.0, 1.0) * 32767.0).astype("<i2").tobytes()
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(int(sample_rate))
        w.writeframes(pcm)
    return resample_wav_8k_mono(buf.getvalue()), KOKORO_VOICE_ID


def synthesize_wav(
    text: str, lang: str, length_scale: float = 1.05, engine: str = ""
) -> tuple[bytes, str, str]:
    """Returns (wav8k, engine_name, voice_id).

    `engine` (per request) overrides the server default: edge | ema | kokoro.
    EMA is Turkish-only; Kokoro is English-only.
    """
    text = text.strip()
    want = (engine or ENGINE or "auto").strip().lower()
    is_tr = lang_key(lang).startswith("tr")
    is_en = not is_tr  # current API only serves en/tr

    if want == "piper":
        raise RuntimeError("Piper TTS has been removed; use edge, ema, or kokoro")

    # Explicit per-request engine selection.
    if want == "ema":
        if not is_tr:
            raise RuntimeError("EMA Lightning supports Turkish only")
        wav, voice = synthesize_ema(text, length_scale)
        return wav, "ema", voice
    if want == "kokoro":
        if not is_en:
            raise RuntimeError("Kokoro supports English only")
        wav, voice = synthesize_kokoro(text, length_scale)
        return wav, "kokoro", voice
    if want == "edge":
        wav, voice = synthesize_edge(text, lang, length_scale)
        return wav, "edge", voice

    # auto: Edge Neural (online) → EMA (TR) / Kokoro (EN) offline neural.
    try:
        wav, voice = synthesize_edge(text, lang, length_scale)
        return wav, "edge", voice
    except Exception as e:  # noqa: BLE001
        log.warning("edge-tts failed (%s); trying offline engines", e)

    if is_tr and ema_available():
        try:
            wav, voice = synthesize_ema(text, length_scale)
            return wav, "ema", voice
        except Exception as e:  # noqa: BLE001
            log.warning("EMA Lightning failed (%s)", e)
            raise RuntimeError(f"TTS failed: edge and EMA unavailable ({e})") from e

    if is_en and kokoro_available():
        try:
            wav, voice = synthesize_kokoro(text, length_scale)
            return wav, "kokoro", voice
        except Exception as e:  # noqa: BLE001
            log.warning("Kokoro failed (%s)", e)
            raise RuntimeError(f"TTS failed: edge and Kokoro unavailable ({e})") from e

    engine_hint = "EMA" if is_tr else "Kokoro"
    raise RuntimeError(f"TTS failed: edge unavailable and {engine_hint} not ready")


@app.get("/health")
def health():
    return jsonify(
        {
            "ok": True,
            "engine": ENGINE,
            "preferred": "edge-tts → EMA (TR) / Kokoro (EN)"
            if ENGINE == "auto"
            else ENGINE,
            "emaReady": ema_available(),
            "kokoroReady": kokoro_available(),
            "voices": {
                "edge": {"tr": EDGE_VOICES["tr"], "en": EDGE_VOICES["en"]},
                "ema": {"tr": EMA_VOICE_ID},
                "kokoro": {"en": KOKORO_VOICE_ID, "speaker": KOKORO_SPEAKER},
            },
        }
    )


@app.get("/voices")
def voices():
    return jsonify(
        [
            {
                "language": "tr",
                "engine": "edge",
                "id": EDGE_VOICES["tr"],
                "name": "Emel Neural (Turkish) — recommended",
                "quality": "high",
            },
            {
                "language": "tr",
                "engine": "edge",
                "id": "tr-TR-AhmetNeural",
                "name": "Ahmet Neural (Turkish male)",
                "quality": "high",
            },
            {
                "language": "tr",
                "engine": "ema",
                "id": EMA_VOICE_ID,
                "name": "EMA Lightning (Turkish, offline neural)",
                "quality": "high",
                "offline": True,
            },
            {
                "language": "en",
                "engine": "edge",
                "id": EDGE_VOICES["en"],
                "name": "Jenny Neural (US English)",
                "quality": "high",
            },
            {
                "language": "en",
                "engine": "kokoro",
                "id": KOKORO_VOICE_ID,
                "name": f"Kokoro-82M ({KOKORO_SPEAKER}, offline neural English)",
                "quality": "high",
                "offline": True,
            },
        ]
    )


@app.post("/synthesize")
def synthesize():
    body = request.get_json(silent=True) or {}
    text = (body.get("text") or request.form.get("text") or "").strip()
    if not text:
        return jsonify({"error": "text required"}), 400
    if len(text) > 2000:
        return jsonify({"error": "text too long (max 2000)"}), 400
    lang = body.get("language") or body.get("lang") or "en"
    try:
        length_scale = float(body.get("lengthScale") or body.get("length_scale") or 1.05)
    except (TypeError, ValueError):
        length_scale = 1.05
    length_scale = max(0.7, min(1.6, length_scale))
    # Optional engine override (edge | ema | kokoro) and gender/voice selection.
    engine_req = (body.get("engine") or "").strip().lower()
    gender = (body.get("gender") or "").strip().lower()
    voice_override = (body.get("voice") or "").strip()
    # A voice of "ema"/"ema-lightning" selects the EMA Lightning engine.
    if voice_override.lower() in ("ema", EMA_VOICE_ID) or gender in ("ema", EMA_VOICE_ID):
        engine_req = "ema"
        voice_override = ""
    # A voice of "kokoro" selects the Kokoro-82M English engine.
    if voice_override.lower() in ("kokoro", KOKORO_VOICE_ID) or gender in (
        "kokoro",
        KOKORO_VOICE_ID,
    ):
        engine_req = "kokoro"
        voice_override = ""
    if not voice_override and gender in ("male", "erkek", "m"):
        key = lang_key(str(lang))
        voice_override = EDGE_VOICES_MALE.get(key) or EDGE_VOICES_MALE.get(
            key.split("-")[0], EDGE_VOICES_MALE["en"]
        )
    if voice_override and voice_override.startswith("tr-"):
        EDGE_VOICES["tr"] = voice_override
        EDGE_VOICES["tr-TR"] = voice_override
        EDGE_VOICES["tr_tr"] = voice_override
    if voice_override and voice_override.startswith("en-"):
        EDGE_VOICES["en"] = voice_override
        EDGE_VOICES["en-US"] = voice_override
        EDGE_VOICES["en_us"] = voice_override
    try:
        wav, engine, voice = synthesize_wav(
            text, str(lang), length_scale=length_scale, engine=engine_req
        )
    except FileNotFoundError as e:
        return jsonify({"error": str(e)}), 503
    except Exception as e:  # noqa: BLE001
        log.exception("synthesize failed")
        return jsonify({"error": str(e)}), 500
    log.info("tts ok engine=%s voice=%s bytes=%s chars=%s", engine, voice, len(wav), len(text))
    resp = send_file(
        io.BytesIO(wav),
        mimetype="audio/wav",
        as_attachment=False,
        download_name="speech.wav",
    )
    resp.headers["X-TTS-Engine"] = engine
    resp.headers["X-TTS-Voice"] = voice
    return resp


if __name__ == "__main__":
    app.run(host=HOST, port=PORT, threaded=True)
