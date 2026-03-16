#!/bin/bash
set -e

# Render provides $PORT (default 10000). Presenton's nginx listens on 80.
# Patch all nginx configs to use $PORT instead of 80.
PORT="${PORT:-80}"

if [ "$PORT" != "80" ]; then
  echo "[start-render] Remapping nginx from port 80 → $PORT"
  find /etc/nginx -type f -name "*.conf" -exec sed -i "s/listen 80/listen $PORT/g" {} + 2>/dev/null || true
  find /etc/nginx -type f -name "default" -exec sed -i "s/listen 80/listen $PORT/g" {} + 2>/dev/null || true
fi

echo "[start-render] Starting Presenton on port $PORT"
exec node /app/start.js
