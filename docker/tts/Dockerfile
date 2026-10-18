FROM python:3.11-slim-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
# Install the CPU-only PyTorch first (the default Linux wheel bundles ~1.5 GB of CUDA
# that EMA Lightning does not need), then the rest. EMA runs ~6x real time on CPU.
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
  && pip install --no-cache-dir -r requirements.txt

# EMA Lightning weights (~34 MB) download from Hugging Face on first use. Pre-fetch
# them at build so the image works offline. HF_HOME keeps the cache in a known layer.
ENV HF_HOME=/models/hf
RUN mkdir -p /models/hf \
  && python -c "from ema_lightning import EMA; EMA().say('Merhaba', sample_rate=8000)" \
  && echo "EMA Lightning weights cached"

# Piper offline voices: prefer vendored docker/tts/voices (from fetch-voices.sh),
# otherwise download at image build so remote deploys still get models.
ENV VOICES_DIR=/voices
COPY voices/ /tmp/voices/
RUN mkdir -p /voices \
  && if [ -f /tmp/voices/en_US-lessac-high.onnx ] && [ -f /tmp/voices/tr_TR-fettah-medium.onnx ]; then \
       cp -a /tmp/voices/. /voices/; \
       echo "Using vendored Piper voices"; \
     else \
       echo "Vendored voices missing — downloading from Hugging Face"; \
       cd /voices \
       && curl -fsSL -o en_US-lessac-high.onnx \
         "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/high/en_US-lessac-high.onnx" \
       && curl -fsSL -o en_US-lessac-high.onnx.json \
         "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/high/en_US-lessac-high.onnx.json" \
       && curl -fsSL -o tr_TR-fettah-medium.onnx \
         "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/tr/tr_TR/fettah/medium/tr_TR-fettah-medium.onnx" \
       && curl -fsSL -o tr_TR-fettah-medium.onnx.json \
         "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/tr/tr_TR/fettah/medium/tr_TR-fettah-medium.onnx.json"; \
     fi \
  && rm -rf /tmp/voices \
  && ls -lah /voices

COPY server.py .

ENV TTS_HOST=0.0.0.0
ENV TTS_PORT=5500
# auto = Edge Neural (best TR/EN) → EMA Lightning (TR, offline) → Piper offline
ENV TTS_ENGINE=auto
ENV TTS_ENABLE_EMA=1
ENV TTS_EDGE_VOICE_TR=tr-TR-EmelNeural
ENV TTS_EDGE_VOICE_EN=en-US-JennyNeural
EXPOSE 5500

CMD ["gunicorn", "-b", "0.0.0.0:5500", "-w", "1", "--timeout", "120", "server:app"]
