#!/usr/bin/env bash
set -euo pipefail

# Upload a video to GitHub's user-attachments store and point one of the
# README's Demo videos at the new URL. GitHub plays a bare user-attachments URL
# on its own line as an inline video. SLOT picks which attachment line in
# README.md to replace, counting from 1: 1 is the walkthrough, 2 is the install.
#
# Uses the same (unofficial, undocumented) endpoint the web UI's drag-and-drop
# hits, authenticated with `gh auth token`. If GitHub retires it, drag the file
# into any issue or PR comment box and paste the URL it gives into the README.
# Each upload gets a new URL; old uploads cannot be listed or deleted.
#
#   ./scripts/upload-readme-video.sh walkthrough-demo.mp4 1
#   ./scripts/upload-readme-video.sh install-demo.mp4 2

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
FILE="${1:?usage: upload-readme-video.sh <file.mp4> <slot>}"
SLOT="${2:?usage: upload-readme-video.sh <file.mp4> <slot>}"
REPOSITORY="${REPOSITORY:-furey/sigen-home-bridge}"
README="${REPO_ROOT}/README.md"
ATTACHMENT_LINE='^<https://(gist\.)?github\.com/user-attachments/assets/[0-9a-f-]+>$'

[ -s "$FILE" ] || { echo "[upload] $FILE not found" >&2; exit 1; }
[ "$(grep -Ec "$ATTACHMENT_LINE" "$README")" -ge "$SLOT" ] \
  || { echo "[upload] README.md has fewer than $SLOT user-attachments lines" >&2; exit 1; }

REPO_ID=$(gh api "repos/$REPOSITORY" --jq .id)
URL=$(curl -fsS "https://uploads.github.com/user-attachments/assets?name=$(basename "$FILE")&content_type=video/mp4&repository_id=$REPO_ID" \
  -X POST \
  -H "Authorization: Bearer $(gh auth token)" \
  -H "Accept: application/json" \
  --data-binary "@$FILE" | jq -r .url)

[[ "$URL" =~ ^https://github\.com/user-attachments/assets/[0-9a-f-]+$ ]] \
  || { echo "[upload] unexpected response URL: $URL" >&2; exit 1; }

ATTACHMENT_LINE="$ATTACHMENT_LINE" awk -v slot="$SLOT" -v url="<${URL}>" '
  $0 ~ ENVIRON["ATTACHMENT_LINE"] { seen++; if (seen == slot) { print url; next } }
  { print }
' "$README" > "${README}.next" && mv "${README}.next" "$README"
echo "[upload] README Demo video ${SLOT} now points at $URL"
