#!/bin/sh
# Builds dist/mac/Wallpapers.app (SPEC §10.21). ARCHS="arm64 x86_64" for a universal build.
set -e
cd "$(dirname "$0")/.."
OUT=dist/mac
APP=$OUT/Wallpapers.app
VERSION=$(node -p "require('./web/manifest.json').version")
ARCHS=${ARCHS:-$(uname -m)}

rm -rf "$APP" "$OUT/obj"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources" "$OUT/obj"

for arch in $ARCHS; do
  swiftc -O -swift-version 5 -target "$arch-apple-macos14.0" -module-name Wallpapers \
    mac/Wallpapers/*.swift -o "$OUT/obj/Wallpapers-$arch"
done
lipo -create "$OUT"/obj/Wallpapers-* -output "$APP/Contents/MacOS/Wallpapers"

sed "s/__VERSION__/$VERSION/g" mac/Info.plist > "$APP/Contents/Info.plist"

# The same web/ the other hosts ship, less the two web manifests and bing.json
# (the app makes its own, like Android).
rsync -a --exclude bing.json --exclude manifest.json --exclude app.webmanifest web/ "$APP/Contents/Resources/web/"

# The screen saver (SPEC §10.21): a bundle Apple's host loads. It shares the
# app's asset server and power code, carries its own copy of web/, and is also
# kept inside the app, which installs it into ~/Library/Screen Savers.
SAVER="$OUT/Wallpapers.saver"
rm -rf "$SAVER"
mkdir -p "$SAVER/Contents/MacOS" "$SAVER/Contents/Resources"
for arch in $ARCHS; do
  swiftc -O -swift-version 5 -target "$arch-apple-macos14.0" -module-name WallpapersSaver \
    -emit-library -Xlinker -bundle -framework ScreenSaver -framework WebKit -framework Cocoa -framework IOKit \
    mac/Saver/*.swift mac/Wallpapers/AssetScheme.swift mac/Wallpapers/Power.swift -o "$OUT/obj/Saver-$arch"
done
lipo -create "$OUT"/obj/Saver-* -output "$SAVER/Contents/MacOS/WallpapersSaver"
BUILD=$(shasum -a 256 "$SAVER/Contents/MacOS/WallpapersSaver" | cut -c1-12)
sed -e "s/__VERSION__/$VERSION/g" -e "s/__BUILD__/$BUILD/g" mac/Saver/Info.plist > "$SAVER/Contents/Info.plist"
rsync -a --exclude bing.json --exclude manifest.json --exclude app.webmanifest --exclude thumb.webp web/ "$SAVER/Contents/Resources/web/"
# The picture beside its name in System Settings.
sips -s format png -z 116 180 web/wallpapers/fireflies/thumb.webp --out "$SAVER/Contents/Resources/thumbnail@2x.png" >/dev/null
sips -s format png -z 58 90 web/wallpapers/fireflies/thumb.webp --out "$SAVER/Contents/Resources/thumbnail.png" >/dev/null
codesign --force --sign - --identifier com.roadwaffle.wallpapers.mac.saver "$SAVER"
cp -R "$SAVER" "$APP/Contents/Resources/Wallpapers.saver"

# The icon, from the same artwork as the others.
ICONS="$OUT/obj/Wallpapers.iconset"
mkdir -p "$ICONS"
for size in 16 32 128 256 512; do
  sips -z $size $size web/icons/icon-512.png --out "$ICONS/icon_${size}x${size}.png" >/dev/null
done
for size in 16 32 128 256; do cp "$ICONS/icon_$((size*2))x$((size*2)).png" "$ICONS/icon_${size}x${size}@2x.png" 2>/dev/null || true; done
cp "$ICONS/icon_512x512.png" "$ICONS/icon_256x256@2x.png"
iconutil -c icns "$ICONS" -o "$APP/Contents/Resources/Wallpapers.icns"

# Ad-hoc signed (no paid developer account): runs on the Mac that built it,
# and anywhere once the quarantine flag is cleared (README).
codesign --force --sign - --options runtime --identifier com.roadwaffle.wallpapers.mac "$APP"
echo "built $APP ($VERSION, $ARCHS)"
