#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

# Load v2 backend .env
if [[ -f ../backend/.env ]]; then
  export $(grep -v '^#' ../backend/.env | grep -v '^$' | xargs)
fi

if [[ -z "${JLC_APP_ID:-}" || -z "${JLC_ACCESS_KEY:-}" || -z "${JLC_SECRET_KEY:-}" ]]; then
  echo "ERROR: Missing JLC_APP_ID/JLC_ACCESS_KEY/JLC_SECRET_KEY in backend/.env" >&2
  exit 1
fi

PORT=${JLC_PORT:-8089}
echo "Starting JLC sidecar on port $PORT..."
exec java -cp jlc-sidecar.jar:libs/* com.example.jlcsidecar.JlcSidecarApplication
