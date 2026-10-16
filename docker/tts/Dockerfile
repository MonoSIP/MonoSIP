FROM python:3.11-slim-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Piper voice models (EN + TR) from rhasspy/piper-voices
ENV VOICES_DIR=/voices
RUN mkdir -p /voices \
  && cd /voices \
  && curl -fsSL -o en_US-lessac-medium.onnx \
    "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx" \
  && curl -fsSL -o en_US-lessac-medium.onnx.json \
    "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json" \
  && curl -fsSL -o tr_TR-fettah-medium.onnx \
    "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/tr/tr_TR/fettah/medium/tr_TR-fettah-medium.onnx" \
  && curl -fsSL -o tr_TR-fettah-medium.onnx.json \
    "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/tr/tr_TR/fettah/medium/tr_TR-fettah-medium.onnx.json"

COPY server.py .

ENV TTS_HOST=0.0.0.0
ENV TTS_PORT=5500
# auto = Edge Neural (best TR/EN) with Piper offline fallback
ENV TTS_ENGINE=auto
ENV TTS_EDGE_VOICE_TR=tr-TR-EmelNeural
ENV TTS_EDGE_VOICE_EN=en-US-JennyNeural
EXPOSE 5500

CMD ["gunicorn", "-b", "0.0.0.0:5500", "-w", "1", "--timeout", "120", "server:app"]
