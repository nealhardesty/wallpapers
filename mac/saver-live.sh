#!/bin/sh
# Runs the installed Wallpapers screen saver in Apple's real host (legacyScreenSaver)
# and reads what it logged: the frames it drew, the page it loaded, any recovery.
# It only works once Wallpapers is chosen in System Settings > Wallpaper > Screen Saver.
set -e
LOG="$HOME/Library/Containers/com.apple.ScreenSaver.Engine.legacyScreenSaver/Data/wallpapers-saver.log"
SECONDS_TO_RUN=${SECONDS_TO_RUN:-12}
[ -d "$HOME/Library/Screen Savers/Wallpapers.saver" ] || { echo "not installed: use the app's Screen Saver menu, or copy dist/mac/Wallpapers.saver into ~/Library/Screen Savers"; exit 1; }
pkill ScreenSaverEngine 2>/dev/null || true
pkill -x legacyScreenSaver 2>/dev/null || true
sleep 2
rm -f "$LOG"
open -a ScreenSaverEngine
sleep "$SECONDS_TO_RUN"
pkill ScreenSaverEngine 2>/dev/null || true
if [ ! -f "$LOG" ]; then
  echo "FAIL  the saver never started: choose Wallpapers in System Settings > Wallpaper > Screen Saver (under Other)"
  exit 1
fi
cat "$LOG" | cut -c1-200
grep -q "startAnimation" "$LOG" && echo "PASS  the host started it" || { echo "FAIL  the host never started it"; exit 1; }
