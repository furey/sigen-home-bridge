#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
SIGEN_URL="${SIGEN_URL:-http://localhost:5163}"
SIGEN_URL="${SIGEN_URL%/}"
PLAYWRIGHT_VERSION="${PLAYWRIGHT_VERSION:-1.60.0}"
PLAYWRIGHT_IMAGE="${PLAYWRIGHT_IMAGE:-mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-jammy}"
CHROME_BIN="${CHROME_BIN:-/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell}"
OUT_NAME="${WALKTHROUGH_NAME:-walkthrough}"
FRAMES_DIR="${REPO_ROOT}/tmp/walkthrough-frames"
MP4="${REPO_ROOT}/${OUT_NAME}.mp4"
MP4_1X="${REPO_ROOT}/${OUT_NAME}-1x.mp4"
POSTER="${REPO_ROOT}/${OUT_NAME}.jpg"
FPS=60
CRF="${WALKTHROUGH_CRF:-22}"

for tool in docker ffmpeg curl; do
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

rm -rf "$FRAMES_DIR"
mkdir -p "$FRAMES_DIR"
echo "[walkthrough] recording frame by frame in $PLAYWRIGHT_IMAGE"
docker run --rm --init --network host \
  -v "${REPO_ROOT}/scripts":/scripts:ro \
  -v "$FRAMES_DIR":/frames \
  -e SIGEN_URL="$SIGEN_URL" \
  -e CHROME_BIN="$CHROME_BIN" \
  -e WALKTHROUGH_FRAMES_DIR=/frames \
  -e HOME=/tmp \
  -e WALKTHROUGH_TZ \
  -e WALKTHROUGH_FRAMES \
  -e WALKTHROUGH_FRAME_MS \
  --user "$(id -u):$(id -g)" \
  "$PLAYWRIGHT_IMAGE" \
  node /scripts/capture-walkthrough.mjs

ls "$FRAMES_DIR"/*.jpg >/dev/null 2>&1 || { echo "[walkthrough] no frames produced" >&2; exit 1; }
FRAME_SECONDS=$(awk -v f="$FPS" 'BEGIN { printf "%.6f", 1 / f }')
CONCAT="${FRAMES_DIR}/frames.ffconcat"
{
  echo "ffconcat version 1.0"
  for frame in "$FRAMES_DIR"/*.jpg; do
    echo "file '${frame}'"
    echo "duration ${FRAME_SECONDS}"
  done
} > "$CONCAT"

encode () {
  local scale="$1" out="$2"
  ffmpeg -y -loglevel error -f concat -safe 0 -i "$CONCAT" \
    -an -vf "fps=${FPS},scale=${scale}:flags=lanczos+accurate_rnd+full_chroma_int:out_range=tv,format=yuv420p" -fps_mode cfr \
    -c:v libx264 -profile:v high -crf "$CRF" -preset slow -tune animation -g $((FPS * 2)) \
    -color_range tv -movflags +faststart "$out"
}

echo "[walkthrough] encoding $(grep -c '^file' "$CONCAT") frames at ${FPS} fps"
encode "2560:1600" "$MP4"
encode "1280:800" "$MP4_1X"
ffmpeg -y -loglevel error -i "$MP4_1X" -frames:v 1 -update 1 -q:v 3 "$POSTER"

cp "$MP4_1X" "${REPO_ROOT}/docs/public/demo.mp4"
cp "$POSTER" "${REPO_ROOT}/docs/public/demo-poster.jpg"

echo "[walkthrough] done."
ls -lh "$MP4" "$MP4_1X" "$POSTER"

if [ "${WALKTHROUGH_UPLOAD:-1}" = "0" ]; then
  echo "[walkthrough] upload skipped (WALKTHROUGH_UPLOAD=0)"
  exit 0
fi
"${REPO_ROOT}/scripts/upload-walkthrough.sh" "$MP4"
"${REPO_ROOT}/scripts/upload-docs-media.sh"
echo "[walkthrough] commit README.md to publish the new Demo URL"
