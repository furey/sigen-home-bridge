#!/usr/bin/env bash
set -euo pipefail

# Download the generated docs media (the demo video and its poster) from the
# `media` GitHub release into docs/. The files are not in git.
# scripts/docs-media.txt lists each one as "<folder> <name>", where folder sits
# under docs/. Files that already exist are skipped unless --force is passed.
# A failed download fails the run.
#
#   ./scripts/fetch-docs-media.sh
#   ./scripts/fetch-docs-media.sh --force

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
MANIFEST="${REPO_ROOT}/scripts/docs-media.txt"
REPOSITORY="${REPOSITORY:-furey/sigen-home-bridge}"
BASE_URL="https://github.com/${REPOSITORY}/releases/download/media"
FORCE=0
[ "${1:-}" = "--force" ] && FORCE=1

fetched=0
skipped=0
while read -r folder name; do
  [ -n "${folder:-}" ] || continue
  target="${REPO_ROOT}/docs/${folder}/${name}"
  if [ "$FORCE" -eq 0 ] && [ -s "$target" ]; then
    skipped=$((skipped + 1))
    continue
  fi
  mkdir -p "$(dirname "$target")"
  echo "[docs-media] fetching ${name}"
  curl -fsSL --retry 3 -o "${target}.part" "${BASE_URL}/${name}" \
    || { rm -f "${target}.part"; echo "[docs-media] failed to download ${BASE_URL}/${name}" >&2; exit 1; }
  mv "${target}.part" "$target"
  fetched=$((fetched + 1))
done < "$MANIFEST"

echo "[docs-media] done: ${fetched} fetched, ${skipped} already present"
