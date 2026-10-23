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

.PHONY: help hooks serve serve-https cert bing-json thumbnails icons screenshots extension site android-build android-install android-logcat android-emulator android-release android-bench docker-build docker-run lint audit audit-staged audit-history test smoke ci clean

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

android-bench: ## Each wallpaper at each tier on the connected device: frame times and battery (SPEC §4.8)
	@ADB="$(ADB)" node tools/android-bench.mjs

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

ci: lint audit audit-history test smoke ## Everything CI runs

clean: ## Remove build output
	rm -rf dist android/build android/app/build
