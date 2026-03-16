#!/bin/bash
set -e

PORT="${PORT:-80}"

if [ "$PORT" != "80" ]; then
  echo "[start-render] Remapping nginx from port 80 → $PORT"
  find /etc/nginx -type f \( -name "*.conf" -o -name "default" \) \
    -exec sed -i -E "s/listen\s+80\b/listen $PORT/g" {} + 2>/dev/null || true
  for dir in /etc/nginx/sites-available /etc/nginx/sites-enabled /etc/nginx/conf.d; do
    if [ -d "$dir" ]; then
      find "$dir" -type f -exec sed -i -E "s/listen\s+80\b/listen $PORT/g" {} + 2>/dev/null || true
    fi
  done
  echo "[start-render] Nginx config patched"
fi

# Start the app in background so we can kill Ollama after
echo "[start-render] Starting Presenton on port $PORT"
node /app/start.js &
APP_PID=$!

# Wait for services to boot, then kill Ollama to save ~150MB RAM
# (we use OpenAI, not local LLMs — Ollama is unnecessary)
sleep 10
echo "[start-render] Killing Ollama to save memory (using OpenAI instead)"
pkill -f ollama 2>/dev/null || true
killall ollama 2>/dev/null || true

# Stay alive — follow the main process
wait $APP_PID
