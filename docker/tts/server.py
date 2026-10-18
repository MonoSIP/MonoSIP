#!/usr/bin/env python3
"""DSip TTS HTTP API — Edge Neural (high quality TR/EN) with Piper offline fallback."""

from __future__ import annotations

import audioop
import asyncio
import io
import logging
import os
import subprocess
import tempfile
import wave
from pathlib import Path

from flask import Flask, jsonify, request, send_file

VOICES_DIR = Path(os.environ.get("VOICES_DIR", "/voices"))
HOST = os.environ.get("TTS_HOST", "0.0.0.0")
PORT = int(os.environ.get("TTS_PORT", "5500"))
# auto | edge | piper — auto prefers Edge Neural, falls back to Piper
ENGINE = (os.environ.get("TTS_ENGINE") or "auto").strip().lower()

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

PIPER_MAP = {
    # EN: lessac-high (offline). TR: only medium exists upstream (fettah).
    "en": ("en_US-lessac-high", "en_US-lessac-high"),
    "en-US": ("en_US-lessac-high", "en_US-lessac-high"),
    "en_us": ("en_US-lessac-high", "en_US-lessac-high"),
    "tr": ("tr_TR-fettah-medium", "tr_TR-fettah-medium"),
    "tr-TR": ("tr_TR-fettah-medium", "tr_TR-fettah-medium"),
    "tr_tr": ("tr_TR-fettah-medium", "tr_TR-fettah-medium"),
}

_piper_cache: dict[str, object] = {}
log = logging.getLogger("tts")
logging.basicConfig(level=logging.INFO)

app = Flask(__name__)


def lang_key(lang: str) -> str:
    key = (lang or "en").strip()
    if key in EDGE_VOICES or key in PIPER_MAP:
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


def load_piper(lang: str):
    from piper import PiperVoice

    key = lang_key(lang)
    entry = PIPER_MAP.get(key) or PIPER_MAP["en"]
    voice_id, stem = entry
    if voice_id in _piper_cache:
        return voice_id, _piper_cache[voice_id]
    onnx = VOICES_DIR / f"{stem}.onnx"
    cfg = VOICES_DIR / f"{stem}.onnx.json"
    if not onnx.is_file():
        raise FileNotFoundError(f"Piper voice missing: {onnx}")
    voice = PiperVoice.load(str(onnx), config_path=str(cfg) if cfg.is_file() else None)
    _piper_cache[voice_id] = voice
    return voice_id, voice


def synthesize_piper(text: str, lang: str, length_scale: float) -> tuple[bytes, str]:
    voice_id, voice = load_piper(lang)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        try:
            voice.synthesize(text, wf, length_scale=length_scale)
        except TypeError:
            try:
                voice.synthesize(text, wf)
            except TypeError:
                sample_rate = getattr(getattr(voice, "config", None), "sample_rate", 22050)
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(sample_rate)
                for chunk in voice.synthesize(text):
                    wf.writeframes(chunk.audio_int16_bytes)
    return resample_wav_8k_mono(buf.getvalue()), voice_id


def synthesize_wav(text: str, lang: str, length_scale: float = 1.05) -> tuple[bytes, str, str]:
    """Returns (wav8k, engine_name, voice_id)."""
    text = text.strip()
    prefer_edge = ENGINE in ("auto", "edge")
    prefer_piper = ENGINE in ("auto", "piper")

    if prefer_edge and ENGINE != "piper":
        try:
            wav, voice = synthesize_edge(text, lang, length_scale)
            return wav, "edge", voice
        except Exception as e:  # noqa: BLE001
            log.warning("edge-tts failed (%s); falling back to piper", e)
            if ENGINE == "edge":
                raise

    if prefer_piper or ENGINE == "piper":
        wav, voice = synthesize_piper(text, lang, length_scale)
        return wav, "piper", voice

    raise RuntimeError("No TTS engine available")


@app.get("/health")
def health():
    piper_ok = all(
        (VOICES_DIR / f"{stem}.onnx").is_file() for _, stem in (PIPER_MAP["en"], PIPER_MAP["tr"])
    )
    return jsonify(
        {
            "ok": True,
            "engine": ENGINE,
            "preferred": "edge-tts (Microsoft Neural) with Piper fallback"
            if ENGINE == "auto"
            else ENGINE,
            "piperReady": piper_ok,
            "voices": {
                "edge": {"tr": EDGE_VOICES["tr"], "en": EDGE_VOICES["en"]},
                "piper": {"tr": PIPER_MAP["tr"][0], "en": PIPER_MAP["en"][0]},
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
                "language": "en",
                "engine": "edge",
                "id": EDGE_VOICES["en"],
                "name": "Jenny Neural (US English)",
                "quality": "high",
            },
            {
                "language": "tr",
                "engine": "piper",
                "id": "tr_TR-fettah-medium",
                "name": "Fettah (offline fallback)",
                "quality": "medium",
            },
            {
                "language": "en",
                "engine": "piper",
                "id": "en_US-lessac-high",
                "name": "Lessac high (offline fallback)",
                "quality": "high",
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
    # Optional gender → male/female neural voice, or explicit voice id
    gender = (body.get("gender") or "").strip().lower()
    voice_override = (body.get("voice") or "").strip()
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
        wav, engine, voice = synthesize_wav(text, str(lang), length_scale=length_scale)
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
