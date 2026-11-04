#!/bin/bash
# Builds the Windows app and zips it for a release (SPEC §10.25.15):
# dist/wallpapers-windows-<version>.zip and its .sha256. The zip holds one folder,
# Wallpapers\, with Wallpapers.exe (self-contained, unsigned: SPEC §10.25.13) and
# web\ beside it. It checks what it built before it zips, so a broken build never ships.
set -e
cd "$(dirname "$0")/.."
VERSION=$(node -p "require('./web/manifest.json').version")
OUT=dist/win
NAME="wallpapers-windows-$VERSION"
ZIP="dist/$NAME.zip"
fail() { echo "win-release: $1" >&2; exit 1; }

windows/build.sh

EXE="$OUT/Wallpapers.exe"
[ -f "$EXE" ] || fail "no $EXE"
# A 64-bit Windows exe: "MZ", then at the PE header (offset at 0x3C) "PE\0\0" and machine 0x8664.
[ "$(head -c 2 "$EXE")" = "MZ" ] || fail "$EXE isn't a Windows executable"
pe=$(od -An -tu4 -j 60 -N 4 "$EXE" | tr -d ' ')
[ "$(od -An -tx1 -j "$pe" -N 6 "$EXE" | tr -d ' \n')" = "504500006486" ] || fail "$EXE isn't a 64-bit (x64) executable"
# The version resource carries the manifest's version (build.sh stamps it; UTF-16 in the resource).
strings -el "$EXE" | grep -qx "$VERSION+[0-9]*" || fail "$EXE doesn't carry version $VERSION"
size=$(stat -c %s "$EXE")
[ "$size" -gt 20000000 ] || fail "$EXE is only $size bytes: not self-contained?"
[ -f "$OUT/web/index.html" ] || fail "no web/ beside the exe"
[ -f "$OUT/web/wallpapers/catalog.js" ] || fail "no catalog in web/"
for left in bing.json manifest.json app.webmanifest; do
  [ ! -e "$OUT/web/$left" ] || fail "web/$left must not ship (the app answers bing.json itself)"
done

STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
mkdir "$STAGE/Wallpapers"
cp -r "$EXE" "$OUT/web" "$STAGE/Wallpapers/"
cp LICENSE THIRD_PARTY.md "$STAGE/Wallpapers/"
rm -f "$ZIP" "$ZIP.sha256"
(cd "$STAGE" && zip -qr -9 "$OLDPWD/$ZIP" Wallpapers)
(cd dist && sha256sum "$NAME.zip" > "$NAME.zip.sha256")

# What a person gets: the zip is whole and has the exe and the pages where the app looks.
unzip -tq "$ZIP" >/dev/null || fail "$ZIP doesn't test clean"
listing=$(unzip -Z1 "$ZIP")
for want in Wallpapers/Wallpapers.exe Wallpapers/web/index.html Wallpapers/LICENSE; do
  grep -qx "$want" <<< "$listing" || fail "$ZIP has no $want"
done

echo "built $ZIP ($(du -h "$ZIP" | cut -f1)), $(cut -d' ' -f1 "$ZIP.sha256")"
