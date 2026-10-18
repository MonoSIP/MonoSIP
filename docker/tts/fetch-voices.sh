#!/usr/bin/env bash
# Download Piper offline voices into docker/tts/voices/ (vendored into the image on build).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
DEST="${ROOT}/voices"
BASE="https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0"
mkdir -p "$DEST"
cd "$DEST"

fetch() {
  local out="$1" url="$2"
  if [[ -f "$out" && -s "$out" ]]; then
    echo "keep $out"
    return 0
  fi
  echo "get  $out"
  curl -fsSL -o "$out" "$url"
}

fetch en_US-lessac-high.onnx \
  "${BASE}/en/en_US/lessac/high/en_US-lessac-high.onnx"
fetch en_US-lessac-high.onnx.json \
  "${BASE}/en/en_US/lessac/high/en_US-lessac-high.onnx.json"
fetch tr_TR-fettah-medium.onnx \
  "${BASE}/tr/tr_TR/fettah/medium/tr_TR-fettah-medium.onnx"
fetch tr_TR-fettah-medium.onnx.json \
  "${BASE}/tr/tr_TR/fettah/medium/tr_TR-fettah-medium.onnx.json"

ls -lah "$DEST"
echo "Done. Rebuild: docker compose build --no-cache tts && docker compose up -d tts"
