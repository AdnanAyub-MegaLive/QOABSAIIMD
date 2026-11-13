#!/usr/bin/env bash
# Isolated orchestration test: never contacts Git remotes, a database or real PM2.
set -euo pipefail
source_script="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/deploy-droplet.sh"
fixture="$(mktemp -d)"
trap 'rm -rf "$fixture"' EXIT
mkdir -p "$fixture/bin"
cat > "$fixture/bin/dispatch" <<'SH'
#!/usr/bin/env bash
set -eu
command_name="$(basename "$0")"
echo "$command_name $*" >> "$TEST_LOG"
case "$command_name" in
  flock) exit 0 ;;
  git)
    case "$1" in
      status) exit 0 ;;
      rev-parse) echo abc123 ;;
      pull) [ "$TEST_FAILURE" != pull ] ;;
      archive) exit 0 ;;
    esac ;;
  tar)
    mkdir -p "$3/.next"
    echo ok > "$3/.next/BUILD_ID"
    echo '{}' > "$3/.next/required-server-files.json" ;;
  npm)
    [ "$PWD" != "$TEST_REPO" ] || exit 90
    [ "$TEST_FAILURE" != "$1" ] ;;
  npx) [ "$TEST_FAILURE" != migrate ] ;;
  node)
    if [ "$1" = - ]; then cat >/dev/null; fi
    if [ "${2:-}" = --health ] && [ "$TEST_FAILURE" = health ]; then exit 1; fi ;;
  pm2)
    case "$1" in
      stop|delete) exit 91 ;;
      jlist) echo '[]' ;;
      restart)
        if [ "$TEST_FAILURE" = restart ] && [[ "$2" = */release.ecosystem.json ]]; then exit 1; fi ;;
    esac ;;
esac
SH
chmod +x "$fixture/bin/dispatch"
for command_name in git npm npx node pm2 tar flock; do cp "$fixture/bin/dispatch" "$fixture/bin/$command_name"; done
for failure in none ci run migrate health restart; do
  checkout="$fixture/$failure"
  mkdir -p "$checkout/scripts"
  cp "$source_script" "$checkout/scripts/deploy-droplet.sh"
  touch "$checkout/.env.local"
  export TEST_FAILURE="$failure" TEST_LOG="$fixture/$failure.log" TEST_REPO="$checkout"
  if PATH="$fixture/bin:$PATH" bash "$checkout/scripts/deploy-droplet.sh" > "$fixture/$failure.output" 2>&1; then
    [ "$failure" = none ] || { cat "$fixture/$failure.output"; exit 1; }
  else
    [ "$failure" != none ] || { cat "$fixture/$failure.output"; exit 1; }
  fi
  if grep -Eq '^pm2 (stop|delete)' "$TEST_LOG"; then exit 1; fi
  case "$failure" in
    ci|run|migrate) if grep -q '^pm2 restart' "$TEST_LOG"; then exit 1; fi ;;
    health|restart) grep -q 'previous.ecosystem.json' "$TEST_LOG" ;;
    none) grep -q 'release.ecosystem.json' "$TEST_LOG"; grep -q '^pm2 save' "$TEST_LOG" ;;
  esac
  echo "PASS: deployment $failure"
done
