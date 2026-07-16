#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
PLAYWRIGHT_VERSION="${PLAYWRIGHT_VERSION:-1.60.0}"
PLAYWRIGHT_IMAGE="${PLAYWRIGHT_IMAGE:-mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-jammy}"
OUT_FILE="${OG_OUT:-docs/public/og.png}"
OUT_FILE="${OUT_FILE#/}"
OUT_DIR=$(dirname "$OUT_FILE")
HOST_UID=$(id -u)
HOST_GID=$(id -g)

if ! command -v docker >/dev/null 2>&1; then
  echo "[og] docker not found on PATH" >&2
  exit 1
fi

echo "[og] rendering ${OUT_FILE} via ${PLAYWRIGHT_IMAGE}"
docker run --rm \
  -v "$REPO_ROOT":/work \
  -w /tmp \
  -e OG_OUT="/work/${OUT_FILE}" \
  -e OG_VARIANT="${OG_VARIANT:-a}" \
  "$PLAYWRIGHT_IMAGE" \
  bash -c "npm init -y >/dev/null && \
    npm install --silent --no-save --no-audit --no-fund playwright@${PLAYWRIGHT_VERSION} 2>&1 | tail -1 && \
    cp /work/scripts/generate-og.mjs /tmp/generate-og.mjs && \
    node /tmp/generate-og.mjs && \
    chown -R ${HOST_UID}:${HOST_GID} /work/${OUT_DIR}"

echo "[og] done. Image at ${OUT_FILE}"
