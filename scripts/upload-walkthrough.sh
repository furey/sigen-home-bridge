#!/usr/bin/env bash
set -euo pipefail

# Upload the walkthrough video to GitHub's user-attachments store and point the
# README's Demo line at the new URL. GitHub plays a bare user-attachments URL on
# its own line as an inline video.
#
# Uses the same (unofficial, undocumented) endpoint the web UI's drag-and-drop
# hits, authenticated with `gh auth token`. If GitHub retires it, drag the file
# into any issue or PR comment box and paste the URL it gives into the README.
# Each upload gets a new URL; old uploads cannot be listed or deleted.
#
#   ./scripts/upload-walkthrough.sh [walkthrough.mp4]

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
FILE="${1:-$REPO_ROOT/walkthrough.mp4}"
REPOSITORY="${REPOSITORY:-furey/sigen-home-bridge}"
README="${REPO_ROOT}/README.md"
ATTACHMENT_LINE='^<https://(gist\.)?github\.com/user-attachments/assets/[0-9a-f-]+>$'

[ -s "$FILE" ] || { echo "[upload] $FILE not found" >&2; exit 1; }
grep -Eq "$ATTACHMENT_LINE" "$README" || { echo "[upload] no user-attachments line in README.md" >&2; exit 1; }

REPO_ID=$(gh api "repos/$REPOSITORY" --jq .id)
URL=$(curl -fsS "https://uploads.github.com/user-attachments/assets?name=$(basename "$FILE")&content_type=video/mp4&repository_id=$REPO_ID" \
  -X POST \
  -H "Authorization: Bearer $(gh auth token)" \
  -H "Accept: application/json" \
  --data-binary "@$FILE" | jq -r .url)

[[ "$URL" =~ ^https://github\.com/user-attachments/assets/[0-9a-f-]+$ ]] \
  || { echo "[upload] unexpected response URL: $URL" >&2; exit 1; }

sed -E -i.bak "s#${ATTACHMENT_LINE}#<${URL}>#" "$README" && rm -f "${README}.bak"
echo "[upload] README Demo now points at $URL"
