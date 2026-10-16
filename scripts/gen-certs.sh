#!/bin/sh
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)/docker/nginx/certs"
mkdir -p "$DIR"
if [ -f "$DIR/cert.pem" ] && [ -f "$DIR/key.pem" ]; then
  echo "Certificates already exist"
  exit 0
fi
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout "$DIR/key.pem" \
  -out "$DIR/cert.pem" \
  -days 3650 \
  -subj "/CN=localhost"
echo "Generated self-signed certs in $DIR"
