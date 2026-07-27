#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"

# Deliberately do not source .env files. A shell-sourced configuration file is
# executable code, which turns a local credential file into an arbitrary-code
# execution boundary. The pnpm wrapper parses .env.local with dotenv before
# launching this helper; direct invocations still require exported variables.

: "${PRESENTON_IMAGE:?Set PRESENTON_IMAGE to an immutable image reference ending in @sha256:<digest>.}"
: "${PRESENTON_AUTH_USERNAME:?PRESENTON_AUTH_USERNAME is required for Presenton HTTP Basic auth.}"
: "${PRESENTON_AUTH_PASSWORD:?PRESENTON_AUTH_PASSWORD is required for Presenton HTTP Basic auth.}"

if [[ ! "${PRESENTON_IMAGE}" =~ @sha256:[0-9a-f]{64}$ ]]; then
  echo "PRESENTON_IMAGE must end in @sha256 followed by exactly 64 lowercase hexadecimal characters." >&2
  exit 1
fi

CONTAINER_NAME="${PRESENTON_CONTAINER_NAME:-bestdecks-presenton-local}"
NETWORK_NAME="${PRESENTON_NETWORK_NAME:-bestdecks-presenton-render-only}"
PRESENTON_PORT="${PRESENTON_PORT:-5050}"
NETWORK_LABEL_KEY="com.bestdecks.network-purpose"
NETWORK_LABEL_VALUE="presenton-render-only"
CONTAINER_LABEL_KEY="com.bestdecks.container-purpose"
CONTAINER_LABEL_VALUE="presenton-render-only"
APP_DATA_DIR="${ROOT_DIR}/app_data"

if [[ ! "${PRESENTON_PORT}" =~ ^[1-9][0-9]{0,4}$ ]] \
  || (( 10#${PRESENTON_PORT} > 65535 )); then
  echo "PRESENTON_PORT must be an integer between 1 and 65535." >&2
  exit 1
fi

if [[ "${PRESENTON_AUTH_USERNAME}" == *:* ]]; then
  echo "PRESENTON_AUTH_USERNAME cannot contain a colon when used for HTTP Basic auth." >&2
  exit 1
fi

if [[ "${PRESENTON_AUTH_USERNAME}${PRESENTON_AUTH_PASSWORD}" == *$'\n'* ]] \
  || [[ "${PRESENTON_AUTH_USERNAME}${PRESENTON_AUTH_PASSWORD}" == *$'\r'* ]]; then
  echo "Presenton Basic-auth credentials cannot contain newline characters." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required to start the local render-only service." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "The Docker daemon is unavailable. Start Docker and retry." >&2
  exit 1
fi

if [[ -L "${APP_DATA_DIR}" ]] || [[ -e "${APP_DATA_DIR}" && ! -d "${APP_DATA_DIR}" ]]; then
  echo "app_data must be a real directory, not a symlink or another file type." >&2
  exit 1
fi
mkdir -p "${APP_DATA_DIR}"
chmod 700 "${APP_DATA_DIR}"

if docker network inspect "${NETWORK_NAME}" >/dev/null 2>&1; then
  network_internal="$(docker network inspect --format '{{.Internal}}' "${NETWORK_NAME}")"
  network_driver="$(docker network inspect --format '{{.Driver}}' "${NETWORK_NAME}")"
  network_label="$(docker network inspect --format '{{index .Labels "com.bestdecks.network-purpose"}}' "${NETWORK_NAME}")"
  if [[ "${network_internal}" != "true" ]] \
    || [[ "${network_driver}" != "bridge" ]] \
    || [[ "${network_label}" != "${NETWORK_LABEL_VALUE}" ]]; then
    echo "Existing Docker network is not the dedicated internal render-only network." >&2
    echo "Preserve it for review and choose a new PRESENTON_NETWORK_NAME." >&2
    exit 1
  fi
else
  if ! docker network create \
    --driver bridge \
    --internal \
    --label "${NETWORK_LABEL_KEY}=${NETWORK_LABEL_VALUE}" \
    "${NETWORK_NAME}" >/dev/null; then
    echo "Could not create the dedicated internal Presenton network." >&2
    exit 1
  fi
fi

# Re-inspect after creation too: a name collision or daemon policy must never
# silently turn this renderer into an Internet-reachable provider client.
if [[ "$(docker network inspect --format '{{.Internal}}' "${NETWORK_NAME}")" != "true" ]]; then
  echo "The Presenton network is not internal; refusing to start." >&2
  exit 1
fi

network_container_count="$(docker network inspect --format '{{len .Containers}}' "${NETWORK_NAME}")"

if docker container inspect "${CONTAINER_NAME}" >/dev/null 2>&1; then
  existing_image="$(docker container inspect --format '{{.Config.Image}}' "${CONTAINER_NAME}")"
  existing_networks="$(docker container inspect --format '{{range $name, $_ := .NetworkSettings.Networks}}{{println $name}}{{end}}' "${CONTAINER_NAME}")"
  existing_network_mode="$(docker container inspect --format '{{.HostConfig.NetworkMode}}' "${CONTAINER_NAME}")"
  existing_port_count="$(docker container inspect --format '{{len .HostConfig.PortBindings}}' "${CONTAINER_NAME}")"
  existing_port="$(docker container inspect --format '{{with (index .HostConfig.PortBindings "80/tcp")}}{{len .}}|{{(index . 0).HostIp}}|{{(index . 0).HostPort}}{{end}}' "${CONTAINER_NAME}")"
  existing_mounts="$(docker container inspect --format '{{range .Mounts}}{{printf "%s|%s|%t\n" .Source .Destination .RW}}{{end}}' "${CONTAINER_NAME}")"
  existing_env="$(docker container inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "${CONTAINER_NAME}")"
  existing_label="$(docker container inspect --format '{{index .Config.Labels "com.bestdecks.container-purpose"}}' "${CONTAINER_NAME}")"
  existing_cap_drop="$(docker container inspect --format '{{json .HostConfig.CapDrop}}' "${CONTAINER_NAME}")"
  existing_security_opt="$(docker container inspect --format '{{json .HostConfig.SecurityOpt}}' "${CONTAINER_NAME}")"
  existing_pids_limit="$(docker container inspect --format '{{.HostConfig.PidsLimit}}' "${CONTAINER_NAME}")"
  existing_privileged="$(docker container inspect --format '{{.HostConfig.Privileged}}' "${CONTAINER_NAME}")"
  existing_device_count="$(docker container inspect --format '{{len .HostConfig.Devices}}' "${CONTAINER_NAME}")"

  expected_envs=$'\nCAN_CHANGE_KEYS=true\nLLM=openai\nAUTH_USERNAME='"${PRESENTON_AUTH_USERNAME}"$'\nAUTH_PASSWORD='"${PRESENTON_AUTH_PASSWORD}"$'\nDISABLE_IMAGE_GENERATION=true\n'
  padded_existing_env=$'\n'"${existing_env}"$'\n'
  environment_matches="true"
  provider_setting_present="false"
  while IFS= read -r expected_env; do
    [[ -z "${expected_env}" ]] && continue
    if [[ "${padded_existing_env}" != *$'\n'"${expected_env}"$'\n'* ]]; then
      environment_matches="false"
      break
    fi
  done <<< "${expected_envs}"
  while IFS= read -r existing_env_entry; do
    case "${existing_env_entry}" in
      OPENAI_API_KEY=*|OPENAI_MODEL=*)
        provider_setting_present="true"
        break
        ;;
    esac
  done <<< "${existing_env}"

  mismatch="false"
  [[ "${existing_image}" == "${PRESENTON_IMAGE}" ]] || mismatch="true"
  [[ "${existing_networks}" == "${NETWORK_NAME}" ]] || mismatch="true"
  [[ "${existing_network_mode}" == "${NETWORK_NAME}" ]] || mismatch="true"
  [[ "${network_container_count}" == "1" ]] || mismatch="true"
  [[ "${existing_port_count}" == "1" ]] || mismatch="true"
  [[ "${existing_port}" == "1|127.0.0.1|${PRESENTON_PORT}" ]] || mismatch="true"
  [[ "${existing_mounts}" == "${APP_DATA_DIR}|/app_data|true" ]] || mismatch="true"
  [[ "${existing_label}" == "${CONTAINER_LABEL_VALUE}" ]] || mismatch="true"
  [[ "${existing_cap_drop}" == '["ALL"]' ]] || mismatch="true"
  [[ "${existing_security_opt}" == '["no-new-privileges:true"]' ]] || mismatch="true"
  [[ "${existing_pids_limit}" == "512" ]] || mismatch="true"
  [[ "${existing_privileged}" == "false" ]] || mismatch="true"
  [[ "${existing_device_count}" == "0" ]] || mismatch="true"
  [[ "${environment_matches}" == "true" ]] || mismatch="true"
  [[ "${provider_setting_present}" == "false" ]] || mismatch="true"

  if [[ "${mismatch}" == "true" ]]; then
    echo "Existing container does not match the requested digest, isolation, auth, or hardening contract." >&2
    echo "It will not be changed. Choose a unique PRESENTON_CONTAINER_NAME and PRESENTON_NETWORK_NAME." >&2
    exit 1
  fi

  docker start "${CONTAINER_NAME}" >/dev/null
else
  if [[ "${network_container_count}" != "0" ]]; then
    echo "The render-only network is already in use." >&2
    echo "Preserve it for review and choose a unique PRESENTON_NETWORK_NAME." >&2
    exit 1
  fi

  AUTH_USERNAME="${PRESENTON_AUTH_USERNAME}" \
  AUTH_PASSWORD="${PRESENTON_AUTH_PASSWORD}" \
  docker run -d \
    --platform linux/amd64 \
    --name "${CONTAINER_NAME}" \
    --network "${NETWORK_NAME}" \
    --label "${CONTAINER_LABEL_KEY}=${CONTAINER_LABEL_VALUE}" \
    --security-opt no-new-privileges:true \
    --cap-drop ALL \
    --pids-limit 512 \
    -p "127.0.0.1:${PRESENTON_PORT}:80" \
    --mount "type=bind,source=${APP_DATA_DIR},target=/app_data" \
    --tmpfs /tmp:rw,noexec,nosuid,nodev,size=134217728,mode=1770 \
    -e CAN_CHANGE_KEYS="true" \
    -e LLM="openai" \
    -e AUTH_USERNAME \
    -e AUTH_PASSWORD \
    -e DISABLE_IMAGE_GENERATION="true" \
    "${PRESENTON_IMAGE}" >/dev/null
fi

echo "Presenton is available only on http://127.0.0.1:${PRESENTON_PORT}"
