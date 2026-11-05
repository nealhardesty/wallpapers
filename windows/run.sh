#!/bin/bash
# Runs the built Windows app from WSL or Git Bash (SPEC §10.25.15):
#   run.sh run   copy $DIST (default dist/win) to %LOCALAPPDATA%\Wallpapers-build\run and start it (normal settings; --just-run, no install offer)
#   run.sh dev   the same into ...\dev, with WP_DEV=1 WP_DEBUG=1 and WP_WEB_ROOT on this checkout's web/
#   run.sh test  the same into ...\test, run --selftest, print its report, exit with its code
#   run.sh install    the same into ...\install, then --install it (%LOCALAPPDATA%\Programs\Wallpapers; a running copy quits first)
#   run.sh uninstall  the installed copy's --uninstall --keep-settings (DELETE_SETTINGS=1: --delete-settings)
#   run.sh saver      the same into ...\saver, run `Wallpapers.exe /s` (your settings, read-only) full screen until you end it, then the end of
#                     saver-log.txt; the running app is left running (it stands aside while the saver runs, as for a real one)
#   run.sh log [run|dev|test|saver]   the last lines of that flavour's log (FOLLOW=1 to follow); saver: the saver's own saver-log.txt
#   run.sh reload [dev|run]     reload the running app's pages (after a web/ edit, for dev)
# Extra arguments for the app: WIN_ARGS="--dump-displays". WP_FAKE_DISPLAYS=<displays JSON> (a WSL path,
# translated; keep it under /mnt/c so Windows sees edits to it) lays the surfaces out as that file says,
# in ordinary windows (§10.25.15). BUILD=1 builds first, and builds again when
# Smart App Control refuses the build (every build is a new file to it; SPEC §10.25.13), up to 3 times.
# DIST=<folder> runs that folder's Wallpapers.exe instead (make win-test-zip: the unzipped release);
# BUILD is ignored then, since a build would only replace dist/win.
set -e
cd "$(dirname "$0")/.."
mode=${1:-run}
if [ -n "$DIST" ]; then BUILD=; else DIST=dist/win; fi
if [ -d /mnt/c/Windows ]; then
  # WSL: Windows' tools by their full paths, %LOCALAPPDATA% asked of cmd.exe.
  CMD=/mnt/c/Windows/System32/cmd.exe
  PS=/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe
  LAD=$("$CMD" /c echo %LOCALAPPDATA% 2>/dev/null | tr -d '\r')
  unix_path() { wslpath "$1"; }
  win_path() { wslpath -w "$1"; }
else
  # Git Bash (the CI runner): Windows' tools are on PATH and %LOCALAPPDATA% is in the environment.
  PS=$(command -v powershell.exe) || true
  LAD=$LOCALAPPDATA
  unix_path() { cygpath -u "$1"; }
  win_path() { cygpath -w "$1"; }
fi
# WSL interop can fail for a moment ("Exec format error"); an empty answer would put the Windows-side
# folders inside this checkout, so stop instead.
case "$LAD" in [A-Za-z]:\\*) ;; *) echo "run.sh: couldn't reach Windows (%LOCALAPPDATA% came back '$LAD'); try again" >&2; exit 1 ;; esac
LOCAL=$(unix_path "$LAD")

root_for() { case "$1" in dev) echo "$LOCAL/Wallpapers-dev" ;; test) echo "$LOCAL/Wallpapers-test" ;; *) echo "$LOCAL/Wallpapers" ;; esac; }

if [ "$mode" = log ]; then
  if [ "${2:-run}" = saver ]; then log="$(root_for run)/saver-log.txt"; else log="$(root_for "${2:-run}")/log.txt"; fi
  [ -f "$log" ] || { echo "no log yet: $log"; exit 0; }
  if [ -n "$FOLLOW" ]; then tail -n 40 -f "$log"; else tail -n 80 "$log"; fi
  exit 0
fi

if [ "$mode" = uninstall ]; then
  exe="$LOCAL/Programs/Wallpapers/Wallpapers.exe"
  [ -f "$exe" ] || { echo "nothing installed ($LAD\Programs\Wallpapers has no Wallpapers.exe)"; exit 0; }
  if [ -n "$DELETE_SETTINGS" ]; then flag=--delete-settings; else flag=--keep-settings; fi
  "$exe" --uninstall "$flag"
  echo "asked the installed app to uninstall ($flag); its log: %TEMP%\Wallpapers-uninstall.log"
  exit 0
fi

if [ "$mode" = reload ]; then
  flavor=${2:-dev}
  exe="$LOCAL/Wallpapers-build/$flavor/Wallpapers.exe"
  [ -f "$exe" ] || { echo "run.sh: nothing built for $flavor (make win-$flavor)" >&2; exit 1; }
  # The flavour is picked by WP_DEV, as when it started, so --reload finds the right app.
  export WSLENV="WP_DEV${WSLENV:+:$WSLENV}"
  if [ "$flavor" = dev ]; then export WP_DEV=1; else unset WP_DEV; fi
  "$exe" --reload
  tail -n 1 "$(root_for "$flavor")/log.txt" | tr -d '\r'
  exit 0
fi

BIN="$LOCAL/Wallpapers-build/$mode"
mkdir -p "$BIN"
export WSLENV="WP_DEV:WP_DEBUG:WP_WEB_ROOT:WP_FAKE_DISPLAYS/p${WSLENV:+:$WSLENV}"
if [ "$mode" = dev ]; then
  export WP_DEV=1 WP_DEBUG=1 WP_WEB_ROOT="$(win_path "$PWD/web")"
fi
LOG="$(root_for "$mode")/log.txt"
[ "$mode" = saver ] && LOG="$(root_for run)/saver-log.txt"
OUTPUT=$(mktemp)
trap 'rm -f "$OUTPUT"' EXIT
REPO=$PWD

# Copy the build over and start it. Returns 3 when Windows refused the exe.
launch() {
  cd "$REPO"
  [ -f "$DIST/Wallpapers.exe" ] || { echo "run.sh: no $DIST/Wallpapers.exe (make win-build)" >&2; return 1; }
  local src
  src=$(cd "$DIST" && pwd)
  cd "$BIN"
  # A running copy of this flavour locks its exe: ask it to quit, then wait for the file to come free.
  # Not for the saver: its folder is its own, and --quit would stop the run flavour's app wherever it runs from.
  if [ -f Wallpapers.exe ]; then
    [ "$mode" = saver ] || ./Wallpapers.exe --quit >/dev/null 2>&1 || true
    for _ in $(seq 1 20); do (: >> Wallpapers.exe) 2>/dev/null && break; sleep 0.5; done
  fi
  if command -v rsync >/dev/null; then
    rsync -a --delete "$src/" "$BIN/"
  else
    # Git Bash has no rsync: empty the folder, then copy.
    find "$BIN" -mindepth 1 -delete
    cp -a "$src/." "$BIN/"
  fi
  # Probe the new exe with a command that exits at once (nothing is running now): a refused
  # build says so here. (The real start below can't be captured: a GUI app started through
  # `cmd /c start` inherits the redirection and WSL would wait for it to exit.) The saver skips it
  # (the app may be running), and its Start-Process below says so instead.
  [ "$mode" = saver ] || ./Wallpapers.exe --quit > "$OUTPUT" 2>&1 || true
  # Refused builds show up as Windows' message, or (WSL interop, seen 2026-11-03) a bare EINVAL.
  if grep -qiE "Device Guard|Application Control|Invalid argument" "$OUTPUT"; then return 3; fi
  local before status=0
  before=$(stat -c %s "$LOG" 2>/dev/null || echo 0)
  if [ "$mode" = install ]; then
    # Through Start-Process and a wait on that process alone: the installed app it starts must not
    # inherit WSL's pipes, or this script would wait until that app quit.
    "$PS" -NoProfile -Command "\$p = Start-Process -FilePath '$(win_path "$BIN/Wallpapers.exe")' -WorkingDirectory '$(win_path "$BIN")' -ArgumentList '--install' -PassThru; \$null = \$p.Handle; \$p.WaitForExit(); exit \$p.ExitCode" < /dev/null || status=$?
    if [ $status != 0 ]; then
      echo "run.sh: --install failed (exit $status):" >&2
      tail -n 5 "$LOG" | tr -d '\r' >&2
      return 1
    fi
    echo "installed $LAD\Programs\Wallpapers"
    return 0
  fi
  if [ "$mode" = saver ]; then
    # Wait for the saver itself (a Start-Process wait on that one process, so WSL's pipes aren't inherited).
    # Its output is captured: Start-Process's error is where a refused build shows.
    echo "run.sh: the saver is running full screen; press a key or move the mouse to end it"
    "$PS" -NoProfile -Command "\$p = Start-Process -FilePath '$(win_path "$BIN/Wallpapers.exe")' -WorkingDirectory '$(win_path "$BIN")' -ArgumentList '/s' -PassThru; \$null = \$p.Handle; \$p.WaitForExit(); exit \$p.ExitCode" < /dev/null > "$OUTPUT" 2>&1 || status=$?
    tr -d '\r' < "$OUTPUT"
    if grep -qiE "Device Guard|Application Control|Invalid argument" "$OUTPUT"; then return 3; fi
    echo "run.sh: the saver ended (exit $status); the end of $LOG:"
    tail -n 40 "$LOG" 2>/dev/null | tr -d '\r' || true
    return 0
  fi
  if [ "$mode" = test ]; then
    echo "run.sh: self-testing $DIST/Wallpapers.exe"
    # shellcheck disable=SC2086
    ./Wallpapers.exe --selftest $WIN_ARGS || status=$?
  else
    # ShellExecute (Start-Process), so the app inherits none of WSL interop's pipes: with
    # `cmd /c start` it would, and this script would wait until the app quit.
    # --just-run: a build run from here never offers to install (make win-install does that).
    local args="'--just-run',"
    for a in $WIN_ARGS; do args="$args'$a',"; done
    "$PS" -NoProfile -Command "Start-Process -FilePath '$(win_path "$BIN/Wallpapers.exe")' -WorkingDirectory '$(win_path "$BIN")'${args:+ -ArgumentList ${args%,}}" < /dev/null
  fi
  if [ "$mode" = test ]; then
    local report
    report="$(root_for test)/selftest.txt"
    if [ -f "$report" ]; then tr -d '\r' < "$report"; else echo "run.sh: no selftest report (exit $status)" >&2; [ $status = 0 ] && status=1; fi
    return $status
  fi
  for _ in $(seq 1 16); do [ "$(stat -c %s "$LOG" 2>/dev/null || echo 0)" != "$before" ] && break; sleep 0.5; done
  if [ "$(stat -c %s "$LOG" 2>/dev/null || echo 0)" = "$before" ]; then
    echo "run.sh: Wallpapers.exe didn't start (no new log line in $LOG)" >&2
    return 1
  fi
  echo "started ($mode): log at $LOG"
}

for attempt in 1 2 3; do
  if [ -n "$BUILD" ]; then (cd "$REPO" && windows/build.sh) || exit 1; fi
  status=0
  launch || status=$?
  [ $status = 3 ] || exit $status
  if [ -z "$BUILD" ] || [ $attempt = 3 ]; then
    echo "run.sh: Smart App Control blocked this build. Build again (make win-build): every build is a new file to it." >&2
    exit 3
  fi
  echo "run.sh: Smart App Control blocked this build; building a new one (try $((attempt + 1)) of 3)"
done
