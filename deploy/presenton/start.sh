#!/bin/bash
set -e

PORT="${PORT:-80}"

if [ "$PORT" != "80" ]; then
  echo "[start-render] Remapping nginx from port 80 → $PORT"
  # Broadly replace any 'listen 80' pattern in all nginx config files
  find /etc/nginx -type f \( -name "*.conf" -o -name "default" \) \
    -exec sed -i -E "s/listen\s+80\b/listen $PORT/g" {} + 2>/dev/null || true
  # Also check sites-available / sites-enabled
  for dir in /etc/nginx/sites-available /etc/nginx/sites-enabled /etc/nginx/conf.d; do
    if [ -d "$dir" ]; then
      find "$dir" -type f -exec sed -i -E "s/listen\s+80\b/listen $PORT/g" {} + 2>/dev/null || true
    fi
  done
  echo "[start-render] Nginx config patched. Dumping listen directives:"
  grep -r "listen" /etc/nginx/ 2>/dev/null || true
fi

echo "[start-render] Starting Presenton on port $PORT"
exec node /app/start.js
