#!/bin/bash
# docker-entrypoint.sh
#
# Runs BEFORE gunicorn. If the startup check fails, this script exits with
# code 1 immediately — Render sees a failed deploy, stops retrying workers,
# and shows the missing-var error in the deploy log.
#
# Usage (set in Dockerfile):
#   ENTRYPOINT ["/docker-entrypoint.sh"]
#   CMD ["gunicorn", ...]

set -e

echo "[entrypoint] Running startup environment check..."
python startup_check.py
echo "[entrypoint] Check passed. Starting server..."

# Hand off to CMD (gunicorn)
exec "$@"
