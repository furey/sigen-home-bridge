#!/usr/bin/env bash
set -eu

INSTALL_DIR="${INSTALL_DIR:-~/sigen-home-bridge}"
INSTALL_ADDRESS="${INSTALL_ADDRESS:-192.168.1.50}"
SPINNER=(⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏)
TICK=0.08
GREEN=$'\033[32m'
BLUE=$'\033[34m'
YELLOW=$'\033[93m'
RESET=$'\033[0m'
BOLD=$'\033[1m'
DIM=$'\033[2m'
ACCENT=$'\033[1;38;2;245;158;11m'
LINK=$'\033[1;4;38;2;245;158;11m'

say() { printf '%s\n' "$*"; }
pause() { sleep "$1"; }
info() { printf '%s[install]%s %s\n' "$DIM" "$RESET" "$*"; }
ok() { printf '%s[install]%s %s%s%s\n' "$DIM" "$RESET" "$GREEN" "$*" "$RESET"; }

banner() {
  say ""
  printf ' %ssigen-home-bridge%s\n' "$ACCENT" "$RESET"
  printf ' %sby @furey - https://about.me/jamesfurey%s\n' "$DIM" "$RESET"
  say ""
}

ask_key() {
  printf '%s%s%s ' "$BOLD" "$1" "$RESET" > /dev/tty
  read -rs _ < /dev/tty || true
  printf 'Y\n' > /dev/tty
}

status_mark() {
  local done=$1 tick=$2
  [ "$done" = 1 ] && { printf '%s✔%s' "$GREEN" "$RESET"; return; }
  printf '%s%s%s' "$BLUE" "${SPINNER[$((tick % ${#SPINNER[@]}))]}" "$RESET"
}

draw_rows() {
  local title=$1 width=$2 elapsed=$3 tick=$4
  shift 4
  local total=$(( $# / 5 )) finished=0 row
  local -a lines=()
  while [ $# -gt 0 ]; do
    local kind=$1 name=$2 busy=$3 doneword=$4 seconds=$5
    shift 5
    local done=0 shown=$elapsed word=$busy
    if awk -v e="$elapsed" -v s="$seconds" 'BEGIN { exit !(e >= s) }'; then
      done=1 shown=$seconds word=$doneword finished=$((finished + 1))
    fi
    lines+=("$(printf ' %s %-9s %-*s %-8s %5.1fs' "$(status_mark "$done" "$tick")" "$kind" "$width" "$name" "$word" "$shown")")
  done
  printf '\033[2K[+] %s %d/%d\n' "$title" "$finished" "$total"
  for row in "${lines[@]}"; do printf '\033[2K%s\n' "$row"; done
  [ "$finished" = "$total" ]
}

animate() {
  local title=$1 width=$2 speed=$3
  shift 3
  local rows=$(( $# / 5 + 1 )) tick=0 elapsed
  while :; do
    elapsed=$(awk -v t="$tick" -v s="$speed" -v d="$TICK" 'BEGIN { printf "%.1f", t * d * s }')
    [ "$tick" -gt 0 ] && printf '\033[%dA' "$rows"
    draw_rows "$title" "$width" "$elapsed" "$tick" "$@" && break
    tick=$((tick + 1))
    sleep "$TICK"
  done
}

banner
info "folder: $INSTALL_DIR"
pause 0.5
ok "downloaded compose.yaml"
pause 0.4
ok "wrote .env:"
say "    TZ=Australia/Sydney"
say "    HOMEKIT_BIND=eth0"
ask_key 'Start now? [Y/n/e = edit .env first]'
pause 0.3
animate pull 38 6 \
  Image ghcr.io/furey/sigen-home-bridge:latest Pulling Pulled 14.6
animate up 38 2 \
  Volume sigen-home-bridge_sigen-data Creating Created 0.4 \
  Container sigen-home-bridge Starting Started 1.2
say ""
pause 0.4
printf '%s[install]%s %sThe bridge is starting.%s Open %s%s%s to run the setup wizard.\n' \
  "$DIM" "$RESET" "$GREEN" "$RESET" "$LINK" "http://${INSTALL_ADDRESS}:5163" "$RESET"
info "To update later: cd ${INSTALL_DIR} && docker compose pull && docker compose up -d"
