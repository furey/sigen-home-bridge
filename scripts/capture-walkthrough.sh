#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
SIGEN_URL="${SIGEN_URL:-http://localhost:5163}"
SIGEN_URL="${SIGEN_URL%/}"
PLAYWRIGHT_VERSION="${PLAYWRIGHT_VERSION:-1.60.0}"
PLAYWRIGHT_IMAGE="${PLAYWRIGHT_IMAGE:-mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-jammy}"
OUT_NAME="${WALKTHROUGH_NAME:-walkthrough}"
TRIM_HEAD="${WALKTHROUGH_TRIM_HEAD:-0.5}"
WEBM="${REPO_ROOT}/${OUT_NAME}.webm"
MP4="${REPO_ROOT}/${OUT_NAME}.mp4"
HOST_UID=$(id -u)
HOST_GID=$(id -g)

for tool in docker ffmpeg; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "[walkthrough] $tool not found on PATH" >&2
    exit 1
  fi
done

echo "[walkthrough] checking sigen-home-bridge at $SIGEN_URL"
if ! curl -fsS "$SIGEN_URL/api/state" >/dev/null; then
  echo "[walkthrough] not reachable at $SIGEN_URL" >&2
  echo "             start the bridge (docker compose up -d), or set SIGEN_URL to a live instance." >&2
  exit 1
fi

echo "[walkthrough] recording $PLAYWRIGHT_IMAGE against $SIGEN_URL"
docker run --rm --network host \
  -v "$REPO_ROOT":/work \
  -w /tmp \
  -e SIGEN_URL="$SIGEN_URL" \
  -e WALKTHROUGH_OUT="/work" \
  -e WALKTHROUGH_NAME="$OUT_NAME" \
  -e WALKTHROUGH_TZ \
  -e WALKTHROUGH_SCALE \
  -e WALKTHROUGH_FRAMES \
  -e WALKTHROUGH_FRAME_MS \
  "$PLAYWRIGHT_IMAGE" \
  bash -c "npm init -y >/dev/null && \
    npm install --silent --no-save --no-audit --no-fund playwright@${PLAYWRIGHT_VERSION} 2>&1 | tail -1 && \
    cp /work/scripts/capture-walkthrough.mjs /tmp/capture-walkthrough.mjs && \
    node /tmp/capture-walkthrough.mjs && \
    chown ${HOST_UID}:${HOST_GID} /work/${OUT_NAME}.webm"

echo "[walkthrough] encoding $MP4"
ffmpeg -y -loglevel error -ss "$TRIM_HEAD" -i "$WEBM" \
  -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" \
  -c:v libx264 -profile:v high -pix_fmt yuv420p -movflags +faststart -an \
  "$MP4"
rm -f "$WEBM"

echo "[walkthrough] done. $MP4"
