#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
SIGEN_URL="${SIGEN_URL:-http://localhost:5163}"
SIGEN_URL="${SIGEN_URL%/}"
PLAYWRIGHT_VERSION="${PLAYWRIGHT_VERSION:-1.60.0}"
PLAYWRIGHT_IMAGE="${PLAYWRIGHT_IMAGE:-mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-jammy}"
SHOT_GROUP="${1:-all}"
OUT_DIR="${SCREENSHOT_OUT:-docs/screenshots}"
OUT_DIR="${OUT_DIR#/}"
HOST_UID=$(id -u)
HOST_GID=$(id -g)

if ! command -v docker >/dev/null 2>&1; then
  echo "[capture] docker not found on PATH" >&2
  exit 1
fi

echo "[capture] checking sigen-home-bridge at $SIGEN_URL"
if ! curl -fsS "$SIGEN_URL/api/state" >/dev/null; then
  echo "[capture] not reachable at $SIGEN_URL" >&2
  echo "          start the bridge (docker compose up -d), or set SIGEN_URL to a live instance." >&2
  exit 1
fi

echo "[capture] running $PLAYWRIGHT_IMAGE against $SIGEN_URL (group: $SHOT_GROUP, out: $OUT_DIR)"
docker run --rm --network host \
  -v "$REPO_ROOT":/work \
  -w /tmp \
  -e SIGEN_URL="$SIGEN_URL" \
  -e SCREENSHOT_OUT="/work/${OUT_DIR}" \
  "$PLAYWRIGHT_IMAGE" \
  bash -c "npm init -y >/dev/null && \
    npm install --silent --no-save --no-audit --no-fund playwright@${PLAYWRIGHT_VERSION} 2>&1 | tail -1 && \
    mkdir -p /work/${OUT_DIR} && \
    cp /work/scripts/capture-screenshots.mjs /tmp/capture-screenshots.mjs && \
    node /tmp/capture-screenshots.mjs ${SHOT_GROUP} && \
    chown -R ${HOST_UID}:${HOST_GID} /work/${OUT_DIR}"

echo "[capture] done. PNGs in ${OUT_DIR}/"
