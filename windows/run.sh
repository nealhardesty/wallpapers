#!/bin/bash
# Runs the built Windows app from WSL (SPEC §10.25.15):
#   run.sh run   copy dist/win to %LOCALAPPDATA%\Wallpapers-build\run and start it (normal settings)
#   run.sh dev   the same into ...\dev, with WP_DEV=1 WP_DEBUG=1 and WP_WEB_ROOT on this checkout's web/
#   run.sh test  the same into ...\test, run --selftest, print its report, exit with its code
#   run.sh log [run|dev|test]   the last lines of that flavour's log (FOLLOW=1 to follow)
# Extra arguments for the app: WIN_ARGS="--dump-displays".
set -e
cd "$(dirname "$0")/.."
mode=${1:-run}
CMD=/mnt/c/Windows/System32/cmd.exe
LAD=$("$CMD" /c echo %LOCALAPPDATA% 2>/dev/null | tr -d '\r')
# WSL interop can fail for a moment ("Exec format error"); an empty answer would put the Windows-side
# folders inside this checkout, so stop instead.
case "$LAD" in [A-Za-z]:\\*) ;; *) echo "run.sh: couldn't reach Windows (%LOCALAPPDATA% came back '$LAD'); try again" >&2; exit 1 ;; esac
LOCAL=$(wslpath "$LAD")

root_for() { case "$1" in dev) echo "$LOCAL/Wallpapers-dev" ;; test) echo "$LOCAL/Wallpapers-test" ;; *) echo "$LOCAL/Wallpapers" ;; esac; }

if [ "$mode" = log ]; then
  log="$(root_for "${2:-run}")/log.txt"
  [ -f "$log" ] || { echo "no log yet: $log"; exit 0; }
  if [ -n "$FOLLOW" ]; then tail -n 40 -f "$log"; else tail -n 80 "$log"; fi
  exit 0
fi

[ -f dist/win/Wallpapers.exe ] || { echo "run.sh: build first (make win-build)" >&2; exit 1; }
BIN="$LOCAL/Wallpapers-build/$mode"
mkdir -p "$BIN"
export WSLENV="WP_DEV:WP_DEBUG:WP_WEB_ROOT${WSLENV:+:$WSLENV}"
if [ "$mode" = dev ]; then
  export WP_DEV=1 WP_DEBUG=1 WP_WEB_ROOT="$(wslpath -w "$PWD/web")"
fi
cd "$BIN"
# A running copy of this flavour locks its exe: ask it to quit, then wait for the file to come free.
if [ -f Wallpapers.exe ]; then
  ./Wallpapers.exe --quit >/dev/null 2>&1 || true
  for _ in $(seq 1 20); do (: >> Wallpapers.exe) 2>/dev/null && break; sleep 0.5; done
fi
cd - >/dev/null
rsync -a --delete dist/win/ "$BIN/"
LOG="$(root_for "$mode")/log.txt"
before=$(stat -c %s "$LOG" 2>/dev/null || echo 0)
cd "$BIN"
if [ "$mode" = test ]; then
  status=0
  # shellcheck disable=SC2086
  ./Wallpapers.exe --selftest $WIN_ARGS || status=$?
  report="$(root_for test)/selftest.txt"
  if [ -f "$report" ]; then tr -d '\r' < "$report"; else echo "run.sh: no selftest report (exit $status)" >&2; [ $status = 0 ] && status=1; fi
  exit $status
fi
# shellcheck disable=SC2086
"$CMD" /c start "" Wallpapers.exe $WIN_ARGS
# A build that never writes to its log within a few seconds was probably refused by Windows.
for _ in $(seq 1 16); do [ "$(stat -c %s "$LOG" 2>/dev/null || echo 0)" != "$before" ] && break; sleep 0.5; done
if [ "$(stat -c %s "$LOG" 2>/dev/null || echo 0)" = "$before" ]; then
  echo "run.sh: Wallpapers.exe didn't start (no log line). If Smart App Control blocked it, build again: every build is a new file to it." >&2
  exit 1
fi
echo "started ($mode): log at $LOG"
