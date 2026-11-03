#!/bin/bash
# Builds the Windows app (SPEC §10.25.15): dist/win/Wallpapers.exe, self-contained and single-file,
# with web/ beside it. Cross-compiles from WSL or Linux with the .NET 10 SDK.
set -e
cd "$(dirname "$0")/.."
DOTNET=${DOTNET:-dotnet}
OUT=dist/win
VERSION=$(node -p "require('./web/manifest.json').version")
# The build stamp makes every build's exe unique: Smart App Control judges unsigned exes by hash,
# so a refused build is fixed by building again (SPEC §10.25.13).
STAMP=$(date -u +%Y%m%d%H%M%S)
rm -rf "$OUT"
"$DOTNET" publish windows/Wallpapers -c Release -o "$OUT" --nologo -v q -clp:NoSummary \
  -p:Version="$VERSION" -p:InformationalVersion="$VERSION+$STAMP"
rm -f "$OUT"/*.pdb "$OUT"/*.xml
# The same web/ the other hosts ship, less the web manifests and bing.json (the app answers it natively).
rsync -a --exclude bing.json --exclude manifest.json --exclude app.webmanifest web/ "$OUT/web/"
echo "built $OUT/Wallpapers.exe $VERSION+$STAMP ($(du -m "$OUT/Wallpapers.exe" | cut -f1) MB)"
