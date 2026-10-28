# wallpapers: every task the project needs is a target here. Run `make` to list them.

.DEFAULT_GOAL := help
PORT ?= 8000

# Android: the SDK where Android Studio puts it, and its bundled JDK unless
# JAVA_HOME says otherwise. CI sets both.
ANDROID_HOME ?= $(HOME)/Library/Android/sdk
JAVA_HOME ?= $(shell /usr/libexec/java_home 2>/dev/null || echo "/Applications/Android Studio.app/Contents/jbr/Contents/Home")
export ANDROID_HOME JAVA_HOME
ADB ?= $(ANDROID_HOME)/platform-tools/adb
AVD ?= $(firstword $(shell $(ANDROID_HOME)/emulator/emulator -list-avds 2>/dev/null))
GRADLE = cd android && ./gradlew --quiet
APP = com.roadwaffle.wallpapers

.PHONY: help hooks serve serve-https cert bing-json thumbnails icons screenshots extension site android-build android-install android-logcat android-emulator android-release android-keystore android-bench jellyfin-media jellyfin-fixtures jellyfin-dev jellyfin-stop jellyfin-mock mac-build mac-run mac-dev mac-test mac-install mac-uninstall mac-release mac-saver-test mac-saver-live mac-saver-log docker-build docker-run lint audit audit-staged audit-history test smoke smoke-clock smoke-live bench bench-clock ci clean

help: ## List every target
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z0-9_-]+:.*## / {printf "  \033[36m%-17s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

hooks: ## Install git hooks: audit on commit, commit message and push
	git config core.hooksPath .githooks
	@echo "hooks installed from .githooks/"

serve-http: ## Serve web/ at http://localhost:8000 (PORT=, HOST=0.0.0.0 for the LAN)
	@PORT=$(PORT) node tools/serve.mjs

serve-https: ## Serve web/ over https at https://localhost:8443, making a self-signed cert if needed
	@PORT=$(or $(HTTPS_PORT),8443) HOST=0.0.0.0 node tools/serve.mjs --https

serve: serve-https


cert: ## Make a fresh self-signed dev certificate in .cert/ (localhost + LAN addresses)
	@node tools/serve.mjs --cert-only

bing-json: ## Fetch Bing's last eight images of the day into web/bing.json (for served pages)
	@node tools/bing.mjs

thumbnails: ## Regenerate the panel's wallpaper thumbnails (committed; review the changes)
	@node tools/thumbnails.mjs

icons: ## Render web/icons/icon.svg to the extension's and web app's PNGs (committed)
	@node tools/icons.mjs

screenshots: ## Render the README's screenshots into docs/ (committed; review the changes)
	@node tools/screenshots.mjs

extension: ## Build the Chrome extension: dist/extension/ (load unpacked) and a zip
	@node tools/build.mjs extension

site: ## Build the GitHub Pages site in dist/site/, with a fresh bing.json
	@node tools/build.mjs site

android-build: ## Build the Android debug APK (android/app/build/outputs/apk/debug/)
	$(GRADLE) assembleDebug
	@echo "android: android/app/build/outputs/apk/debug/app-debug.apk"

android-install: android-build ## Install the debug APK on the connected device or emulator and open it
	$(ADB) install -r android/app/build/outputs/apk/debug/app-debug.apk
	$(ADB) shell am start -n $(APP)/.SettingsActivity

android-logcat: ## Follow the app's log, including the page's console
	$(ADB) logcat -v brief 'Wallpapers:V' 'chromium:W' '*:S'

android-emulator: ## Boot the first Android emulator in the background (AVD= to pick one, EMULATOR_FLAGS=-no-window)
	@test -n "$(AVD)" || { echo "no emulator: make one in Android Studio's Device Manager"; exit 1; }
	@$(ANDROID_HOME)/emulator/emulator -avd "$(AVD)" -no-snapshot-save -no-boot-anim $(EMULATOR_FLAGS) >/dev/null 2>&1 &
	@$(ADB) wait-for-device shell 'while [ "$$(getprop sys.boot_completed)" != 1 ]; do sleep 1; done'
	@echo "android: $(AVD) is up"

android-release: ## Build the signed release APK into dist/ (needs WALLPAPERS_KEYSTORE and friends; see README)
	@test -n "$$WALLPAPERS_KEYSTORE" || { echo "android-release: set WALLPAPERS_KEYSTORE, WALLPAPERS_KEYSTORE_PASSWORD, WALLPAPERS_KEY_ALIAS, WALLPAPERS_KEY_PASSWORD"; exit 1; }
	$(GRADLE) assembleRelease
	@mkdir -p dist
	@cp android/app/build/outputs/apk/release/app-release.apk dist/wallpapers-$$(node -p "require('./web/manifest.json').version").apk
	@echo "android: dist/wallpapers-$$(node -p "require('./web/manifest.json').version").apk"

KEYSTORE ?= $(HOME)/.wallpapers-release.jks
android-keystore: ## Make the release signing key, outside the repo (KEYSTORE=, default ~/.wallpapers-release.jks); once, ever
	@test ! -e "$(KEYSTORE)" || { echo "$(KEYSTORE) exists; it signs every release, so it's never replaced"; exit 1; }
	"$(JAVA_HOME)/bin/keytool" -genkeypair -v -keystore "$(KEYSTORE)" -alias wallpapers -keyalg RSA -keysize 4096 -validity 36500 -dname "CN=Wallpapers"
	@echo "\nBack it up somewhere safe: losing it means users must uninstall to update."
	@echo "For CI: gh secret set WALLPAPERS_KEYSTORE_BASE64 < <(base64 -i \"$(KEYSTORE)\"), and set WALLPAPERS_KEYSTORE_PASSWORD, WALLPAPERS_KEY_ALIAS (wallpapers), WALLPAPERS_KEY_PASSWORD"

mac-build: ## Build the macOS app: dist/mac/Wallpapers.app (ARCHS="arm64 x86_64" for a universal build)
	@mac/build.sh

mac-run: mac-build ## Build and start the macOS app: the wallpaper goes behind your desktop icons, a menu bar item controls it
	@pkill -x Wallpapers 2>/dev/null || true
	@open dist/mac/Wallpapers.app

mac-dev: mac-build ## Run the macOS app straight from this checkout's web/ (edit, then reload from the menu bar item's Settings)
	@pkill -x Wallpapers 2>/dev/null || true
	@WP_WEB_ROOT="$(CURDIR)/web" WP_DEBUG=1 dist/mac/Wallpapers.app/Contents/MacOS/Wallpapers

mac-test: mac-build ## Run the macOS app's self-test against a throwaway settings store (about 30 s; shows a wallpaper behind your icons)
	@pkill -x Wallpapers 2>/dev/null || true
	@dist/mac/Wallpapers.app/Contents/MacOS/Wallpapers --selftest 2>/dev/null

mac-release: ## Build the universal macOS app and zip it: dist/wallpapers-mac-<version>.zip and .sha256 (ad-hoc signed, not notarized)
	@mac/release.sh

mac-install: mac-build ## Install the macOS app into ~/Applications
	@mkdir -p $(HOME)/Applications
	@rm -rf $(HOME)/Applications/Wallpapers.app
	@cp -R dist/mac/Wallpapers.app $(HOME)/Applications/
	@echo "installed ~/Applications/Wallpapers.app"

mac-uninstall: ## Stop and remove the macOS app (its settings stay in ~/Library/WebKit/com.roadwaffle.wallpapers.mac)
	@pkill -x Wallpapers 2>/dev/null || true
	@rm -rf $(HOME)/Applications/Wallpapers.app
	@echo "removed"

mac-saver-test: mac-build ## Load the built screen saver outside Apple's host and check its settings, choices, displays, clock and watchdog (about 1 min; shows a window)
	@swiftc -O -swift-version 5 mac/SaverHarness/main.swift -framework Cocoa -framework ScreenSaver -o dist/mac/SaverHarness
	@dist/mac/SaverHarness dist/mac/Wallpapers.saver 2>/dev/null

mac-saver-live: ## Run the installed screen saver in Apple's real host for a few seconds and read its log (needs it chosen in System Settings; shows the saver)
	@mac/saver-live.sh

mac-saver-log: ## Show the screen saver's own log (it writes inside the host's sandbox)
	@tail -40 "$(HOME)/Library/Containers/com.apple.ScreenSaver.Engine.legacyScreenSaver/Data/wallpapers-saver.log"

bench: ## Every wallpaper at every tier on a simulated phone (4× slower CPU): budgets, bench/results.json, the ⚡ badges (SPEC §4.8)
	node tools/bench.mjs

bench-clock: ## Just the clock overlay's cost: a bouncing clock with seconds against none (SPEC §4.9)
	@node tools/bench.mjs clock

android-bench: ## Each wallpaper at each tier on the connected device: frame times and battery (SPEC §4.8)
	@ADB="$(ADB)" node tools/android-bench.mjs

jellyfin-media: ## Generate made-up test videos and subtitles for the dev Jellyfin into .jellyfin/media/ (needs ffmpeg)
	@node tools/jellyfin-media.mjs

jellyfin-fixtures: ## Regenerate the smoke run's tiny Jellyfin clip and backdrop in tools/fixtures/jellyfin/ (committed)
	@node tools/jellyfin-media.mjs --fixture

jellyfin-dev: ## Run a throwaway Jellyfin in Docker at http://localhost:8096 on .jellyfin/media/, set up on first start
	@node tools/jellyfin-dev.mjs up

jellyfin-stop: ## Stop and remove the dev Jellyfin container (.jellyfin/ is kept)
	@node tools/jellyfin-dev.mjs down

jellyfin-mock: ## Serve the smoke run's fixture Jellyfin API at http://localhost:8097, for working without Docker
	@node tools/jellyfin-mock.mjs

docker-build: ## Build the container image (wallpapers:latest)
	docker build -t wallpapers .

docker-run: ## Run the container at http://localhost:8000 (PORT= to change)
	docker run --rm -it --read-only -p $(PORT):8000 --name wallpapers wallpapers

lint: ## Syntax-check every script and JSON file
	@node tools/lint.mjs

audit: ## Scan the working tree for anything private
	@node tools/audit.mjs --tree

audit-staged: ## Scan only what is staged for commit
	@node tools/audit.mjs --staged

audit-history: ## Scan every blob ever committed
	@node tools/audit.mjs --history

test: ## Run the unit tests
	@node --test 'tools/*.test.mjs'

smoke: extension ## Boot every wallpaper in headless Chrome (needs Chrome; CHROME_PATH to override)
	@node tools/smoke.mjs

smoke-clock: ## Just the clock overlay's checks in headless Chrome (SPEC §4.9)
	@node tools/smoke.mjs clock

smoke-live: ## Run the stage and player smoke suites against the deployed site, with real network (SMOKE_URL= to pick another)
	@SMOKE_URL=$(or $(SMOKE_URL),https://nealhardesty.github.io/wallpapers) node tools/smoke.mjs

ci: lint audit audit-history test smoke ## Everything CI runs

clean: ## Remove build output
	rm -rf dist android/build android/app/build
