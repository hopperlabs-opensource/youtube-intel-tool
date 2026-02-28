#!/usr/bin/env bash

# Helpers for reading tracked defaults from `.env.example`.
# Usage:
#   source "ops/lib/defaults.sh"
#   value="$(yit_read_default_env "${ROOT_DIR}" "YIT_WEB_PORT" "3333")"

yit_read_default_env() {
  local root_dir="$1"
  local key="$2"
  local fallback="${3:-}"
  local file="${root_dir}/.env.example"

  if [ ! -f "${file}" ]; then
    echo "${fallback}"
    return 0
  fi

  local line
  line="$(grep -E "^${key}=" "${file}" | tail -n1 || true)"
  if [ -z "${line}" ]; then
    echo "${fallback}"
    return 0
  fi

  local value="${line#*=}"
  if [ "${#value}" -ge 2 ]; then
    if [[ "${value}" == \"*\" ]] || [[ "${value}" == \'*\' ]]; then
      value="${value:1:${#value}-2}"
    fi
  fi

  echo "${value}"
}
