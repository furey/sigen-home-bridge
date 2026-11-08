#!/usr/bin/env bash
set -euo pipefail

# Record the one-line install in a terminal, encode it, and publish it.
#
# A VHS container (charmbracelet/vhs) plays scripts/demo/install.tape: it
# types the real curl command, but curl and sh are shell functions inside the
# container, so nothing downloads and install.sh never runs. The output comes
# from scripts/demo/install-sim.sh, which prints what a fresh install
# prints, with the image pull sped up. Nothing touches Docker on the host.
#
# Writes install-demo.mp4 and install-demo-poster.jpg at the repo root, copies
# them into docs/public for the docs site, uploads the mp4 to the README's
# second Demo video, and uploads the docs copies to the `media` release.
# INSTALL_DEMO_UPLOAD=0 skips both uploads.
#
# Needs host `docker` + `ffmpeg`.
#
#   ./scripts/capture-install.sh

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
VHS_IMAGE="${VHS_IMAGE:-ghcr.io/charmbracelet/vhs:v0.12.1}"
HOST_UID=$(id -u)
HOST_GID=$(id -g)

TAPE="scripts/demo/install.tape"
WEBM="${REPO_ROOT}/install-demo.webm"
MP4="${REPO_ROOT}/install-demo.mp4"
POSTER="${REPO_ROOT}/install-demo-poster.jpg"

for tool in docker ffmpeg; do
  command -v "$tool" >/dev/null 2>&1 || { echo "[install-demo] $tool not found on PATH" >&2; exit 1; }
done

rm -f "$WEBM"
echo "[install-demo] recording with $VHS_IMAGE"
docker run --rm \
  -v "$REPO_ROOT":/vhs \
  -w /vhs \
  --entrypoint sh \
  "$VHS_IMAGE" \
  -c "status=0 && vhs $TAPE >/dev/null || status=\$? ; chown ${HOST_UID}:${HOST_GID} /vhs/install-demo.webm 2>/dev/null ; exit \$status"

[ -f "$WEBM" ] || { echo "[install-demo] no .webm produced" >&2; exit 1; }

echo "[install-demo] encoding mp4"
ffmpeg -y -loglevel error -i "$WEBM" \
  -an -vf "fps=25,scale=trunc(iw/2)*2:trunc(ih/2)*2" -fps_mode cfr \
  -c:v libx264 -profile:v high -crf 23 -preset slow -tune animation \
  -pix_fmt yuv420p -movflags +faststart \
  "$MP4"
ffmpeg -y -loglevel error -i "$MP4" -frames:v 1 -update 1 -q:v 4 "$POSTER"
rm -f "$WEBM"
cp "$MP4" "${REPO_ROOT}/docs/public/install-demo.mp4"
cp "$POSTER" "${REPO_ROOT}/docs/public/install-demo-poster.jpg"
ls -lh "$MP4" "$POSTER"

if [ "${INSTALL_DEMO_UPLOAD:-1}" = "0" ]; then
  echo "[install-demo] upload skipped (INSTALL_DEMO_UPLOAD=0)"
  exit 0
fi
"${REPO_ROOT}/scripts/upload-readme-video.sh" "$MP4" 2
echo "[install-demo] commit README.md to publish the new Demo URL"
"${REPO_ROOT}/scripts/upload-docs-media.sh"
