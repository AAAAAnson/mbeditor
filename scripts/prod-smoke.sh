#!/usr/bin/env bash
set -euo pipefail
HOST="${1:-127.0.0.1}"
FRONT_PORT="${2:-7073}"
BACK_PORT="${3:-7072}"
echo "Smoke: frontend http://${HOST}:${FRONT_PORT}/"
curl -fsS -o /dev/null -w "frontend HTTP %{http_code}\n" "http://${HOST}:${FRONT_PORT}/"
echo "Smoke: backend http://${HOST}:${BACK_PORT}/api/v1/version"
curl -fsS -w "backend HTTP %{http_code}\n" "http://${HOST}:${BACK_PORT}/api/v1/version"
echo "Smoke OK"
