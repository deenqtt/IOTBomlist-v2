#!/usr/bin/env bash
# Start all v2 services for local development
set -euo pipefail
cd "$(dirname "$0")"

cleanup() {
  echo ""
  echo "Stopping all services..."
  kill "$SIDECAR_PID" "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# 1. JLC Sidecar (port 8089)
echo "[1/3] Starting JLC sidecar..."
chmod +x jlc-sidecar/run.sh
bash jlc-sidecar/run.sh &
SIDECAR_PID=$!

# 2. Backend (port 8001)
echo "[2/3] Starting backend..."
cd backend
npm run dev &
BACKEND_PID=$!
cd ..

# 3. Frontend (port 3000)
echo "[3/3] Starting frontend..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "All services running:"
echo "  Frontend  → http://localhost:3000"
echo "  Backend   → http://localhost:8001"
echo "  Sidecar   → http://localhost:8089"
echo ""
echo "Press Ctrl+C to stop all."

wait
