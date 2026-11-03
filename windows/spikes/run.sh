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
WIN="$(wslpath "$("$CMD" /c echo %LOCALAPPDATA% 2>/dev/null | tr -d '\r')")/Wallpapers-spike"
mkdir -p "$WIN/bin"
# A running spike locks its exe: then this run (check, stop, …) uses the copy already there.
if /mnt/c/Windows/System32/tasklist.exe /fi "imagename eq Spike.exe" 2>/dev/null | grep -qi spike.exe; then
  echo "(Spike.exe is running: not replacing its files)"
else
  rsync -a --delete "$OUT/bin/" "$WIN/bin/"
fi
rsync -a --delete --exclude bing.json web/ "$WIN/web/"   # W0.2+: the pages, served at https://wallpapers.example/
cd "$WIN"
status=0
# shellcheck disable=SC2086
./bin/Spike.exe $ARGS || status=$?
cd - >/dev/null
cp -f "$WIN"/*.png "$OUT/" 2>/dev/null || true
cp -f "$WIN/spike.log" "$OUT/" 2>/dev/null || true
exit $status
