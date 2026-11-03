#!/bin/bash
# Phase W0 spikes (SPEC §10.25.21): build windows/spikes in WSL, copy it to
# %LOCALAPPDATA%\Wallpapers-spike on the Windows side, run it there with $ARGS,
# and bring its log and screenshots back to dist/win-spike/. Throwaway.
set -e
cd "$(dirname "$0")/../.."
DOTNET=${DOTNET:-dotnet}
OUT=dist/win-spike
"$DOTNET" publish windows/spikes -c Release -o "$OUT/bin" --nologo -v q -clp:NoSummary
CMD=/mnt/c/Windows/System32/cmd.exe
LAD=$("$CMD" /c echo %LOCALAPPDATA% 2>/dev/null | tr -d '\r')
# WSL interop sometimes fails for a moment ("Exec format error"): an empty answer here would put the
# Windows-side folder inside this checkout, so stop instead.
case "$LAD" in [A-Za-z]:\\*) ;; *) echo "run.sh: couldn't reach Windows (%LOCALAPPDATA% came back '$LAD'); try again" >&2; exit 1 ;; esac
WIN="$(wslpath "$LAD")/Wallpapers-spike"
mkdir -p "$WIN/bin"
# A running spike locks its exe: then this run (check, stop, …) uses the copy already there.
if /mnt/c/Windows/System32/tasklist.exe 2>/dev/null | grep -qiE '^spike\.(exe|scr) '; then
  echo "(Spike.exe is running: not replacing its files)"
else
  rsync -a --delete "$OUT/bin/" "$WIN/bin/"
  # W0.3: the saver will be the same exe renamed .scr; this is that stand-in.
  cp -f "$WIN/bin/Spike.exe" "$WIN/bin/Spike.scr"
fi
rsync -a --delete --exclude bing.json web/ "$WIN/web/"   # W0.2+: the pages, served at https://wallpapers.example/
cd "$WIN"
status=0
# shellcheck disable=SC2086
./bin/${SPIKE_EXE:-Spike.exe} $ARGS || status=$?
cd - >/dev/null
cp -f "$WIN"/*.png "$OUT/" 2>/dev/null || true
cp -f "$WIN/spike.log" "$OUT/" 2>/dev/null || true
exit $status
