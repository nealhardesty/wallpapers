#!/bin/sh
# Builds the universal macOS app and zips it for a release (SPEC §10.21):
# dist/wallpapers-mac-<version>.zip and its .sha256. The app is ad-hoc signed,
# not notarized (no paid developer account), and carries the screen saver.
# It checks what it built before it zips, so a broken build never ships.
set -e
cd "$(dirname "$0")/.."
VERSION=$(node -p "require('./web/manifest.json').version")
APP=dist/mac/Wallpapers.app
ZIP="dist/wallpapers-mac-$VERSION.zip"
fail() { echo "mac-release: $1" >&2; exit 1; }

ARCHS="arm64 x86_64" mac/build.sh

# Universal means both, for the app and for the saver it carries.
for binary in "$APP/Contents/MacOS/Wallpapers" "$APP/Contents/Resources/Wallpapers.saver/Contents/MacOS/WallpapersSaver"; do
  archs=$(lipo -archs "$binary")
  case "$archs" in *arm64*x86_64*|*x86_64*arm64*) ;; *) fail "$binary is $archs, not universal" ;; esac
done

# The version in both Info.plists is the manifest's, and the saver is the one the app expects.
for plist in "$APP/Contents/Info.plist" "$APP/Contents/Resources/Wallpapers.saver/Contents/Info.plist"; do
  [ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$plist")" = "$VERSION" ] || fail "$plist is not version $VERSION"
done
[ -f "$APP/Contents/Resources/web/index.html" ] || fail "no web/ in the app"
[ -f "$APP/Contents/Resources/Wallpapers.icns" ] || fail "no icon in the app"

codesign --verify --deep --strict "$APP" || fail "the app's signature is not valid"
codesign --verify --strict "$APP/Contents/Resources/Wallpapers.saver" || fail "the saver's signature is not valid"

rm -f "$ZIP" "$ZIP.sha256"
# ditto keeps the signature, symlinks and attributes that plain zip can lose.
ditto -c -k --sequesterRsrc --keepParent "$APP" "$ZIP"
(cd dist && shasum -a 256 "wallpapers-mac-$VERSION.zip" > "wallpapers-mac-$VERSION.zip.sha256")

# What a person gets: unzip somewhere else and check it still verifies.
CHECK=$(mktemp -d)
ditto -x -k "$ZIP" "$CHECK"
codesign --verify --deep --strict "$CHECK/Wallpapers.app" || fail "the unzipped app's signature is not valid"
rm -rf "$CHECK"

echo "built $ZIP ($(du -h "$ZIP" | cut -f1)), $(cut -d' ' -f1 "$ZIP.sha256")"
