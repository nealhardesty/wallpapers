# Windows Phase W1 (Desktop Core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Windows 11 app, built in WSL, that runs the `web/` wallpapers live behind the desktop icons on every monitor (Same mode), controlled from a tray icon. It has a settings window, answers `bing.json` natively, survives Explorer restarts without reloading the page, leaves no stale frame when it quits or crashes, and proves itself with `--selftest`.

**Architecture:** Three projects in `windows/`:
- `Wallpapers.Core` (net10.0, no Windows references): every decision that can be pure. Monitor layout and insets, desktop-shape detection from a window-tree snapshot, page URLs, settings, the rolling log, Bing's shape, the catalog model, Surprise Me. Unit-tested with xUnit in WSL and CI.
- `Wallpapers` (net10.0-windows, WinForms, single-file exe): the thin native shell. The desktop layer (`0x052C`, host windows inside `Progman`), WebView2 **visual hosting** with the controller parented to a hidden window of ours and the visual bound to the host through DirectComposition, the tray, the settings window and the self-test.
- `Wallpapers.Tests` (xUnit over Core).

`web/` gains two small, host-neutral additions: the `windows` host kinds and `?insets=`.

**Tech Stack:** .NET 10 SDK in WSL (`EnableWindowsTargeting=true`), C#, WinForms (`NotifyIcon`, `ContextMenuStrip`, forms), hand-written P/Invoke, DirectComposition by COM interop, `Microsoft.Web.WebView2` (core plus its WinForms control for the settings window), xUnit v3, Node 22 (web tests and smoke), bash and make.

**Spec:** `SPEC.md` §10.25 (W1 is in §10.25.16; the design is §10.25.4–.15; the W0 decisions are in §10.25.21), §4.2 and §4.3 (web params and host). Also read `docs/superpowers/plans/2026-11-03-windows-w0-spikes.md` *Progress* (every W0 decision), and the spike code in `windows/spikes/` (`Native.cs`, `DesktopTree.cs`, `Host.cs`, `Layer.cs`, `Dcomp.cs`, `Web.cs`, `Shell.cs`) as working reference. W1 rewrites it properly; it does not copy the spike's shortcuts.

## Global Constraints

- **Host page:** `https://wallpapers.example/index.html?host=windows&insets=t,r,b,l` for desktop surfaces; the settings window uses `?host=windows&panel=open`. Virtual host `wallpapers.example` maps to the web folder with `CoreWebView2HostResourceAccessKind.Deny`.
- **Web root:** `<exe dir>\web` by default. `WP_WEB_ROOT` overrides it (dev). It must contain `index.html`, or the app logs the reason, shows a tray balloon and draws nothing (it never leaves a black desktop).
- **Data roots (per user):** installed or run: `%LOCALAPPDATA%\Wallpapers\`; dev (`WP_DEV=1`): `%LOCALAPPDATA%\Wallpapers-dev\`; self-test: `%LOCALAPPDATA%\Wallpapers-test\` (wiped at the start of every self-test). Each root holds `WebView2\` (the user data folder), `settings.json`, `log.txt` (+ `log.old.txt`, rolling at 1 MB).
- **WebView2 environment:** one per process, user data folder `<root>\WebView2`, **browser arguments `""`**, declared once as `WebFactory.BrowserArgs`; the saver (W5) must match it exactly or `CreateAsync` fails with `0x8007139F`. DevTools only with `WP_DEBUG=1`.
- **Desktop surfaces (W0 decisions):** visual hosting (`CreateCoreWebView2CompositionControllerAsync`). The controller is parented to a **hidden top-level window of ours, one per surface** (survives Explorer). The DirectComposition visual is bound to the host with topmost `true`. `RasterizationScale = monitorDpi / 96` set explicitly, with `ShouldDetectMonitorScaleChanges = false` and `BoundsMode = UseRawPixels`. `DefaultBackgroundColor` is black. **`IsMuted = true`**. `wp:hinted` is pre-set by a document-created script. On every controller creation and every 5 s: WebView2's top-level `Chrome_WidgetWin_1` windows in the environment's process ids get `WS_EX_TRANSPARENT` added.
- **Behind the icons (W0.1):** raised layout → `0x052C (0xD, 1)` to `Progman` only if its `WorkerW` child is missing, then wait ≤ 2 s. The host is created with `CreateWindowEx` directly as a child of `Progman`: `WS_CHILD|WS_VISIBLE|WS_CLIPCHILDREN|WS_CLIPSIBLINGS`, `WS_EX_LAYERED|WS_EX_NOACTIVATE`, alpha 255. Then `SetWindowPos(host, DefView, …)`. Classic layout → child of the back `WorkerW` (layered). Layout detection only considers Explorer's (Progman's pid) **visible** `WorkerW`s. The host window class is `WallpapersHost`.
- **Explorer restart:** the host dies with Explorer. On `TaskbarCreated` (a hidden **top-level** window, not `HWND_MESSAGE`) or a dead parent (5 s timer), re-detect, re-create hosts, and **re-bind each surface's visual** (`SetRoot(null)` on the old target, a new target on the new host, `Commit`), with no reload.
- **Quit, crash, logoff:** destroy hosts and close controllers. Then `SPI_GETDESKWALLPAPER` → if non-empty, `SPI_SETDESKWALLPAPER` with the same path and flags `0`; an empty path is skipped and logged. This runs on Quit, `Application.ThreadException`, `AppDomain.UnhandledException` and `WM_ENDSESSION`.
- **Never** change the user's wallpaper or saver setting, steal focus, appear in Alt-Tab or the taskbar (except the settings window while it's open), or show a console.
- **Process:** PerMonitorV2 DPI (manifest + `ApplicationHighDpiMode`). The manifest declares Win8–11 `supportedOS`, `asInvoker`. A single instance per data root (named mutex + pipe). The exe icon and tray icon come from `web/icons/icon.svg`.
- **Packaging:** self-contained, single-file, win-x64, `-p:Version=` from `web/manifest.json`; `web/` copied beside the exe minus `bing.json`, `manifest.json`, `app.webmanifest`. No NuGet packages but `Microsoft.Web.WebView2` (app) and xUnit (tests). Pin versions exactly.
- **Repo rules (AGENTS.md):** every runnable thing is a `make` target with `## description` and a README Development row; CI calls make only; `make ci` passes (`win-unit` joins `ci` only when `dotnet` is found, otherwise it prints a skip line); no home paths, emails, user names or 32+ hex runs in committed files (`tools/audit.mjs`); no inline `<script>` in web pages; keep SPEC and README current. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Smart App Control** is on on the owner's PC: an unsigned build can be refused by hash. A `win-*` run that fails to start prints a hint ("Smart App Control may have blocked this build: rebuild after any change"), and the version's build metadata includes a build counter so a rebuild gets a new hash (`-p:InformationalVersion=<version>+<UTC yyyyMMddHHmmss>`).

## Review Focus

1. **The display changes under a running app** (RDP reconnect resized the screen mid-session on 2026-11-03; also DPI or taskbar moves). Expected: within ~1 s every surface matches the new monitor rect, scale and insets, with no half-drawn host. *(Task 6: debounced rebuild on `WM_DISPLAYCHANGE`, `WM_DPICHANGED`, `WM_SETTINGCHANGE/SPI_SETWORKAREA`; Task 3 tests the 2940×1686 → 2940×1844 fixture pair; Task 10 by hand: reconnect RDP.)*
2. **Explorer isn't there** (at login, mid-restart, or crashed for good). Expected: no crash; attach retries with backoff for 60 s, then waits for `TaskbarCreated`; the tray works throughout. *(Task 4: `DesktopShape.Detect` returns `NoShell` for an empty tree; Task 6: an attach-retry unit-free path is exercised by self-test check 8's simulated layer loss.)*
3. **The renderer dies** (`ProcessFailed`: renderer or GPU process exited, or browser process gone). Expected: logged; the page reloads (renderer) or the surface is recreated (browser); never a frozen or black desktop left unattended. *(Task 6 handles `ProcessFailed`; Task 9's check 9 crashes the renderer with the DevTools `Page.crash` method and expects animation again within 5 s.)*
4. **The web root is wrong or missing** (`WP_WEB_ROOT` typo, a zip extracted without `web\`). Expected: a log line and a tray balloon naming the folder; no surfaces; the tray still offers Quit and Open Log Folder. *(Task 5: `AppPaths.CheckWebRoot` unit test; Task 9 self-test runs with a bad root as one check.)*
5. **The user's wallpaper is a solid colour or slideshow** (empty `SPI_GETDESKWALLPAPER`). Expected: quit and crash cleanup skip the repaint, log it, and never set `""`. *(Task 6: `Shell.RepaintArgs` in Core decides, with a unit test.)*

---

## File Structure

```
windows/
  Directory.Build.props        shared: LangVersion latest, Nullable, ImplicitUsings, TreatWarningsAsErrors, deterministic
  build.sh                     publish the exe to dist/win/ + copy web/ (version from web/manifest.json)
  run.sh                       win-run / win-dev / win-test / win-log: copy to the Windows side and run (replaces spikes/run.sh)
  Wallpapers.Core/
    Wallpapers.Core.csproj     net10.0
    Geometry.cs                Rect, Insets, Monitor
    Layout.cs                  monitors → SurfacePlan list (Same mode), insets in CSS px
    DesktopShape.cs            window-tree snapshot → Raised | Classic | NotSplit | NoShell, + attach target, z check
    PageUrl.cs                 desktop and settings URLs, origin constants
    AppSettings.cs             settings.json load/save with defaults, corrupt-file handling
    RollingLog.cs              append with a 1 MB roll to .old
    BingArchive.cs             Bing archive JSON → tools/bing.mjs's shape
    Catalog.cs                 the page's catalog JSON → entries; Surprise Me
    Repaint.cs                 RepaintArgs: what quit cleanup re-applies (or skips)
  Wallpapers.Tests/
    Wallpapers.Tests.csproj    net10.0, xunit.v3
    *Tests.cs                  one file per Core file
    Fixtures/                  displays-*.json, tree-*.json, bing-archive.json
  Wallpapers/
    Wallpapers.csproj          net10.0-windows, WinExe, WinForms, single-file
    app.manifest               PerMonitorV2, Win8–11 supportedOS, asInvoker
    app.ico                    from make icons
    Program.cs                 modes: run · --selftest · --dump-displays · --quit · --settings
    App.cs                     ApplicationContext: startup, single instance, cleanup wiring, message window
    AppPaths.cs                data root (flavour), web root check, files
    Log.cs                     the app's logger over Core.RollingLog
    Native.cs                  P/Invoke
    SingleInstance.cs          named mutex + pipe (settings / quit commands)
    DesktopLayer.cs            snapshot → Core.DesktopShape; 0x052C; create/place/destroy hosts; z repair; draw-above mode
    Dcomp.cs                   DirectComposition interop (from the spike, with detach-or-replace BindTo)
    WebFactory.cs              the environment, BrowserArgs, per-webview setup (host mapping, policies, bing, console, hinted, mute)
    BingJson.cs                fetch + 1 h cache, via Core.BingArchive
    Surface.cs                 one monitor: keeper window, composition controller, visual, page, visibility, power, rebind
    Desktop.cs                 surfaces per monitor, rebuild on display change, Explorer restart, overlay fix, pause, page calls
    Shell.cs                   repaint, open folder, open browser
    Tray.cs                    NotifyIcon + menu (W1 items), tooltip, thumbnails
    SettingsWindow.cs          the panel in a normal window
    SelfTest.cs                --selftest checks
tools/icons.mjs                + windows/Wallpapers/app.ico (PNG-in-ICO, 16–256)
web/core/wp.js                 + WP.hostKind, WP.parseInsets, 'insets' in WP.PARAMS
web/core/player.js, stage.js   use them; stageUrl passes insets
tools/wp.test.mjs, tools/smoke.mjs   + tests
Makefile, README.md, SPEC.md, .github/workflows/ci.yml, .gitignore
windows/spikes/                deleted in Task 10 (results live in SPEC §10.25.21)
```

---

### Task 1: Web: `windows` host kinds and `?insets=`

**Files:**
- Modify: `web/core/wp.js` (PARAMS, two functions), `web/core/player.js:10-12,98,48-52`, `web/core/stage.js:92-102`
- Test: `tools/wp.test.mjs`, `tools/smoke.mjs` (player suite)
- Docs: `SPEC.md` §4.2 table, §4.3 `kind` and `insets` lines

**Interfaces:**
- Produces: `WP.hostKind(params, protocol) -> 'android'|'windows'|'windows-saver'|'extension'|'standalone'` (extension when `protocol === 'chrome-extension:'`, whatever the param says); `WP.parseInsets(text, kind) -> { top, right, bottom, left }` (non-negative integers; Android's default is `{0,0,48,0}`, everyone else's is zeros; a valid `insets` param wins on any host; anything malformed falls back to the default).
- Produces: `'insets'` in `WP.PARAMS`. The player's `stageUrl` copies `insets` to the stage. The stage builds `host.insets` from `WP.parseInsets(params.insets, kind)`. The clock view gets the same insets.

- [ ] **Step 1: Write the failing unit tests** in `tools/wp.test.mjs`:
```js
test('host kind: android, windows, the saver, the extension, else standalone', () => {
    assert.equal(WP.hostKind({ host: 'android' }, 'file:'), 'android');
    assert.equal(WP.hostKind({ host: 'windows' }, 'https:'), 'windows');
    assert.equal(WP.hostKind({ host: 'windows-saver' }, 'https:'), 'windows-saver');
    assert.equal(WP.hostKind({ host: 'windows' }, 'chrome-extension:'), 'extension');
    assert.equal(WP.hostKind({}, 'file:'), 'standalone');
    assert.equal(WP.hostKind({ host: 'mac' }, 'https:'), 'standalone');
});
test('insets: t,r,b,l in CSS px on any host; Android keeps its 48 px default', () => {
    assert.deepEqual(plain(WP.parseInsets('0,0,48,0', 'windows')), { top: 0, right: 0, bottom: 48, left: 0 });
    assert.deepEqual(plain(WP.parseInsets('12,0,0,40', 'standalone')), { top: 12, right: 0, bottom: 0, left: 40 });
    assert.deepEqual(plain(WP.parseInsets(undefined, 'android')), { top: 0, right: 0, bottom: 48, left: 0 });
    assert.deepEqual(plain(WP.parseInsets('0,0,24,0', 'android')), { top: 0, right: 0, bottom: 24, left: 0 });
    for (const bad of ['', '1,2,3', '1,2,3,x', '-1,0,0,0', '0,0,9999,0'])
        assert.deepEqual(plain(WP.parseInsets(bad, 'windows')), { top: 0, right: 0, bottom: 0, left: 0 }, bad);
    assert.deepEqual(plain(WP.parseInsets('0, 0, 48.6, 0', 'windows')), { top: 0, right: 0, bottom: 49, left: 0 });
});
```
  Malformed means: not exactly 4 comma-separated numbers, any negative, any above 2000. Fractions round.
- [ ] **Step 2: Run `make test`.** Expected: these two FAIL (`WP.hostKind is not a function`).
- [ ] **Step 3: Implement** both in `wp.js`, add `'insets'` to `WP.PARAMS`. Use them in `player.js` (`host`, the clock's `insets`, `stageUrl` copying `insets`) and `stage.js` (`kind`, `host.insets`). Keep `settingsScreen` Android-only.
- [ ] **Step 4: Run `make test`.** Expected: all pass (230+).
- [ ] **Step 5: Add a smoke check** in `playerSuite`, `'?insets= reaches the stage and the clock; host=windows is a kind'`: `fresh(${WEB}/index.html?w=harvest&host=windows&insets=0,0,48,0)`, `playerReady()`, then in the stage context `WP.host.insets.bottom === 48 && WP.host.kind === 'windows'`. Also check that `index.html?w=harvest` alone gives `insets.bottom === 0`.
- [ ] **Step 6: Run `make smoke`.** Expected: PASS, nothing else regresses. Look at `dist/smoke/` for harvest: the ground line clears the bottom 48 px.
- [ ] **Step 7: Docs.** SPEC §4.2 table: add a row `` | `insets=t,r,b,l` | CSS px kept clear on each edge (any host; Windows passes its taskbar), e.g. `?w=harvest&insets=0,0,48,0` | `` and extend the `host=` row with `host=windows`, `host=windows-saver`. §4.3: `kind: 'standalone' | 'extension' | 'android' | 'windows' | 'windows-saver'`, insets comment "Android's gesture bar, Windows' taskbar (?insets=)". Mark §10.25.7 items 1–2 *(built in W1)*.
- [ ] **Step 8: Commit** `web: windows host kinds and ?insets= (SPEC §10.25.7 1–2)`.

---

### Task 2: The `windows/` skeleton, build, unit-test targets and CI

**Files:**
- Create: `windows/Directory.Build.props`, `windows/Wallpapers.Core/Wallpapers.Core.csproj`, `windows/Wallpapers.Core/PageUrl.cs`, `windows/Wallpapers.Tests/Wallpapers.Tests.csproj`, `windows/Wallpapers.Tests/PageUrlTests.cs`, `windows/Wallpapers/Wallpapers.csproj`, `windows/Wallpapers/app.manifest`, `windows/Wallpapers/Program.cs` (stub: logs its version and exits 0), `windows/build.sh`, `windows/run.sh`
- Modify: `tools/icons.mjs` (+ `windows/Wallpapers/app.ico`), `Makefile`, `.gitignore` (`windows/**/bin/`, `windows/**/obj/` are already there), `.github/workflows/ci.yml`, `README.md` (Development rows and requirements)

**Interfaces:**
- Produces: `PageUrl.Origin = "https://wallpapers.example/"`, `PageUrl.HostName = "wallpapers.example"`, `PageUrl.Desktop(Insets insets) -> string`, `PageUrl.Settings() -> string`. `Insets` is a record in `Geometry.cs` (Task 3 fills it in; declare `record Insets(int Top, int Right, int Bottom, int Left) { string ToParam() => $"{Top},{Right},{Bottom},{Left}"; }` here).
- Produces: make targets `win-build` (`windows/build.sh` → `dist/win/Wallpapers.exe` + `dist/win/web/`), `win-unit` (`dotnet test windows/Wallpapers.Tests`), `win-run`, `win-dev`, `win-test`, `win-log` (all through `windows/run.sh <mode>`; `win-dev` and `win-test` are wired in Tasks 9–10 but the target exists now and prints "not built yet" until then).
- Produces: `run.sh` facts reused later. Find `%LOCALAPPDATA%` via `cmd.exe /c echo` with full paths and **abort if the answer isn't a drive path** (W0 lesson). The per-mode Windows folders: `win-run` → binaries in `%LOCALAPPDATA%\Wallpapers-build\run\`, data root `Wallpapers`; `win-dev` → `Wallpapers-build\dev\`, `WP_DEV=1`, `WP_DEBUG=1`, `WP_WEB_ROOT=<wslpath -w of this checkout's web>`; `win-test` → `Wallpapers-build\test\`, `--selftest`. Before copying, ask any running instance of that flavour to quit (`Wallpapers.exe --quit`, ignore failure), so the exe isn't locked. GUI exes are started detached (`cmd.exe /c start "" /d <dir> Wallpapers.exe …`) except `win-test`, which waits and prints `selftest.txt`.

- [ ] **Step 1: Pin versions.** Query nuget.org for the latest **stable** `xunit.v3`, `xunit.runner.visualstudio`, `Microsoft.NET.Test.Sdk`, and confirm `Microsoft.Web.WebView2` `1.0.4314.35` (matches runtime 156). Write them exactly into the csprojs. Query GitHub for the current major of `actions/setup-dotnet`.
- [ ] **Step 2: Write the failing test** `PageUrlTests`:
```csharp
[Fact] public void Desktop_carries_host_and_insets() =>
    Assert.Equal("https://wallpapers.example/index.html?host=windows&insets=0,0,24,0", PageUrl.Desktop(new Insets(0, 0, 24, 0)));
[Fact] public void Settings_opens_the_panel() =>
    Assert.Equal("https://wallpapers.example/index.html?host=windows&panel=open", PageUrl.Settings());
```
- [ ] **Step 3: Run `make win-unit`.** Expected: a compile FAIL (`PageUrl` missing).
- [ ] **Step 4: Implement `PageUrl`** and the minimal projects. `Directory.Build.props`: `LangVersion latest`, `Nullable enable`, `ImplicitUsings enable`, `TreatWarningsAsErrors true`, `Deterministic true`, `EnableWindowsTargeting true`. App csproj: `WinExe`, `net10.0-windows`, `UseWindowsForms true`, `ApplicationHighDpiMode PerMonitorV2`, `ApplicationManifest app.manifest`, `ApplicationIcon app.ico`, `RuntimeIdentifier win-x64`, `SelfContained true`, `PublishSingleFile true`, `IncludeNativeLibrariesForSelfExtract true`, `InvariantGlobalization true`, `AllowUnsafeBlocks true`, and a ProjectReference to Core.
- [ ] **Step 5: Run `make win-unit`.** Expected: PASS (2 tests).
- [ ] **Step 6: `app.ico`.** Extend `tools/icons.mjs` to also write `windows/Wallpapers/app.ico`: PNG-compressed ICO with sizes 16, 20, 24, 32, 40, 48, 64, 256, from the same SVG renders (ICONDIR 6 bytes + 16-byte ICONDIRENTRY each, width/height byte 0 meaning 256, then the PNG blobs). Run `make icons`; the existing PNGs must show `unchanged`.
- [ ] **Step 7: `build.sh` and `run.sh`, then run `make win-build && make win-run`.** Expected: `dist/win/Wallpapers.exe` (about 70 MB) and `dist/win/web/index.html` exist. `win-run` starts it on Windows; the stub writes `log.txt` with `Wallpapers <version>` and exits; `make win-log` shows that line.
- [ ] **Step 8: Wire `ci`.** In the Makefile, set `DOTNET_FOUND := $(shell command -v $(DOTNET) 2>/dev/null)`. `ci` becomes `lint audit audit-history test win-ci smoke`, where `win-ci` runs `win-unit` if `DOTNET_FOUND`, else prints `win-unit: skipped (no dotnet; see README)`. In `ci.yml` (job `ci`), add `actions/setup-dotnet@<current major>` with `dotnet-version: 10.0.x` before `make ci`, and a `make win-build` step after it. Add the README rows (`win-build`, `win-unit`, `win-run`, `win-dev`, `win-test`, `win-log`) and the requirement "`.NET 10 SDK`, for the Windows app (WSL or Linux is fine: it cross-compiles)".
- [ ] **Step 9: Run `make ci`.** Expected: green, including `win-unit`.
- [ ] **Step 10: Commit** `Windows W1: project skeleton, build and unit-test targets, app icon, CI`.

---

### Task 3: Core: monitors → surfaces and insets, plus `--dump-displays`

**Files:**
- Create: `windows/Wallpapers.Core/Geometry.cs`, `windows/Wallpapers.Core/Layout.cs`, `windows/Wallpapers.Tests/LayoutTests.cs`, `windows/Wallpapers.Tests/Fixtures/displays-*.json`
- Modify: `windows/Wallpapers/Program.cs`, `windows/Wallpapers/Native.cs` (monitor enumeration)

**Interfaces:**
- Produces (Core): `record Rect(int Left, int Top, int Right, int Bottom) { int Width; int Height; bool Contains(int x, int y); }`; `record Monitor(string Device, Rect Bounds, Rect Work, int Dpi, bool Primary)`; `record SurfacePlan(string Key, string Device, Rect Bounds, double Scale, Insets Insets)`; `static class Layout { IReadOnlyList<SurfacePlan> Plan(IReadOnlyList<Monitor> monitors); Insets InsetsFor(Monitor m); }`; `static class Displays { IReadOnlyList<Monitor> FromJson(string json); string ToJson(IReadOnlyList<Monitor>); }`.
- Rules: one plan per monitor, primary first, then left-to-right, top-to-bottom. `Scale = Dpi / 96.0`. Insets per side = `round((monitor edge − work edge) / Scale)` in CSS px (a taskbar on any edge; auto-hide → 0). `Key` = `Device` for W1 (W2 replaces it with stable display keys).
- Produces (app): `Wallpapers.exe --dump-displays` writes the JSON (`Displays.ToJson` of the live monitors: `MONITORINFOEX` + `GetDpiForMonitor`) to `<root>\displays.json` and logs it.

- [ ] **Step 1: Write the fixtures.** `displays-rdp-200.json` (today's: one monitor 0,0,2940,1686, work 0,0,2940,1590, dpi 192); `displays-rdp-200-resized.json` (2940×1844, work height 1748); `displays-side-by-side.json` (2560×1440 @96 primary + 1920×1080 @96 to its right, taskbar on the primary only); `displays-negative-origin.json` (secondary left of and above primary: −1920,−300); `displays-mixed-dpi.json` (laptop 2880×1800 @192 primary + 2560×1440 @96); `displays-taskbar-edges.json` (four monitors with the taskbar left, top, right, and one auto-hide).
- [ ] **Step 2: Write the failing tests** (`LayoutTests`):
  - `Rdp_200_percent_insets_are_css_px`: plan[0].Insets == `new Insets(0,0,48,0)`, Scale 2.0, Bounds == monitor.
  - `Resized_rdp_session_gets_new_bounds_and_same_insets`: 2940×1844, bottom inset 48.
  - `Side_by_side_primary_first_and_taskbar_only_where_it_is`: the secondary's insets are all 0.
  - `Negative_origin_keeps_physical_bounds`: Bounds.Left == −1920.
  - `Mixed_dpi_scales_per_monitor`: Scale 2.0 and 1.0; a 96 px taskbar on the 192 dpi monitor gives a 48 CSS px inset.
  - `Taskbar_on_each_edge_and_auto_hide`: left → (0,0,0,48)'s left = 48 etc., auto-hide → all 0.
  - `Displays_json_round_trips`.
- [ ] **Step 3: Run `make win-unit`.** Expected: FAIL (types missing).
- [ ] **Step 4: Implement `Geometry.cs`, `Layout.cs`, `Displays`.**
- [ ] **Step 5: Run `make win-unit`.** Expected: PASS.
- [ ] **Step 6: Implement `--dump-displays`** in the app; run it on Windows (`WIN_ARGS=--dump-displays make win-run`, or the equivalent `run.sh` mode). Expected: `displays.json` equal in shape to `displays-rdp-200*.json` with today's live numbers. If they differ, the live capture is the truth: add it as `displays-live-rdp.json` with a test.
- [ ] **Step 7: Commit** `Windows W1: Core layout and insets per monitor; --dump-displays`.

---

### Task 4: Core desktop shape, and the app's desktop layer

**Files:**
- Create: `windows/Wallpapers.Core/DesktopShape.cs`, `windows/Wallpapers.Tests/DesktopShapeTests.cs`, `windows/Wallpapers.Tests/Fixtures/tree-*.json`, `windows/Wallpapers/Native.cs`, `windows/Wallpapers/DesktopLayer.cs`
- Modify: `windows/Wallpapers/Program.cs` (`--dump-displays` also writes the tree)

**Interfaces:**
- Produces (Core): `record WindowNode(long Handle, long Parent, string Class, int Pid, bool Visible, Rect Bounds, int Z)` (Z = index among its siblings, 0 = top); `enum ShapeKind { Raised, Classic, NotSplit, NoShell }`; `record Shape(ShapeKind Kind, long Progman, long DefView, long Layer)` (Layer = the wallpaper `WorkerW`: Progman's child in Raised, the back top-level one in Classic, 0 if missing); `static class DesktopShape { Shape Detect(IReadOnlyList<WindowNode> tree); bool NeedsLayerMessage(Shape s); (long parent, long insertAfter) AttachTarget(Shape s); bool ZOk(Shape s, IReadOnlyList<long> parentChildrenTopFirst, long host); }`. `AttachTarget`: Raised → (Progman, DefView); Classic → (Layer, HWND_TOP = 0); others → (0, 0).
- Produces (app): `sealed class DesktopLayer : IDisposable` with:
  - `Shape Shape { get; }`
  - `bool Prepare()`: snapshot, `0x052C` if `NeedsLayerMessage`, wait ≤ 2 s; true when the shape is Raised or Classic with a Layer.
  - `IntPtr CreateHost(SurfacePlan plan)`: class `WallpapersHost`; position = plan bounds mapped into the parent's client coords.
  - `bool CheckAndRepair(IntPtr host)`
  - `bool ParentAlive`
  - `void DestroyHost(IntPtr host)`
  - `bool DrawAboveIcons` (the escape hatch: hosts become top-level `WS_POPUP`, `WS_EX_NOACTIVATE|WS_EX_TOOLWINDOW|WS_EX_LAYERED|WS_EX_TRANSPARENT`, placed directly above `Progman` in the z-order)
  - `event Action? ShellRestarted` (from `TaskbarCreated` on its hidden top-level message window)

- [ ] **Step 1: Write the fixtures** from W0.1's dumps (SPEC §10.25.21; use small fake handles, no real ones):
  - `tree-raised-before.json`: Progman > DefView > SysListView32, plus Explorer's hidden 198×56 `WorkerW`s and other processes' 324×88 `WorkerW`s.
  - `tree-raised-after.json`: the same plus Progman > `WorkerW` z=1.
  - `tree-classic.json`: two full-screen top-level `WorkerW`s, the front one holding DefView.
  - `tree-not-split.json`: Progman > DefView, no `WorkerW` ever.
  - `tree-empty.json`.
- [ ] **Step 2: Write the failing tests** (`DesktopShapeTests`):
  - `Raised_before_the_message_needs_it`: Kind Raised, Layer 0, `NeedsLayerMessage` true.
  - `Raised_after_has_the_layer_and_targets_progman_below_defview`.
  - `Other_processes_tiny_workerws_are_ignored` (a classic-looking decoy with a foreign pid isn't taken as the layer).
  - `Classic_targets_the_back_workerw`.
  - `Not_split_has_no_target`.
  - `No_progman_is_no_shell`.
  - `ZOk`: the true case `DefView > host > WorkerW`, plus false cases (host above DefView; host below WorkerW).
- [ ] **Step 3: Run `make win-unit`.** Expected: FAIL.
- [ ] **Step 4: Implement `DesktopShape`.**
- [ ] **Step 5: Run `make win-unit`.** Expected: PASS.
- [ ] **Step 6: Implement `Native.cs` and `DesktopLayer`** (the spike's `DesktopTree`, `Host` and `Layer` as reference). The tree snapshot covers Progman, top-level `WorkerW`s and their descendants. `--dump-displays` also writes `tree.json` (classes, parents, pids, visibility, bounds, z; handles as small ordinals so fixtures are publishable).
- [ ] **Step 7: Run on Windows:** `--dump-displays` → `tree.json` matches `tree-raised-after.json`'s shape. Add it as a fixture test if it differs.
- [ ] **Step 8: Commit** `Windows W1: desktop shape detection (Core) and the desktop layer`.

---

### Task 5: App plumbing: paths, settings, log, single instance, program modes

**Files:**
- Create: `windows/Wallpapers.Core/AppSettings.cs`, `windows/Wallpapers.Core/RollingLog.cs`, `windows/Wallpapers.Core/Repaint.cs`, tests for each, `windows/Wallpapers/AppPaths.cs`, `windows/Wallpapers/Log.cs`, `windows/Wallpapers/SingleInstance.cs`, `windows/Wallpapers/App.cs`
- Modify: `windows/Wallpapers/Program.cs`

**Interfaces:**
- Produces (Core):
  - `record AppSettings(bool DrawAboveIcons = false, Rect? SettingsBounds = null) { static AppSettings Load(string path); void Save(string path); }`. A missing file → defaults. A corrupt file → defaults, and the file is kept as `settings.bad.json`. Writes go to a temp file, then `File.Move(overwrite)`.
  - `sealed class RollingLog(string path, long maxBytes = 1_048_576) { void Write(string line); }`: thread-safe; past `maxBytes` the file becomes `log.old.txt` (replacing any older one) and a new one starts.
  - `static class RepaintArgs { string? PathToReapply(string current); }`: null for empty or whitespace, the path otherwise.
- Produces (app):
  - `AppPaths { string Root, WebRoot, UserData, SettingsFile, LogFile; string Flavor; static AppPaths Resolve(string[] args); string? CheckWebRoot(); }`. `CheckWebRoot` returns the reason, or null when `index.html` exists.
  - `Log.Info/Warn/Error(string)`: timestamped, through `RollingLog`, plus `Debug.WriteLine`.
  - `SingleInstance.TryBecomeFirst(string flavor, Action<string> onCommand) -> bool`: mutex `Local\Wallpapers-<flavor>`, pipe `Wallpapers-<flavor>`; commands `settings`, `quit`, `reload`. `SingleInstance.Send(flavor, command) -> bool`.
  - Program modes: no args → app (a second launch sends `settings` and exits 0); `--quit` → send `quit`, exit 0 (also when none is running); `--settings`; `--dump-displays`; `--selftest`.

- [ ] **Step 1: Write the failing tests:** `AppSettingsTests` (defaults when missing; round trip; corrupt → defaults + `.bad` kept); `RollingLogTests` (rolls past max, keeps exactly one old file, concurrent writes don't interleave lines); `RepaintTests` (`""`, `"  "` → null; a path → itself).
- [ ] **Step 2: Run `make win-unit`.** Expected: FAIL.
- [ ] **Step 3: Implement the three in Core.**
- [ ] **Step 4: Run `make win-unit`.** Expected: PASS.
- [ ] **Step 5: Implement the app side.** `App : ApplicationContext` owns startup order: paths → log → single instance → web root check (balloon on failure, see Task 7) → desktop (Task 6) → tray (Task 7). Crash wiring (`Application.ThreadException`, `AppDomain.UnhandledException`, `WM_ENDSESSION` on its message window) calls `App.Cleanup(reason)`, which is idempotent.
- [ ] **Step 6: Run on Windows:** `make win-run` twice in a row. Expected: the second launch exits at once; the log shows `second instance: settings`. Then `Wallpapers.exe --quit` ends the first, and the log shows `cleanup reason=quit`.
- [ ] **Step 7: Commit** `Windows W1: paths, settings, rolling log, single instance, program modes`.

---

### Task 6: Surfaces: WebView2 visual hosting on every monitor

**Files:**
- Create: `windows/Wallpapers.Core/BingArchive.cs` (+ test, fixture `bing-archive.json`), `windows/Wallpapers/Dcomp.cs`, `windows/Wallpapers/WebFactory.cs`, `windows/Wallpapers/BingJson.cs`, `windows/Wallpapers/Surface.cs`, `windows/Wallpapers/Desktop.cs`, `windows/Wallpapers/Shell.cs`
- Modify: `windows/Wallpapers/App.cs`

**Interfaces:**
- Consumes: `Layout.Plan`, `PageUrl.Desktop`, `DesktopLayer`, `AppPaths`, `RepaintArgs`.
- Produces (Core): `static class BingArchive { string Shape(string archiveJson, DateTimeOffset now); }`. It keeps `url, copyright, copyrightlink, startdate` per image, validates like `tools/bing.mjs` (`url` starts `/th?id=`, `startdate` is 8 digits), and emits `{ generated, images }`. It throws `FormatException` on anything else.
- Produces (app):
  - `WebFactory`: `const string BrowserArgs = ""`, `static Task<CoreWebView2Environment> CreateAsync(AppPaths)`, `static Task SetUpAsync(CoreWebView2 wv, AppPaths paths, bool desktop)`. Setup covers: the host mapping; `NavigationStarting` (allow only our origin and `about:`; any other http(s) opens the default browser and is cancelled); `NewWindowRequested` (handled, opened in the browser); `WebResourceRequested` for `https://wallpapers.example/bing.json` (answered by `BingJson`, with the response header `X-Wallpapers-Bing: native`); console errors and exceptions through the DevTools protocol (`Runtime.exceptionThrown`, `Runtime.consoleAPICalled` level error; everything with `WP_DEBUG`) into the log. For `desktop` it also does `wp:hinted` and `IsMuted = true`.
  - `BingJson { Task<(int status, string body)> GetAsync(); }`: `HttpClient` to `https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=8&mkt=en-US`, 10 s timeout, cached 1 h, 503 with `{"error":…}` on failure.
  - `Surface : IDisposable`:
    - `Surface(SurfacePlan plan, IntPtr host, CoreWebView2Environment env, AppPaths paths)`
    - `Task StartAsync()`: a keeper window, the composition controller on it, a `Dcomp` visual bound to the host, explicit scale, bounds = plan size, navigate.
    - `void Rebind(IntPtr newHost)`
    - `Task SetVisibleAsync(bool visible)`: `IsVisible` and `WP.power({ hidden: !visible })`.
    - `Task<string> EvalAsync(string js)`
    - `SurfacePlan Plan`, `IntPtr Host`, `CoreWebView2? Web`.
    - `ProcessFailed` handling: on a renderer exit or unresponsive renderer, `Reload()`; on a browser exit, raise `Lost` so `Desktop` recreates it.
  - `Desktop : IDisposable`:
    - `Task StartAsync()`: Prepare with backoff 1, 2, 4, 8, 15, 30 s up to 60 s total, then wait for `ShellRestarted`.
    - `void ScheduleRebuild()`: debounced 500 ms; disposes all surfaces and builds new ones from a fresh `Layout.Plan`.
    - `Task OnShellRestartedAsync()`: re-prepare, a new host per surface, `Rebind`.
    - A 5 s watch: parent alive, z repair, overlay fix.
    - `Task SetPausedAsync(bool)`, `bool Paused`.
    - `Task RunEverywhereAsync(string js)`, `Task<string> EvalFirstAsync(string js)`, `void ReloadAll()`, `IReadOnlyList<Surface> Surfaces`.
    - `void Dispose()`: destroy hosts, close controllers, `Shell.Repaint()`.
  - `Shell { static void Repaint(); static void Open(string pathOrUrl); }`.
- The overlay fix (constraint above) is in `Desktop`'s watch and after each `StartAsync`.

- [ ] **Step 1: Write the failing `BingArchiveTests`:**
  - `Keeps_only_what_the_wallpaper_uses` (from a fixture with extra fields; `generated` is ISO-8601 from the given `now`);
  - `Rejects_unexpected_entries` (a bad url, a bad date, no images).
- [ ] **Step 2: Run `make win-unit`.** Expected: FAIL.
- [ ] **Step 3: Implement `BingArchive`.**
- [ ] **Step 4: Run `make win-unit`.** Expected: PASS.
- [ ] **Step 5: Implement the app side** (`Dcomp.cs` from the spike with the detach-or-replace `BindTo`; `WebFactory`, `BingJson`, `Surface`, `Desktop`, `Shell`). `App` now builds the `Desktop` and listens for `WM_DISPLAYCHANGE`, `WM_DPICHANGED` and `WM_SETTINGCHANGE` with `SPI_SETWORKAREA` → `ScheduleRebuild()`.
- [ ] **Step 6: Run on Windows** (`make win-run`, desktop shown with the spike's trick: Win+D). Expected: the Seasonal wallpaper (Harvest in November) behind the icons; the ground line clears the taskbar (insets 0,0,48,0); the log shows the layout, each surface's plan, `overlay: made … click-through`, and no errors. Right-click on the desktop opens Explorer's menu on the first try.
- [ ] **Step 7: Explorer restart by hand** (owner go-ahead): restart Explorer (the spike's `restart-explorer`, or Task Manager → Restart). Expected: the log shows `shell restarted`, `rebind`, and **no reload**; the wallpaper keeps going within ~3 s; right-click works.
- [ ] **Step 8: Quit by hand** (`Wallpapers.exe --quit`). Expected: Windows' own picture is back, no stale frame, the log shows `repaint path=<set>`.
- [ ] **Step 9: Commit** `Windows W1: surfaces with visual hosting, bing.json, Explorer restarts, display rebuild, cleanup`.

---

### Task 7: The tray

**Files:**
- Create: `windows/Wallpapers.Core/Catalog.cs` (+ `CatalogTests`), `windows/Wallpapers/Tray.cs`
- Modify: `windows/Wallpapers/App.cs`

**Interfaces:**
- Consumes: `Desktop` (page calls, pause), `SettingsWindow.Show()` (Task 8; until then the item is disabled), `AppPaths`, `Log`.
- Produces (Core):
  - `record CatalogEntry(string Id, string Name, string Icon, bool Pseudo)`
  - `record CatalogInfo(string Current, IReadOnlyList<CatalogEntry> Entries) { static CatalogInfo Parse(string json); string NameOf(string id); }`
  - `static class Picker { string? Surprise(CatalogInfo c, Random rng); }`, which never picks the current wallpaper, a pseudo entry (Seasonal), `blank` or `jellyfin`.
- The page script (the Mac's, plus `pseudo`): `JSON.stringify({ current: WP.store.get('wp:current') || 'seasonal', entries: WP.catalog.filter(e => !e.disabled).map(e => ({ id: e.id, name: e.name, icon: e.icon, pseudo: !!e.pseudo })) })`.
- Thumbnails: the page renders each `wallpapers/<id>/thumb.webp` (when it exists) into a 64×36 canvas → PNG data URL, via `CallDevToolsProtocolMethodAsync("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })`. That's done once per catalog load and cached by id. A missing thumb → no image (the emoji stays in the text).
- The menu (W1 items only; the rest of §10.25.10 arrives with W2–W5):
```
<icon> <Name of what's showing>     (disabled header; "Paused" suffix when paused)
Wallpaper                       ▸   every non-disabled entry: "<icon>  <Name>", thumbnail, current ticked
Surprise Me
Next
Previous
───
Pause / Resume
───
Settings…
Troubleshooting                 ▸   Open Log Folder · Reload Wallpapers · Draw Above Icons (✓ when on) · Developer Tools (only with WP_DEBUG)
About Wallpapers <version>
Quit
```
  - Left and right click open the same menu (left via `NotifyIcon`'s private `ShowContextMenu`, found by reflection, falling back to `ContextMenuStrip.Show(Cursor.Position)`).
  - The tooltip is `Wallpapers: <Name>` (`· paused`), at most 63 characters.
  - Pick: `WP.player.show(id, { persist: true })` on every surface. Next/Previous: `WP.player.cycle(±1)`. Surprise: `Picker.Surprise` then a pick.
  - The menu reloads the catalog on `Opening`, so a pick made in the settings window shows up.
  - A failed web root or a NotSplit shape → `ShowBalloonTip` once, with the reason.
  - About → a message box with the version, the WebView2 runtime version and the data folder.

- [ ] **Step 1: Write the failing `CatalogTests`:**
  - `Parses_the_pages_catalog` (a fixture from the real page shape)
  - `Surprise_never_picks_current_pseudo_blank_or_jellyfin` (seeded `Random`, 200 draws)
  - `Surprise_returns_null_when_nothing_else_is_left`
- [ ] **Step 2: Run `make win-unit`.** Expected: FAIL.
- [ ] **Step 3: Implement `Catalog.cs`.**
- [ ] **Step 4: Run `make win-unit`.** Expected: PASS.
- [ ] **Step 5: Implement `Tray`.** *Draw Above Icons* is always available (it's the escape hatch, and testing it needs it on a working machine): ticking it saves `DrawAboveIcons` in `settings.json`, sets `DesktopLayer.DrawAboveIcons` and calls `Desktop.ScheduleRebuild()`; unticking reverses it.
- [ ] **Step 6: Run on Windows** (owner): every menu item. Expected: a pick changes the desktop within a second and survives a restart of the app (persisted); Next/Previous/Surprise work; Pause freezes the scene (the log shows `IsVisible=false`) and Resume restarts it; Reload reloads; Open Log Folder opens Explorer there; Draw Above Icons puts the scene over the icons (icons hidden behind it, clicks still reach them), and unticking it restores the normal layer; Quit cleans up.
- [ ] **Step 7: Commit** `Windows W1: the tray`.

---

### Task 8: The settings window

**Files:**
- Create: `windows/Wallpapers/SettingsWindow.cs`
- Modify: `windows/Wallpapers/Tray.cs`, `windows/Wallpapers/App.cs` (the second-instance `settings` command)

**Interfaces:**
- Consumes: `WebFactory.SetUpAsync(wv, paths, desktop: false)`, the app's environment, `AppSettings.SettingsBounds`.
- Produces: `sealed class SettingsWindow : Form { static void ShowOrFocus(); }`. A WinForms `WebView2` control on the shared environment (`EnsureCoreWebView2Async(env)`) shows `PageUrl.Settings()`. Title `Wallpapers Settings`. Default size 1280×800 logical, centred on the primary monitor; size and position are remembered in `settings.json` (clamped to a visible monitor on restore). Closing hides the window and navigates to `about:blank` (so it costs nothing hidden); showing navigates back. It's in the taskbar only while shown. The icon is `app.ico`.

- [ ] **Step 1: Implement `SettingsWindow`.**
- [ ] **Step 2: Run on Windows** (owner). Expected: Settings… opens the panel over the current wallpaper; picking a wallpaper there changes the desktop through the `storage` event (no tray action); changing a setting of the shown wallpaper rebuilds it on the desktop; closing and reopening keeps size and position; a second `make win-run` opens or focuses it.
- [ ] **Step 3: Commit** `Windows W1: the settings window`.

---

### Task 9: `--selftest` and `make win-test`

**Files:**
- Create: `windows/Wallpapers/SelfTest.cs`
- Modify: `windows/Wallpapers/Program.cs`, `windows/run.sh` (`test` mode prints `selftest.txt` and returns the exit code), `Makefile` (`win-test`)

**Interfaces:**
- Consumes: `Desktop`, `DesktopLayer`, `Surface`, `WebFactory`, `AppPaths` (flavour `test`, wiped first).
- Produces: `--selftest [--bad-web-root]` → exits 0 if all pass. It writes one line per check (`PASS|FAIL|SKIP  <name>  <detail>`) to `<root>\selftest.txt` and the log, in about 30 s. Checks (numbers as in SPEC §10.25.15, plus W1 extras):
  1. `layer`: the shape is Raised or Classic (logged); every host's parent and z are right (`DesktopShape.ZOk`); one surface per monitor.
  2. `animates`: every surface's page reports `WP.player.stage.ready`, and `iframe.stage` `WP.host.frames.count` advances by > 20 over 2 s.
  3. `storage`: a second web view on the same environment (a hidden settings-type controller) writes `wp:selftest`, and the desktop page's `storage` listener (installed by the test) sees it within 2 s.
  4. `pause`: `SetVisibleAsync(false)` → frames advance ≤ 2 in 1.5 s and `IsVisible` is false; `true` → they advance again.
  5. *(W1 extra)* `insets`: each page's `WP.host.insets` equals its plan's insets.
  6. *(W1 extra)* `overlay`: no visible `Chrome_WidgetWin_1` of the environment lacks `WS_EX_TRANSPARENT`.
  7. *(W1 extra)* `bing.json`: `fetch('bing.json')` from the page returns the `X-Wallpapers-Bing: native` header and either images (online) or 503 (SKIP when offline).
  8. `shell restart (simulated)`: destroy our own hosts, as Explorer's death would, then run the same path as `ShellRestarted`; frames keep advancing and `performance.timeOrigin` is unchanged (no reload).
  9. *(W1 extra)* `renderer crash`: `Page.crash` on surface 0 → within 5 s it's animating again (Review Focus 3).
  10. `cleanup`: after `Desktop.Dispose()`, no `WallpapersHost` windows remain anywhere under `Progman` or the `WorkerW`s, and our keeper windows are gone.
  - With `--bad-web-root`: only `web root`: `CheckWebRoot` reports the folder; no surfaces are created; exit 0 if so (Review Focus 4).

- [ ] **Step 1: Implement `SelfTest` with checks 1–10** (written against the failure: check 8 first destroys hosts *without* rebinding to prove the check can fail, then is switched to the real path; note the failing output in the commit message).
- [ ] **Step 2: Run `make win-test`.** Expected: every check PASS (bing SKIP is acceptable offline), exit 0, ~30 s, and no wallpaper left behind afterwards (the desktop shows Windows' own picture).
- [ ] **Step 3: Run `make win-test` with `--bad-web-root`** (a `run.sh` passthrough, e.g. `WIN_ARGS=--bad-web-root make win-test`). Expected: PASS.
- [ ] **Step 4: Commit** `Windows W1: --selftest checks 1–10 and make win-test`.

---

### Task 10: `win-dev`, the by-hand pass, retire the spikes, docs

**Files:**
- Modify: `windows/run.sh` (`dev` mode), `Makefile` (remove `win-spike`, `SPIKE_EXE`), `README.md` (remove the `win-spike` row; add a **Windows** install/use section: what it is, build from WSL with `make win-run`, the tray, the settings window, Smart App Control and SmartScreen notes, "behind the icons" and RDP notes), `SPEC.md` (§10.25 status line, §3 layout line for `windows/`, intro item 5, §10.25.16 W1 marked done with a short *As built* note), `docs/superpowers/handoffs/2026-11-02-windows-handoff.md` (§1 status, next = W2), memory
- Delete: `windows/spikes/`

- [ ] **Step 1: Implement `win-dev`.** Map the virtual host straight onto the checkout through `\\wsl.localhost\…\web` (`WP_WEB_ROOT`). Verify a web edit + tray *Reload Wallpapers* shows at once. **If WebView2 refuses the UNC mapping**, fall back to rsyncing `web/` into `Wallpapers-build\dev\web` on every `make win-dev` and say so in the README (record which one happened in SPEC §10.25.15).
- [ ] **Step 2: By-hand pass with the owner** (RDP is fine). Desktop shown, then: right-click menu first try; icon drag and double-click; rubber band; Win+D twice; every tray item; the settings window pick → desktop; an Explorer restart (no reload); an **RDP disconnect and reconnect** (Review Focus 1: the scene fills the resized screen, with the ground above the taskbar); Quit → Windows' picture. Record the results in SPEC §10.25.16's *As built*.
- [ ] **Step 3: Retire the spikes.** `git rm -r windows/spikes`; remove `win-spike` from the Makefile (`.PHONY` too), the README row, and the `SPIKE_EXE` passthrough. SPEC §10.25.21 keeps the results (they name the code as "since replaced by `windows/Wallpapers`", like the Mac's M0).
- [ ] **Step 4: Docs** as listed under Files. SPEC §10.25's status: "W0 passed; **W1 built** (date); W2 next".
- [ ] **Step 5: Run `make ci` and `make win-test`.** Expected: both green.
- [ ] **Step 6: Commit** `Windows W1: win-dev, by-hand pass, spikes retired, docs`, and push when the owner says so.

---

## Order and checkpoints

Task 1 (web, independent) → 2 → 3 → 4 → 5 → 6 (**first real desktop**: owner checkpoint) → 7 → 8 → 9 → 10 (owner by-hand pass). Tasks 3–5's Core parts have no Windows dependency, so they can be done in any order, before Task 6. Every task ends green on `make win-unit` (and `make test` and `make smoke` for Task 1).
