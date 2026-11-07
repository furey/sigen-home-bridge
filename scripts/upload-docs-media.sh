#!/usr/bin/env bash
set -euo pipefail

# Upload the docs media listed in scripts/docs-media.txt to the `media` GitHub
# release, replacing assets of the same name, then start a docs deploy so the
# site serves the new files.
#
# The repository has immutable releases switched on, and an immutable release
# refuses new assets. `media` was created while the setting was off, so it
# stays mutable; never recreate it with the setting on.
#
# DOCS_MEDIA_DEPLOY=0 uploads without starting a deploy.
#
#   ./scripts/upload-docs-media.sh

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
MANIFEST="${REPO_ROOT}/scripts/docs-media.txt"
REPOSITORY="${REPOSITORY:-furey/sigen-home-bridge}"

files=()
while read -r folder name; do
  [ -n "${folder:-}" ] || continue
  target="${REPO_ROOT}/docs/${folder}/${name}"
  [ -f "$target" ] && files+=("$target")
done < "$MANIFEST"

[ "${#files[@]}" -gt 0 ] || { echo "[docs-media] no files to upload" >&2; exit 1; }

echo "[docs-media] uploading ${#files[@]} files to release media"
gh release upload media "${files[@]}" --clobber --repo "$REPOSITORY"

if [ "${DOCS_MEDIA_DEPLOY:-1}" != "0" ]; then
  gh workflow run docs.yml --ref main --repo "$REPOSITORY"
  echo "[docs-media] docs deploy started"
fi
