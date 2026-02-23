#!/usr/bin/env bash
# FileGeek backend starter — kills stale processes and runs the FastAPI server.
# Usage:  cd backend && ./start.sh
set -euo pipefail

PORT=5001

# ── 1. Kill anything already bound to the port ──────────────────────────────
PIDS=$(lsof -ti :"$PORT" 2>/dev/null || true)
if [ -n "$PIDS" ]; then
  echo "Killing stale process(es) on port $PORT: $PIDS"
  echo "$PIDS" | xargs kill -9
  sleep 0.5
fi

# ── 2. Activate virtual environment ─────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="$SCRIPT_DIR/venv"
if [ -d "$VENV" ]; then
  # shellcheck disable=SC1091
  source "$VENV/bin/activate"
else
  echo "ERROR: venv not found at $VENV — run: python -m venv venv && pip install -r ../requirements.txt"
  exit 1
fi

# ── 3. Start FastAPI (main.py), NOT the legacy Flask app.py ─────────────────
echo "Starting FileGeek FastAPI server on port $PORT..."
exec python "$SCRIPT_DIR/main.py"
