#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/root/betterbt}"
DEPLOY_BASE="${DEPLOY_BASE:-/var/www/betterbt}"
RELEASES_DIR="${DEPLOY_BASE}/releases"
CURRENT_LINK="${DEPLOY_BASE}/current"
KEEP_RELEASES="${KEEP_RELEASES:-5}"
PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-https://betterbt.vbjfr.xyz}"
TELEMETRY_PORT="${TELEMETRY_PORT:-4318}"
TELEMETRY_BIND_HOST="${TELEMETRY_BIND_HOST:-127.0.0.1}"
TELEMETRY_DATA_DIR="${TELEMETRY_DATA_DIR:-/var/lib/betterbt/telemetry}"
LEGACY_TELEMETRY_DATA_DIR="${LEGACY_TELEMETRY_DATA_DIR:-${APP_DIR}/backend/telemetry/data}"
EXPO_PUBLIC_TELEMETRY_ENDPOINT="${EXPO_PUBLIC_TELEMETRY_ENDPOINT:-${PUBLIC_BASE_URL%/}/telemetry/events}"
TELEMETRY_RAW_RETENTION_DAYS="${TELEMETRY_RAW_RETENTION_DAYS:-0}"
TELEMETRY_AGG_RETENTION_DAYS="${TELEMETRY_AGG_RETENTION_DAYS:-0}"
TELEMETRY_DASHBOARD_PATH="${TELEMETRY_DASHBOARD_PATH:-/telemetry/dev-dashboard}"
TELEMETRY_DASHBOARD_REALM="${TELEMETRY_DASHBOARD_REALM:-BetterBT Telemetry Admin}"
TELEMETRY_DASHBOARD_RATE_LIMIT_WINDOW_MS="${TELEMETRY_DASHBOARD_RATE_LIMIT_WINDOW_MS:-60000}"
TELEMETRY_DASHBOARD_RATE_LIMIT_MAX_REQUESTS="${TELEMETRY_DASHBOARD_RATE_LIMIT_MAX_REQUESTS:-120}"
TELEMETRY_DASHBOARD_AUTH_FAIL_WINDOW_MS="${TELEMETRY_DASHBOARD_AUTH_FAIL_WINDOW_MS:-600000}"
TELEMETRY_DASHBOARD_AUTH_FAIL_MAX_ATTEMPTS="${TELEMETRY_DASHBOARD_AUTH_FAIL_MAX_ATTEMPTS:-20}"
TELEMETRY_ENV_DIR="${TELEMETRY_ENV_DIR:-/etc/betterbt}"
TELEMETRY_ENV_FILE="${TELEMETRY_ENV_FILE:-${TELEMETRY_ENV_DIR}/telemetry.env}"

log() {
  printf '[deploy-web] %s\n' "$1"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

read_env_assignment_raw() {
  local key="$1"
  local file="$2"

  if [[ ! -f "${file}" ]]; then
    return 0
  fi

  sed -n "s/^${key}=//p" "${file}" | tail -n 1
}

load_existing_telemetry_env() {
  if [[ -f "${TELEMETRY_ENV_FILE}" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "${TELEMETRY_ENV_FILE}"
    set +a
    log "Loaded telemetry environment from ${TELEMETRY_ENV_FILE}"
  fi
}

write_telemetry_env() {
  install -d -m 750 "${TELEMETRY_ENV_DIR}"

  local existing_dashboard_user_raw
  local existing_dashboard_password_raw
  existing_dashboard_user_raw="$(read_env_assignment_raw TELEMETRY_DASHBOARD_USER "${TELEMETRY_ENV_FILE}")"
  existing_dashboard_password_raw="$(read_env_assignment_raw TELEMETRY_DASHBOARD_PASSWORD "${TELEMETRY_ENV_FILE}")"

  local preserve_dashboard_user_raw=""
  local preserve_dashboard_password_raw=""

  if [[ -z "${TELEMETRY_DASHBOARD_USER:-}" ]] && [[ -n "${existing_dashboard_user_raw}" ]]; then
    preserve_dashboard_user_raw="${existing_dashboard_user_raw}"
  fi

  if [[ -z "${TELEMETRY_DASHBOARD_PASSWORD:-}" ]] && [[ -n "${existing_dashboard_password_raw}" ]]; then
    preserve_dashboard_password_raw="${existing_dashboard_password_raw}"
  fi

  if [[ -z "${TELEMETRY_DASHBOARD_USER:-}" ]] && [[ -z "${preserve_dashboard_user_raw}" ]]; then
    TELEMETRY_DASHBOARD_USER="admin"
  fi

  if [[ -z "${TELEMETRY_DASHBOARD_PASSWORD:-}" ]] && [[ -z "${preserve_dashboard_password_raw}" ]]; then
    TELEMETRY_DASHBOARD_PASSWORD="$(openssl rand -base64 24 | tr -d '\n')"
    log "Generated telemetry dashboard password and wrote it to ${TELEMETRY_ENV_FILE}"
  fi

  {
    printf 'TELEMETRY_PORT=%q\n' "${TELEMETRY_PORT}"
    printf 'TELEMETRY_BIND_HOST=%q\n' "${TELEMETRY_BIND_HOST}"
    printf 'TELEMETRY_DATA_DIR=%q\n' "${TELEMETRY_DATA_DIR}"
    printf 'TELEMETRY_RAW_RETENTION_DAYS=%q\n' "${TELEMETRY_RAW_RETENTION_DAYS}"
    printf 'TELEMETRY_AGG_RETENTION_DAYS=%q\n' "${TELEMETRY_AGG_RETENTION_DAYS}"
    printf 'TELEMETRY_DASHBOARD_PATH=%q\n' "${TELEMETRY_DASHBOARD_PATH}"
    printf 'TELEMETRY_DASHBOARD_REALM=%q\n' "${TELEMETRY_DASHBOARD_REALM}"
    if [[ -n "${preserve_dashboard_user_raw}" ]]; then
      printf 'TELEMETRY_DASHBOARD_USER=%s\n' "${preserve_dashboard_user_raw}"
    else
      printf 'TELEMETRY_DASHBOARD_USER=%q\n' "${TELEMETRY_DASHBOARD_USER}"
    fi
    if [[ -n "${preserve_dashboard_password_raw}" ]]; then
      printf 'TELEMETRY_DASHBOARD_PASSWORD=%s\n' "${preserve_dashboard_password_raw}"
    else
      printf 'TELEMETRY_DASHBOARD_PASSWORD=%q\n' "${TELEMETRY_DASHBOARD_PASSWORD}"
    fi
    printf 'TELEMETRY_DASHBOARD_RATE_LIMIT_WINDOW_MS=%q\n' "${TELEMETRY_DASHBOARD_RATE_LIMIT_WINDOW_MS}"
    printf 'TELEMETRY_DASHBOARD_RATE_LIMIT_MAX_REQUESTS=%q\n' "${TELEMETRY_DASHBOARD_RATE_LIMIT_MAX_REQUESTS}"
    printf 'TELEMETRY_DASHBOARD_AUTH_FAIL_WINDOW_MS=%q\n' "${TELEMETRY_DASHBOARD_AUTH_FAIL_WINDOW_MS}"
    printf 'TELEMETRY_DASHBOARD_AUTH_FAIL_MAX_ATTEMPTS=%q\n' "${TELEMETRY_DASHBOARD_AUTH_FAIL_MAX_ATTEMPTS}"
  } >"${TELEMETRY_ENV_FILE}"

  chmod 640 "${TELEMETRY_ENV_FILE}"
}

main() {
  if [[ "${EUID}" -ne 0 ]]; then
    echo "This deploy script must run as root (required for nginx/systemd updates)." >&2
    exit 1
  fi

  require_cmd node
  require_cmd npm
  require_cmd npx
  require_cmd rsync
  require_cmd nginx
  require_cmd systemctl
  require_cmd curl
  require_cmd openssl

  if [[ "${TELEMETRY_PORT}" != "4318" ]]; then
    echo "TELEMETRY_PORT must remain 4318 unless nginx telemetry proxy is updated to match." >&2
    exit 1
  fi

  load_existing_telemetry_env
  write_telemetry_env

  log "Using app directory: ${APP_DIR}"
  log "Telemetry endpoint for web build: ${EXPO_PUBLIC_TELEMETRY_ENDPOINT}"
  cd "${APP_DIR}"

  log "Installing dependencies"
  npm ci

  log "Exporting web build"
  EXPO_PUBLIC_TELEMETRY_ENDPOINT="${EXPO_PUBLIC_TELEMETRY_ENDPOINT}" npx expo export --platform web

  if [[ ! -d dist ]]; then
    echo "Export did not produce dist/" >&2
    exit 1
  fi

  local release_id
  release_id="$(date +%Y%m%d%H%M%S)"
  local release_path="${RELEASES_DIR}/${release_id}"

  log "Publishing release: ${release_id}"
  mkdir -p "${release_path}" "${RELEASES_DIR}"
  rsync -a --delete dist/ "${release_path}/"
  ln -sfn "${release_path}" "${CURRENT_LINK}"

  log "Reloading nginx"
  nginx -t
  systemctl reload nginx

  log "Configuring telemetry persistence"
  install -d -m 750 "${TELEMETRY_DATA_DIR}"

  if [[ -d "${LEGACY_TELEMETRY_DATA_DIR}" ]] && [[ -z "$(ls -A "${TELEMETRY_DATA_DIR}" 2>/dev/null)" ]]; then
    log "Migrating legacy telemetry data to ${TELEMETRY_DATA_DIR}"
    rsync -a "${LEGACY_TELEMETRY_DATA_DIR}/" "${TELEMETRY_DATA_DIR}/"
  fi

  log "Installing telemetry service"
  cat >/etc/systemd/system/betterbt-telemetry.service <<EOF
[Unit]
Description=BetterBT Telemetry Ingestion Service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
EnvironmentFile=-${TELEMETRY_ENV_FILE}
ExecStart=/usr/bin/node ${APP_DIR}/backend/telemetry/server.mjs
Restart=always
RestartSec=3
User=root

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable betterbt-telemetry.service
  systemctl restart betterbt-telemetry.service

  if systemctl list-unit-files | grep -q '^betterbt-expo.service'; then
    log "Stopping legacy Expo dev service"
    systemctl disable --now betterbt-expo.service || true
  fi

  log "Cleaning old releases"
  mapfile -t old_releases < <(ls -1dt "${RELEASES_DIR}"/* 2>/dev/null | tail -n +$((KEEP_RELEASES + 1)))
  if ((${#old_releases[@]} > 0)); then
    rm -rf "${old_releases[@]}"
  fi

  log "Validating telemetry backend health"
  curl -fsS "http://${TELEMETRY_BIND_HOST}:${TELEMETRY_PORT}/telemetry/health" >/dev/null

  log "Validating telemetry nginx proxy health"
  curl -kfsS "https://127.0.0.1/telemetry/health" >/dev/null

  log "Deploy complete"
  log "Current release path: $(readlink -f "${CURRENT_LINK}")"
  log "Telemetry service: $(systemctl is-active betterbt-telemetry.service)"
  log "Telemetry data dir: ${TELEMETRY_DATA_DIR}"
  log "Telemetry endpoint: ${EXPO_PUBLIC_TELEMETRY_ENDPOINT}"
  log "Telemetry dashboard path: ${TELEMETRY_DASHBOARD_PATH}"
  log "Telemetry dashboard user: ${TELEMETRY_DASHBOARD_USER}"
  log "Telemetry dashboard env file: ${TELEMETRY_ENV_FILE}"
}

main "$@"