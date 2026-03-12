#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env.local"

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

CONTAINER_NAME="${PRESENTON_CONTAINER_NAME:-presenton-codex}"
PRESENTON_PORT="${PRESENTON_PORT:-5050}"
PRESENTON_LLM="${PRESENTON_LLM:-openai}"
PRESENTON_OPENAI_MODEL="${PRESENTON_OPENAI_MODEL:-gpt-4.1}"
PRESENTON_DISABLE_IMAGE_GENERATION="${PRESENTON_DISABLE_IMAGE_GENERATION:-true}"

mkdir -p "${ROOT_DIR}/app_data"

if docker ps -a --format '{{.Names}}' | grep -qx "${CONTAINER_NAME}"; then
  docker rm -f "${CONTAINER_NAME}" >/dev/null
fi

docker run -d \
  --platform linux/amd64 \
  --name "${CONTAINER_NAME}" \
  -p "${PRESENTON_PORT}:80" \
  -v "${ROOT_DIR}/app_data:/app_data" \
  -e CAN_CHANGE_KEYS="false" \
  -e LLM="${PRESENTON_LLM}" \
  -e OPENAI_API_KEY="${OPENAI_API_KEY:-}" \
  -e OPENAI_MODEL="${PRESENTON_OPENAI_MODEL}" \
  -e DISABLE_IMAGE_GENERATION="${PRESENTON_DISABLE_IMAGE_GENERATION}" \
  ghcr.io/presenton/presenton:latest

echo "Presenton started on http://localhost:${PRESENTON_PORT}"
