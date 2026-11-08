#!/bin/sh
set -eu

# Install sigen-home-bridge with Docker Compose.
#
#   curl -fsSL https://raw.githubusercontent.com/furey/sigen-home-bridge/main/install.sh | sh
#
# Makes a folder (./sigen-home-bridge, or SIGEN_DIR), downloads compose.yaml,
# writes a .env from .env.example with your time zone and LAN interface for you
# to confirm, then starts the bridge. Re-running it keeps an existing .env and
# compose file.

SIGEN_DIR="${SIGEN_DIR:-$PWD/sigen-home-bridge}"
SIGEN_REF="${SIGEN_REF:-main}"
RAW_URL="https://raw.githubusercontent.com/furey/sigen-home-bridge/${SIGEN_REF}"

use_colour() { [ -t "$1" ] && [ -z "${NO_COLOR:-}" ] && [ "${TERM:-dumb}" != "dumb" ]; }

ESC="$(printf '\033')"

paint() { printf '\033[%sm' "$1"; }

setup_colour() {
  RESET="" BOLD="" DIM="" ACCENT="" YELLOW="" GREEN="" LINK=""
  use_colour 1 || return 0
  amber=33
  case "${TERM:-}:${COLORTERM:-}" in
    *truecolor*|*24bit*) amber="38;2;245;158;11" ;;
    *256color*) amber="38;5;214" ;;
  esac
  RESET="$(paint 0)" BOLD="$(paint 1)" DIM="$(paint 2)" ACCENT="$(paint "1;$amber")"
  YELLOW="$(paint 93)" GREEN="$(paint 32)" LINK="$(paint "1;4;$amber")"
}

setup_colour
if use_colour 2; then ERR_RED="$(paint 31)" ERR_RESET="$(paint 0)"; else ERR_RED="" ERR_RESET=""; fi

say() { printf '%s\n' "$*"; }
info() { printf '%s[install]%s %s\n' "$DIM" "$RESET" "$*"; }
ok() { printf '%s[install]%s %s%s%s\n' "$DIM" "$RESET" "$GREEN" "$*" "$RESET"; }
warn() { printf '%s[install]%s %s%s%s\n' "$DIM" "$RESET" "$YELLOW" "$*" "$RESET"; }
fail() { printf '%s[install] %s%s\n' "$ERR_RED" "$*" "$ERR_RESET" >&2; exit 1; }

banner() {
  say ""
  printf ' %ssigen-home-bridge%s\n' "$ACCENT" "$RESET"
  printf ' %sby @furey - https://about.me/jamesfurey%s\n' "$DIM" "$RESET"
  say ""
}

ask_key() {
  (exec < /dev/tty) 2>/dev/null || return 0
  printf '%s%s%s ' "$BOLD" "$1" "$RESET" > /dev/tty
  tty_state="$(stty -g < /dev/tty)"
  trap 'stty "$tty_state" < /dev/tty; printf "\n" > /dev/tty; exit 130' INT TERM
  stty -icanon -echo min 1 time 0 < /dev/tty
  while :; do
    key="$(dd bs=1 count=1 < /dev/tty 2>/dev/null)"
    case "$2" in *"$key"*) break ;; esac
  done
  if [ "$key" = "$ESC" ]; then drain_tty; fi
  stty "$tty_state" < /dev/tty
  trap - INT TERM
  case "$key" in [[:alpha:]]) printf '%s\n' "$key" ;; *) printf '\n' ;; esac > /dev/tty
  printf '%s' "$key"
}

drain_tty() {
  stty min 0 time 1 < /dev/tty
  dd bs=16 count=1 < /dev/tty > /dev/null 2>&1 || true
}

host_zone() {
  if command -v timedatectl >/dev/null 2>&1; then
    timedatectl show -p Timezone --value 2>/dev/null && return
  fi
  zone="$(readlink /etc/localtime 2>/dev/null | sed -n 's#.*zoneinfo/##p')"
  [ -n "$zone" ] || zone="$(cat /etc/timezone 2>/dev/null || true)"
  printf '%s' "$zone"
}

lan_interface() {
  [ "$(uname -s)" = "Linux" ] || return 0
  ip route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i < NF; i++) if ($i == "dev") print $(i + 1)}'
}

never_started() {
  [ -z "$(docker compose ps --all --quiet 2>/dev/null)" ]
}

host_address() {
  address=""
  if [ "$(uname -s)" = "Darwin" ]; then
    address="$(ipconfig getifaddr en0 2>/dev/null || true)"
    [ -n "$address" ] || address="$(ipconfig getifaddr en1 2>/dev/null || true)"
    printf '%s' "$address"
    return 0
  fi
  address="$(hostname -I 2>/dev/null | awk '{print $1}')"
  [ -n "$address" ] || address="$(ip route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i < NF; i++) if ($i == "src") print $(i + 1)}')"
  printf '%s' "$address"
}

download() {
  curl -fsSL "$RAW_URL/$1" -o "$2" || fail "could not download $RAW_URL/$1"
}

write_env() {
  download .env.example .env.example
  zone="$(host_zone || true)"
  interface="$(lan_interface || true)"
  sed "s|^TZ=.*|TZ=${zone:-UTC}|" .env.example > .env
  rm -f .env.example
  [ -n "$interface" ] || return 0
  sed "s|^# HOMEKIT_BIND=eth0\$|HOMEKIT_BIND=$interface|" .env > .env.next
  mv .env.next .env
}

command -v docker >/dev/null 2>&1 || fail "docker not found on the PATH. Install Docker first, or sign in over SSH so a NAS Docker is on the PATH."
docker compose version >/dev/null 2>&1 || fail "docker compose (v2) not found. Install the Docker Compose plugin."
docker info >/dev/null 2>&1 || fail "cannot reach the Docker daemon. Run this as a user in the docker group, or with sudo."

banner
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) fail "Windows is not supported. Run the bridge on Linux (a NAS, mini PC, or Raspberry Pi) or a Mac." ;;
esac
mkdir -p "$SIGEN_DIR"
cd "$SIGEN_DIR"
info "folder: $SIGEN_DIR"

if [ -f compose.yaml ]; then
  info "keeping the existing compose.yaml"
else
  download compose.yaml compose.yaml
  ok "downloaded compose.yaml"
fi

if [ -f .env ]; then
  env_line="keeping the existing .env"
else
  write_env
  env_line="wrote .env"
fi

if ! never_started; then
  info "$env_line"
else
  ok "$env_line:"
  grep -E '^(TZ|HOMEKIT_BIND)=' .env | sed 's/^/    /'
  answer="$(ask_key 'Start now? [Y/n/e = edit .env first]' "yYnNeE$ESC")"
  case "$answer" in
    "$ESC") warn "cancelled. Nothing started. Run this script again when you are ready."; exit 0 ;;
    n|N) warn "stopped. Edit $SIGEN_DIR/.env, then run this script again."; exit 0 ;;
    e|E) "${EDITOR:-vi}" .env < /dev/tty > /dev/tty ;;
  esac
fi

docker compose pull sigen-home-bridge || fail "could not pull ghcr.io/furey/sigen-home-bridge. The image runs on amd64 and arm64 hosts only."
docker compose up -d

port="$(sed -n 's/^SERVER_PORT=//p' .env)"
address="$(host_address || true)"
say ""
url="http://${address:-<this-host-ip>}:${port:-5163}"
printf '%s[install]%s %sThe bridge is starting.%s Open %s%s%s to run the setup wizard.\n' \
  "$DIM" "$RESET" "$GREEN" "$RESET" "$LINK" "$url" "$RESET"
info "To update later: cd $SIGEN_DIR && docker compose pull && docker compose up -d"
