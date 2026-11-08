#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
SIGEN_URL="${SIGEN_URL:-http://localhost:5163}"
SIGEN_URL="${SIGEN_URL%/}"
PLAYWRIGHT_VERSION="${PLAYWRIGHT_VERSION:-1.60.0}"
PLAYWRIGHT_IMAGE="${PLAYWRIGHT_IMAGE:-mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-jammy}"
CHROME_BIN="${CHROME_BIN:-/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell}"
OUT_NAME="${WALKTHROUGH_NAME:-walkthrough-demo}"
FRAMES_ROOT="${REPO_ROOT}/tmp/walkthrough-frames"
DEVICES="${WALKTHROUGH_DEVICE:-desktop tablet}"
MP4="${REPO_ROOT}/${OUT_NAME}.mp4"
MP4_1X="${REPO_ROOT}/${OUT_NAME}-1x.mp4"
POSTER="${REPO_ROOT}/${OUT_NAME}.jpg"
MP4_TABLET="${REPO_ROOT}/${OUT_NAME}-tablet.mp4"
POSTER_TABLET="${REPO_ROOT}/${OUT_NAME}-tablet.jpg"
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

record () {
  local device="$1" frames="${FRAMES_ROOT}/$1"
  rm -rf "$frames"
  mkdir -p "$frames"
  echo "[walkthrough] recording the ${device} tour frame by frame in $PLAYWRIGHT_IMAGE"
  docker run --rm --init --network host \
    -v "${REPO_ROOT}/scripts":/scripts:ro \
    -v "$frames":/frames \
    -e SIGEN_URL="$SIGEN_URL" \
    -e CHROME_BIN="$CHROME_BIN" \
    -e WALKTHROUGH_DEVICE="$device" \
    -e WALKTHROUGH_FRAMES_DIR=/frames \
    -e HOME=/tmp \
    -e WALKTHROUGH_TZ \
    -e WALKTHROUGH_FRAMES \
    -e WALKTHROUGH_FRAME_MS \
    -e WALKTHROUGH_DEBUG \
    --user "$(id -u):$(id -g)" \
    "$PLAYWRIGHT_IMAGE" \
    timeout 900 node /scripts/capture-walkthrough.mjs
  ls "$frames"/*.jpg >/dev/null 2>&1 || { echo "[walkthrough] no ${device} frames produced" >&2; exit 1; }
  local frame_seconds
  frame_seconds=$(awk -v f="$FPS" 'BEGIN { printf "%.6f", 1 / f }')
  {
    echo "ffconcat version 1.0"
    for frame in "$frames"/*.jpg; do
      echo "file '${frame}'"
      echo "duration ${frame_seconds}"
    done
  } > "${frames}/frames.ffconcat"
  echo "[walkthrough] encoding $(grep -c '^file' "${frames}/frames.ffconcat") ${device} frames at ${FPS} fps"
}

encode () {
  local device="$1" scale="$2" out="$3"
  ffmpeg -y -loglevel error -f concat -safe 0 -i "${FRAMES_ROOT}/${device}/frames.ffconcat" \
    -an -vf "fps=${FPS},scale=${scale}:flags=lanczos+accurate_rnd+full_chroma_int:out_range=tv,format=yuv420p" -fps_mode cfr \
    -c:v libx264 -profile:v high -crf "$CRF" -preset slow -tune animation -g $((FPS * 2)) \
    -color_range tv -movflags +faststart "$out"
}

poster () {
  ffmpeg -y -loglevel error -i "$1" -frames:v 1 -update 1 -q:v 3 "$2"
}

for device in $DEVICES; do
  case "$device" in
    desktop|tablet) ;;
    *) echo "[walkthrough] unknown device ${device}; use desktop or tablet" >&2; exit 1 ;;
  esac
done

for device in $DEVICES; do
  case "$device" in
    desktop)
      record desktop
      encode desktop 2560:1600 "$MP4"
      encode desktop 1280:800 "$MP4_1X"
      poster "$MP4_1X" "$POSTER"
      ls -lh "$MP4" "$MP4_1X" "$POSTER"
      ;;
    tablet)
      record tablet
      encode tablet 1194:834 "$MP4_TABLET"
      poster "$MP4_TABLET" "$POSTER_TABLET"
      cp "$MP4_TABLET" "${REPO_ROOT}/docs/public/demo.mp4"
      cp "$POSTER_TABLET" "${REPO_ROOT}/docs/public/demo-poster.jpg"
      ls -lh "$MP4_TABLET" "$POSTER_TABLET"
      ;;
    *)
      echo "[walkthrough] unknown device ${device}; use desktop or tablet" >&2
      exit 1
      ;;
  esac
done

if [ "${WALKTHROUGH_UPLOAD:-1}" = "0" ]; then
  echo "[walkthrough] upload skipped (WALKTHROUGH_UPLOAD=0)"
  exit 0
fi
case " $DEVICES " in *" desktop "*)
  "${REPO_ROOT}/scripts/upload-readme-video.sh" "$MP4" 1
  echo "[walkthrough] commit README.md to publish the new Demo URL"
  ;;
esac
case " $DEVICES " in *" tablet "*) "${REPO_ROOT}/scripts/upload-docs-media.sh" ;; esac
