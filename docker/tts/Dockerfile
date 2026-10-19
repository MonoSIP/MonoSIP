FROM python:3.11-slim-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates ffmpeg espeak-ng \
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

# Kokoro-82M ONNX (English neural, ~80 MB int8) — offline counterpart to EMA for EN.
ENV KOKORO_DIR=/models/kokoro
RUN mkdir -p /models/kokoro \
  && curl -fsSL -o /models/kokoro/kokoro-v1.0.int8.onnx \
    "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.int8.onnx" \
  && curl -fsSL -o /models/kokoro/voices-v1.0.bin \
    "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin" \
  && python -c "from kokoro_onnx import Kokoro; k=Kokoro('/models/kokoro/kokoro-v1.0.int8.onnx','/models/kokoro/voices-v1.0.bin'); k.create('Hello from Kokoro.', voice='af_heart', speed=1.0, lang='en-us'); print('Kokoro ready')" \
  && echo "Kokoro ONNX weights cached"

COPY server.py .

ENV TTS_HOST=0.0.0.0
ENV TTS_PORT=5500
# auto = Edge Neural (best) → EMA (TR) / Kokoro (EN) offline neural
ENV TTS_ENGINE=auto
ENV TTS_ENABLE_EMA=1
ENV TTS_ENABLE_KOKORO=1
ENV TTS_EDGE_VOICE_TR=tr-TR-EmelNeural
ENV TTS_EDGE_VOICE_EN=en-US-JennyNeural
ENV TTS_KOKORO_VOICE=af_heart
EXPOSE 5500

CMD ["gunicorn", "-b", "0.0.0.0:5500", "-w", "1", "--timeout", "120", "server:app"]
