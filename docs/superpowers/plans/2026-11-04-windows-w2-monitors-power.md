# Windows Phase W2 (Monitors and Power) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The W1 app learns monitors and power: a different wallpaper per monitor if you want one, surfaces that follow hot-plug, resolution, DPI and taskbar changes without reloading, a per-monitor pause when a window covers it, every power signal Windows has (lock, display off, sleep, fullscreen games, the screen saver, battery, Energy Saver, Remote Desktop), a Performance menu, and Identify Monitors.

**Architecture:** Every decision that can be pure goes in `Wallpapers.Core`, with xUnit tests: display keys, the layout diff, coverage maths, the pause hysteresis, the power state and its page JSON, the fake-layout fit, the tray's labels. The app gets three new pieces: `Power.cs` (Windows' power and session notifications), `Coverage.cs` (window events → which monitors are covered), and `DisplayConfig.cs` (stable monitor ids and names). `Desktop` changes from tear-down-and-rebuild to a reconcile: kept surfaces are moved, new ones are added, gone ones are removed. All visibility goes through one call that sends each page its `WP.power({...})`. `web/` gains `?display=` and a `remote` power signal.

**Tech Stack:** as W1: .NET 10 in WSL (`EnableWindowsTargeting`), C#, WinForms, hand-written P/Invoke (`user32`, `dwmapi`, `wtsapi32`, `powrprof`/`user32` power notifications, `shell32` `SHQueryUserNotificationState`), WebView2 1.0.4314.35, xUnit v3; Node 22 for the web tests and smoke.

**Spec:** `SPEC.md` §10.25.6 (monitors), §10.25.7 items 3, 5 and 6 (web), §10.25.9 (visibility and power), §10.25.10 (the tray), §10.25.15 (`WP_FAKE_DISPLAYS`, self-test), §10.25.16 (W2: "Different mode and display keys, hot-plug and DPI, coverage pause, every power signal, Performance menu, Identify Monitors. Web §7.3, §7.5. Self-test 5, 7."). W1 as built: §10.25.16 *As built*, and `docs/superpowers/plans/2026-11-03-windows-w1-desktop-core.md`.

## Global Constraints

- Everything in W1's Global Constraints still holds (host page and origin, the app serving its origin itself through `WebResourceRequested` (§10.25.14), data roots, `WebFactory.BrowserArgs = ""`, visual hosting, never steal focus, make targets, `make ci` green, commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`).
- **Display keys:** `m-` + the first 6 hex digits (lowercase) of SHA-256 of the monitor's lowercased device path from `QueryDisplayConfig` + `DisplayConfigGetDeviceInfo` (`DISPLAYCONFIG_DEVICE_INFO_GET_TARGET_NAME.monitorDevicePath`). With no path, of `gdi:` + the GDI device name (`\\.\DISPLAY1`). Friendly names (`monitorFriendlyDeviceName`) are for the menu. A duplicate key gets `-2`, `-3` in plan order.
- **Monitor numbers** are 1-based in `Layout.Plan`'s order (primary first, then by left, then top). The tray, Identify Monitors and the settings window's title all use them.
- **Storage:** Same mode reads and writes `wp:current`. Different mode: each page gets `&display=<key>` and uses `wp:current@<key>`. With no value under that key it inherits `wp:current`, then Seasonal. Wallpaper settings (`wp:<id>`) stay shared.
- **Coverage:** candidates are top-level windows that are visible, not minimized, not cloaked (`DWMWA_CLOAKED` = 14), not ours (by pid), not of class `Progman`, `WorkerW`, `Shell_TrayWnd` or `Shell_SecondaryTrayWnd`, not `WS_EX_TRANSPARENT`, and not layered with alpha 0. Their rects come from `DWMWA_EXTENDED_FRAME_BOUNDS` (9). **Covered** = at least **0.97** of the monitor's *work area* is under candidates. Triggers: `SetWinEventHook` (out of context, skip own process) for foreground (0x3), move-size end (0xB), minimize start/end (0x16, 0x17), show/hide (0x8002, 0x8003), location change (0x800B), cloaked/uncloaked (0x8017, 0x8018), filtered to `idObject == 0 && idChild == 0`; debounced **150 ms**; plus a **2 s** timer. Hysteresis: uncovered resumes at once; covered pauses after **300 ms**.
- **Power → page:** `WP.power({ hidden, saver, remote, battery? })`. `battery` is sent only when Windows reports a battery, because sending `null` would override the page's own `navigator.getBattery()` reading. A surface's `IsVisible` = not Paused, not hidden everywhere, and not covered. Hidden everywhere = locked, display off, asleep, a fullscreen D3D app or presentation (`SHQueryUserNotificationState` 3 or 4), the screen saver running (`SPI_GETSCREENSAVERRUNNING`), or the session disconnected (`WTS_CONSOLE_DISCONNECT`/`WTS_REMOTE_DISCONNECT`). Battery and Energy Saver lower quality; only invisibility pauses (owner's rule, §10.25.9).
- **Power GUIDs** (check each against the Windows SDK's headers before use): `GUID_CONSOLE_DISPLAY_STATE` `6FE69556-704A-47A0-8F24-C28D936FDA47` (0 off, 1 on, 2 dimmed: dimmed still draws); `GUID_ACDC_POWER_SOURCE` `5D3E9A59-E9D5-4B00-A6BD-FF34FF516548`; `GUID_BATTERY_PERCENTAGE_REMAINING` `A7AD8041-B45A-4CAE-87A3-EECBB468A9E1`; `GUID_ENERGY_SAVER_STATUS` `550E8400-E29B-41D4-A716-446655440000` (Windows 11; fall back to `GUID_POWER_SAVING_STATUS` `E00958C0-C213-4ACE-AC77-FECCED2EEEA5`).
- **Remote Desktop:** `GetSystemMetrics(SM_REMOTESESSION = 0x1000)`, re-read on every session change. **What it does to quality is the owner's call (see the end of this plan).** This plan assumes the recommendation: ceiling **Low**, no extra fps cap.
- **Fake layouts:** `WP_FAKE_DISPLAYS=<path to a displays JSON>` (the `--dump-displays` and fixture format). Surfaces then go in ordinary top-level windows, scaled to fit the real primary work area, with `RasterizationScale = plan scale × fit factor` so each page sees the fake monitor's CSS size. The file is watched: an edit is a hot-plug. Coverage is off in this mode.
- No change to Android or the Mac apps. The web changes are host-neutral and testable in a browser.

## Review Focus

1. **A monitor goes away and comes back while running** (unplugging, a dock, RDP's *Use all my monitors* toggled). Expected: the surfaces left keep running without a reload; a returning monitor in Different mode gets its old wallpaper back. *(Task 2: `Layout.Diff` tests; Task 3: reconcile; Task 8: self-test `resize in place` and `display=`; Task 9 by hand.)*
2. **Windows that look full-screen but aren't in the way**: a GeForce/Discord overlay (click-through), a window cloaked on another virtual desktop, a minimized window, a tool window of ours, the taskbar. Expected: never a pause. *(Task 5: candidate tests, one per kind.)*
3. **A missed or reordered notification**: waking from sleep without a display-on, unlock before display-on, an RDP reconnect. Expected: never stuck hidden. *(Task 4: the `PowerSignals` reducer tests; the 2 s timer re-reads the polled signals; Task 9 by hand: lock/unlock, sleep/wake.)*
4. **RDP's GDI names change every session** (`DISPLAY81`, `DISPLAY97`, `DISPLAY1` were all seen on 2026-11-03). Expected: display keys don't depend on them when a device path exists, so Different mode keeps each monitor's choice across reconnects. *(Task 2: `DisplayKey` ignores `Device` when `Path` is set; Task 9 by hand: reconnect.)*
5. **A change that shouldn't cost a reload**: a resize, a DPI change, a taskbar move, Explorer restarting. Expected: a resize or DPI change moves the surface and keeps its page (`performance.timeOrigin` unchanged); only an insets or URL change navigates. *(Task 2: diff classification; Task 8: self-test `resize in place`.)*

---

## File Structure

```
web/core/wp.js                    + WP.currentKey(params); 'display' in WP.PARAMS
web/core/player.js                choice read/write/listen through WP.currentKey
web/core/perf.js                  WP.powerPolicy: remote
tools/wp.test.mjs, tools/smoke.mjs   + tests
windows/Wallpapers.Core/
  Geometry.cs                     MonitorInfo + Path, Name (optional)
  DisplayKey.cs                   stable keys
  Layout.cs                       SurfacePlan + Name, Number, Primary, Work; Diff; FakeLayout.Fit
  PageUrl.cs                      Desktop(insets, display), Settings(display)
  AppSettings.cs                  + Monitors (MonitorMode)
  Coverage.cs                     candidates, fraction, per-surface covered, CoverageGate
  Power.cs                        PowerState, PowerSignals (reducer), PowerJson
  Catalog.cs                      + per-monitor tooltip; PerformanceInfo
windows/Wallpapers/
  DisplayConfig.cs                QueryDisplayConfig → path + friendly name per GDI device
  Native.cs                       + the new P/Invoke
  Desktop.cs                      reconcile; modes; fake source; ApplyPowerAsync; per-key show/cycle
  DesktopLayer.cs                 MoveHost; fake hosts
  Surface.cs                      Resize, Navigate, ApplyPowerAsync
  Power.cs                        notifications + polling → PowerState
  Coverage.cs                     win-event hooks → covered keys
  Tray.cs                         Monitors ▸, per-monitor submenus, Performance ▸, Identify
  IdentifyWindow.cs               the big number on each monitor
  SettingsWindow.cs               per-monitor (display=) and its title
  SelfTest.cs                     + coverage, display=, resize in place, power
```

---

### Task 1: Web: `?display=` and the `remote` signal (SPEC §10.25.7 items 3, 5, 6)

**Files:**
- Modify: `web/core/wp.js`, `web/core/player.js`, `web/core/perf.js`, `tools/wp.test.mjs`, `tools/smoke.mjs`, `SPEC.md` (§4.2, §4.3, §4.8, §10.25.7)

**Interfaces:**
- Produces: `WP.currentKey(params) → 'wp:current' | 'wp:current@<key>'`. A key is used only if it matches `/^[a-z0-9-]{1,40}$/`; anything else falls back to `'wp:current'`. `WP.powerPolicy({ ..., remote = false })`.

- [ ] **Step 1: Write the failing unit tests** in `tools/wp.test.mjs`:
  - `display: its own key for the choice, a bad key falls back`: `WP.currentKey({}) === 'wp:current'`; `WP.currentKey({ display: 'm-3fa9c2' }) === 'wp:current@m-3fa9c2'`; `WP.currentKey({ display: '../x' }) === 'wp:current'`; `WP.currentKey({ display: '' }) === 'wp:current'`.
  - `power: remote desktop lowers the ceiling to Low`: `policy({ remote: true }).ceiling === 'low'`; `.reasons` includes `'remote desktop'`; `.pause === false`; `policy({ remote: true, reducedMotion: true }).fpsCap === WP.TIERS.low.fps`. (If the owner picks the 15 fps cap instead, `policy({ remote: true }).fpsCap === 15`.)
- [ ] **Step 2: Run `make test`.** Expected: these two FAIL.
- [ ] **Step 3: Implement.** In `wp.js`: `'display'` joins `WP.PARAMS`, and add `WP.currentKey`. In `player.js`, with `const currentKey = WP.currentKey(params)`:
  - `initialChoice` reads `currentKey`; when that's empty and a display is set, it reads `'wp:current'`; then `'seasonal'`.
  - `show(…, { persist: true })` writes `currentKey`.
  - The storage listener follows `currentKey`. It also follows `'wp:current'` while `currentKey` differs and has no value of its own.

  In `perf.js`: `if (remote) lower('low', 'remote desktop');`.
- [ ] **Step 4: Run `make test`.** Expected: PASS.
- [ ] **Step 5: Add the smoke check** in `playerSuite`, next to the `?insets=` one: `'?display= keeps two monitors' choices apart'`.
  1. `fresh(index.html?display=m-aaaaaa&host=windows)`, then `WP.player.show('snow', { persist: true })`.
  2. `fresh(index.html?display=m-bbbbbb&host=windows)` with storage kept, then show `'rain'`.
  3. Reopen `m-aaaaaa`: `playerReady() === 'snow'`.
  4. Then `localStorage` has `wp:current@m-aaaaaa = "snow"`, `wp:current@m-bbbbbb = "rain"`, and `wp:current` null.
  5. Then set `wp:current` to `"leaves"` and open `?display=m-cccccc`: it shows `leaves` (inherits).

  Use the suite's existing way to keep storage between loads. If `fresh` always clears, preload the values with `fresh`'s storage argument.
- [ ] **Step 6: Run `make smoke`.** Expected: PASS, nothing else changes.
- [ ] **Step 7: Docs.** SPEC §4.2 row `` | `display=<key>` | the choice is kept per display, as `wp:current@<key>` (Windows' Different mode) | ``; §4.8 power policy table/notes: `remote` → Low; §10.25.7 items 3 and 5 marked *(built in W2)*, and item 5's open question answered with the owner's pick.
- [ ] **Step 8: Commit** `web: ?display= per-monitor choice and the remote power signal (SPEC §10.25.7 3, 5)`.

---

### Task 2: Core: display keys, names, the layout diff, the fake-layout fit

**Files:**
- Create: `windows/Wallpapers.Core/DisplayKey.cs`, `windows/Wallpapers/DisplayConfig.cs`, fixtures `displays-two-with-paths.json` (fake paths such as `\\?\DISPLAY#FAKE0001#1&0#{fixture}` and names such as "Fixture 27"), `displays-two-with-paths-unplugged.json` (the second gone), `displays-two-with-paths-dpi.json` (the first at 150%)
- Modify: `Geometry.cs`, `Layout.cs`, `PageUrl.cs`, `Program.cs` (`--dump-displays` writes path, name and key), `LayoutTests.cs`, `PageUrlTests.cs`; Test: `DisplayKeyTests.cs`

**Interfaces:**
- `MonitorInfo(string Device, Rect Bounds, Rect Work, int Dpi, bool Primary, string? Path = null, string? Name = null)`: the old fixtures load unchanged.
- `static class DisplayKey { string For(MonitorInfo m); }`
- `SurfacePlan(string Key, string Device, string Name, int Number, bool Primary, Rect Bounds, Rect Work, double Scale, Insets Insets)`. `Name` is the friendly name, or `Display <Number>` without one.
- `Layout.Plan(IReadOnlyList<MonitorInfo>)`: unique keys, numbered.
- `sealed record LayoutChange(IReadOnlyList<SurfacePlan> Added, IReadOnlyList<SurfacePlan> Removed, IReadOnlyList<(SurfacePlan Old, SurfacePlan New)> Kept)`; `static LayoutChange Layout.Diff(IReadOnlyList<SurfacePlan> current, IReadOnlyList<SurfacePlan> next)`, matched by `Key`.
- `static bool Layout.Moved(SurfacePlan a, SurfacePlan b)` (bounds or scale differ); `static bool Layout.NeedsNavigate(SurfacePlan a, SurfacePlan b)` (insets differ).
- `sealed record HostPlacement(Rect Screen, double RasterizationScale)`; `static IReadOnlyDictionary<string, HostPlacement> FakeLayout.Fit(IReadOnlyList<SurfacePlan> plans, Rect realWork)`. It uses one uniform factor ≤ 1 so the fake layout's bounding box fits inside `realWork` with 5% margin, centred. `Screen` is each mapped bounds rect; `RasterizationScale` is `plan.Scale × factor`.
- `PageUrl.Desktop(Insets insets, string? display = null)` adds `&display=<key>`; `PageUrl.Settings(string? display = null)` likewise.
- App: `static class DisplayConfig { IReadOnlyDictionary<string, (string Path, string Name)> ByGdiName(); }`, and `N.Monitors()` fills `Path` and `Name` from it (empty when `QueryDisplayConfig` fails, e.g. some RDP sessions; logged once).

- [ ] **Step 1: Write the failing tests:**
  - `DisplayKey_is_stable_and_ignores_the_gdi_name_when_there_is_a_path`: two `MonitorInfo`s with the same `Path` but `Device` `\\.\DISPLAY81` and `\\.\DISPLAY97` give the same key, which matches `^m-[0-9a-f]{6}$`. The path's case doesn't matter.
  - `DisplayKey_falls_back_to_the_gdi_name`: no path → keys differ for `DISPLAY1` and `DISPLAY2`.
  - `Plan_numbers_primary_first_and_names_fall_back`: in `displays-two-with-paths.json`, `Number` is 1, 2 and Names are the fixture's. In `displays-side-by-side.json` (no names) it's `"Display 1"`.
  - `Plan_keys_are_unique`: two monitors with the same path get `k` and `k-2`.
  - `Diff_unplug_keeps_the_other_and_removes_one` / `Diff_replug_adds_it` / `Diff_dpi_change_is_a_move_not_a_navigate` (scale 2 → 1.5, same insets in CSS px). `Diff_taskbar_move_needs_navigate` (insets change). `Diff_rdp_resize_is_a_move` (the two `displays-rdp-200*` fixtures, now keyed by the GDI fallback; same key because the device name is the same).
  - `Fake_fit_two_2560_monitors_into_a_1590_tall_work_area`: from `displays-side-by-side.json` into `new Rect(0, 0, 2940, 1590)`. Both rects lie inside it, their total width ≤ 2940 × 0.95, and `RasterizationScale / plan.Scale` is the same factor for both.
  - `PageUrl` `Desktop_with_display` and `Settings_with_display`.
- [ ] **Step 2: Run `make win-unit`.** Expected: FAIL (missing types and members).
- [ ] **Step 3: Implement** the Core parts. `SurfacePlan`'s new members break W1 callers: update `Desktop`, `Surface`, `SelfTest` and the tests to compile (behaviour unchanged).
- [ ] **Step 4: Run `make win-unit`.** Expected: PASS (all W1 tests too).
- [ ] **Step 5: Implement `DisplayConfig`** (`QueryDisplayConfig(QDC_ONLY_ACTIVE_PATHS = 2)` after `GetDisplayConfigBufferSizes`; per path, `DisplayConfigGetDeviceInfo` type 1 (source name → `viewGdiDeviceName`) and type 2 (target name → `monitorFriendlyDeviceName`, `monitorDevicePath`)) and use it in `N.Monitors()`. `--dump-displays` writes `path`, `name` and `key`. A real dump is never committed: real device paths carry hardware ids.
- [ ] **Step 6: Run on Windows:** `WIN_ARGS=--dump-displays make win-run`. Expected: two monitors (the owner's console has 3840×2160 at 250% and 1920×1080 at 150%), each with a path, a friendly name and an `m-xxxxxx` key. Run it again and the keys are the same. Over RDP, note whether paths exist and record it in the SPEC (Task 9).
- [ ] **Step 7: Commit** `Windows W2: stable display keys and names, the layout diff, fake-layout fit`.

---

### Task 3: Monitors mode, the reconcile, and `WP_FAKE_DISPLAYS`

**Files:**
- Modify: `AppSettings.cs` (+ `AppSettingsTests`), `Desktop.cs`, `DesktopLayer.cs`, `Surface.cs`, `App.cs`

**Interfaces:**
- Core: `enum MonitorMode { Same, Different }`; `AppSettings(bool DrawAboveIcons = false, Rect? SettingsBounds = null, MonitorMode Monitors = MonitorMode.Same)`, serialized as `"monitors": "same" | "different"` (camelCase string enum).
- `Desktop`: `MonitorMode Mode { get; }`; `Task SetModeAsync(MonitorMode mode)` (every surface navigates to its new URL; no host is re-created); `Task ShowAsync(string id, string? key = null)` (null = all); `Task CycleAsync(int step, string? key = null)`; `IReadOnlyList<MonitorInfo> CurrentMonitors()`, which reads the fake file when `WP_FAKE_DISPLAYS` is set; `bool Fake { get; }`; `internal Task UseFakeDisplaysForTest(IReadOnlyList<MonitorInfo>? layout)`, for the self-test: a fake layout in memory, or null to go back to the real monitors. It reconciles at once, with no debounce.
- `Desktop.RebuildAsync` stays for Draw Above Icons (the host kind changes). Display changes now go through `ReconcileAsync(string why)`:
  - Removed: dispose the surface and destroy its host.
  - Kept and moved: `layer.MoveHost(host, placement)` + `surface.Resize(plan, placement)`.
  - Kept and needing a navigate: `surface.Navigate(url)`.
  - Added: create it.
  - Then `FixOverlay()` and `ApplyPowerAsync()` (Task 4; until then, the Pause state).
  - Every step is logged: `reconcile: kept m-… (moved 2940x1686 → 2940x1844)`, `added m-…`, `removed m-…`.
- `DesktopLayer`: `void MoveHost(IntPtr host, Rect screen)`; `IntPtr CreateFakeHost(SurfacePlan plan, HostPlacement placement)`: an ordinary visible top-level window, title `Wallpapers (fake) · Monitor <n> · <name>`, `WS_EX_NOACTIVATE`, not click-through.
- `Surface`: `SurfacePlan Plan { get; private set; }`; `void Resize(SurfacePlan plan, HostPlacement placement)` (sets `controller.Bounds` to the placement's size and `RasterizationScale`); `void Navigate(string url)`.
- `Surface` gets its URL from `PageUrl.Desktop(plan.Insets, mode == Different ? plan.Key : null)`.

- [ ] **Step 1: Write the failing `AppSettingsTests`:** `Monitors_round_trips_as_a_word` (writes `"monitors": "different"`), `Old_files_without_monitors_are_same`.
- [ ] **Step 2: Run `make win-unit`.** Expected: FAIL.
- [ ] **Step 3: Implement `MonitorMode`.**
- [ ] **Step 4: Run `make win-unit`.** Expected: PASS.
- [ ] **Step 5: Implement the reconcile, modes and fake source** as in Interfaces. Fake mode watches the file (`FileSystemWatcher` on its folder, filtered to its name, through the existing 500 ms debounce). The Explorer-restart re-bind applies to real hosts only: fake hosts don't die with Explorer.
- [ ] **Step 6: Run on Windows:**
  1. `make win-run` on the owner's two monitors. Expected: a surface on each, keys in the log.
  2. Change the second monitor's scale in Settings → Display. Expected: the log shows `kept … (moved …)` and no navigation; the scene redraws sharp at the new scale.
  3. `WP_FAKE_DISPLAYS` with a copy of `displays-side-by-side.json` (through `run.sh`'s environment passthrough). Expected: two windows side by side, each with its own page.
  4. Delete the second monitor from the file. Expected: its window closes and the first keeps running.
- [ ] **Step 7: Commit** `Windows W2: Same and Different modes, reconcile on display changes (move, not reload), fake layouts`.

---

### Task 4: Power: every signal, one path to the pages

**Files:**
- Create: `windows/Wallpapers.Core/Power.cs` (+ `PowerTests`), `windows/Wallpapers/Power.cs`
- Modify: `Native.cs`, `Desktop.cs`, `Surface.cs`, `App.cs`, `SelfTest.cs` (its pause check uses the new call)

**Interfaces:**
- Core:
  - `sealed record BatteryInfo(bool Charging, double Level)`.
  - `sealed record PowerState(bool Locked = false, bool DisplayOff = false, bool Asleep = false, bool Disconnected = false, bool FullscreenApp = false, bool SaverRunning = false, bool Remote = false, bool EnergySaver = false, BatteryInfo? Battery = null) { bool HiddenEverywhere { get; } string Describe(); }`. `Describe` is for the log and the tray: e.g. `locked, on battery 54%`.
  - `enum PowerEvent { Lock, Unlock, DisplayOff, DisplayOn, DisplayDimmed, Suspend, Resume, Disconnect, Connect }`; `static PowerState PowerSignals.Apply(PowerState s, PowerEvent e)`. `Resume` clears `Asleep` *and* `DisplayOff`; `Connect` clears `Disconnected`; `Unlock` clears `Locked`.
  - `static string PowerJson.For(PowerState s, bool hidden)` → `{"hidden":…,"saver":…,"remote":…}`, plus `"battery":{"charging":…,"level":…}` only when `Battery` is set.
- App: `sealed class Power : IDisposable { PowerState State { get; } event Action? Changed; void Start(); }`.
  - It owns a hidden top-level window for `WM_WTSSESSION_CHANGE` (0x2B1; `WTSRegisterSessionNotification`, `NOTIFY_FOR_THIS_SESSION`) and `WM_POWERBROADCAST` (0x218: `PBT_APMSUSPEND` 4, `PBT_APMRESUMEAUTOMATIC` 0x12, `PBT_APMRESUMESUSPEND` 7, `PBT_POWERSETTINGCHANGE` 0x8013 for the GUIDs in Global Constraints).
  - On a 2 s timer it polls `SHQueryUserNotificationState`, `SPI_GETSCREENSAVERRUNNING` (0x72) and `SM_REMOTESESSION`.
  - It raises `Changed` only when the state really changes, and logs `power: <Describe()>`.
- `Desktop`: `Task ApplyPowerAsync()`. Per surface, visible = `!Paused && !power.HiddenEverywhere && !covered(key)`, where `covered` is a `Func<string, bool>` set by Task 5 and always false until then. Then `surface.ApplyPowerAsync(visible, PowerJson.For(state, !visible))`. `SetPausedAsync` now calls it.
- `Surface`: `Task ApplyPowerAsync(bool visible, string json)` replaces `SetVisibleAsync`. It does nothing when both are unchanged, logs `IsVisible=` changes as W1 did, and runs `window.WP && WP.power && WP.power(<json>)`.

- [ ] **Step 1: Write the failing `PowerTests`:**
  - `Hidden_everywhere_for_each_hiding_signal` (a theory over the six flags; `Remote`, `EnergySaver` and `Battery` don't hide).
  - `Resume_clears_sleep_and_display_off`.
  - `Unlock_after_lock_clears`.
  - `A_reconnect_clears_disconnected`.
  - `Dimmed_still_draws`.
  - `Json_has_no_battery_without_one` (no `"battery"` key) and `Json_with_battery` (exactly `{"hidden":false,"saver":true,"remote":false,"battery":{"charging":false,"level":0.54}}`).
  - `Describe_names_what_matters`.
- [ ] **Step 2: Run `make win-unit`.** Expected: FAIL.
- [ ] **Step 3: Implement Core `Power.cs`.**
- [ ] **Step 4: Run `make win-unit`.** Expected: PASS.
- [ ] **Step 5: Implement the app's `Power`, and route Pause and power through `Desktop.ApplyPowerAsync`.** Start state comes from the live readings (`WTSQuerySessionInformation(WTSSessionInfoEx)` for a session locked at start, if cheap; otherwise unlocked), so an app started while locked doesn't draw.
- [ ] **Step 6: Run on Windows** (owner):
  1. Win+L, then unlock. Expected: `power: locked`, `IsVisible=false` on every surface, then visible again.
  2. Turn the display off (or `powercfg` display timeout 1 min) and back on.
  3. Sleep and wake.
  4. An RDP session. Expected: `power: remote`, and the `?hud=1` line on a test page shows `remote desktop`.
  5. A laptop on battery, if there is one. Expected: `on battery`.
- [ ] **Step 7: Commit** `Windows W2: power: lock, display, sleep, fullscreen apps, the screen saver, battery, Energy Saver, Remote Desktop`.

---

### Task 5: Per-monitor coverage pause

**Files:**
- Create: `windows/Wallpapers.Core/Coverage.cs` (+ `CoverageTests`), `windows/Wallpapers/Coverage.cs`
- Modify: `Native.cs` (`SetWinEventHook`, `UnhookWinEvent`, `DwmGetWindowAttribute`, `IsIconic`, `GetLayeredWindowAttributes`), `Desktop.cs`

**Interfaces:**
- Core:
  - `sealed record WindowFacts(string Class, bool Visible, bool Minimized, bool Cloaked, bool Ours, bool Transparent, bool LayeredAlphaZero, Rect Bounds)`.
  - `static class CoverageMath`:
    - `const double Threshold = 0.97`
    - `bool IsCandidate(WindowFacts w)`
    - `double Fraction(Rect area, IEnumerable<Rect> rects)`: the union's area inside `area` ÷ `area`'s area. Exact: slabs on x, merged y intervals.
    - `IReadOnlyDictionary<string, bool> Covered(IReadOnlyList<SurfacePlan> plans, IReadOnlyList<WindowFacts> windows)`, per key, against `plan.Work`.
  - `sealed class CoverageGate { const int PauseAfterMs = 300; bool Hidden { get; } int? Update(bool covered, long nowMs); }`. It returns the ms until it must be asked again, or null.
- App: `sealed class Coverage : IDisposable { event Action? Changed; bool IsCovered(string key); void Start(Func<IReadOnlyList<SurfacePlan>> plans); }`.
  - It hooks the win-events in Global Constraints (keep the delegate in a field), debounces 150 ms, polls every 2 s, and keeps one `CoverageGate` per key.
  - It raises `Changed` when a key's `Hidden` flips, logging `coverage: m-… covered (98.6%)` / `uncovered`.
  - It's off with `WP_FAKE_DISPLAYS`. `Desktop` sets its `covered` function to `coverage.IsCovered` and calls `ApplyPowerAsync` on `Changed`.

- [ ] **Step 1: Write the failing `CoverageTests`:**
  - `Maximized_covers` (one window = work area → 1.0).
  - `Two_snapped_halves_cover`.
  - `Ninety_six_percent_doesnt_and_ninety_eight_does`.
  - `Overlapping_windows_count_once` (two identical rects of 60% → 0.6).
  - `A_window_on_the_other_monitor_doesnt_cover_this_one` (two plans from `displays-two-with-paths.json`).
  - `Not_candidates` (a theory: minimized, cloaked, ours, transparent, layered alpha 0, invisible, `Progman`, `WorkerW`, `Shell_TrayWnd`, `Shell_SecondaryTrayWnd`).
  - `Gate_pauses_after_300_ms_and_resumes_at_once` (`Update(true, 0)` → not hidden, returns 300; `Update(true, 299)` → not hidden; `Update(true, 300)` → hidden; `Update(false, 310)` → not hidden at once).
  - `Gate_a_blip_doesnt_pause` (covered 0 → uncovered 200 → covered 250 → hidden only at 550).
- [ ] **Step 2: Run `make win-unit`.** Expected: FAIL.
- [ ] **Step 3: Implement Core `Coverage.cs`.**
- [ ] **Step 4: Run `make win-unit`.** Expected: PASS.
- [ ] **Step 5: Implement the app's `Coverage`** and wire it into `Desktop`.
- [ ] **Step 6: Run on Windows** (owner, two monitors):
  1. Maximize a window on monitor 2. Expected: within ~0.5 s the log shows `coverage: <key2> covered` and `IsVisible=false` for that surface only. Monitor 1 keeps animating.
  2. Restore it. Expected: visible at once.
  3. Snap two windows on monitor 1. Expected: covered.
  4. A Discord/GeForce-style overlay, if present, and Task View. Expected: no pause.
  5. Alt-Tab through windows. Expected: no flicker in the log.
- [ ] **Step 7: Commit** `Windows W2: per-monitor coverage pause (97% of the work area, 300 ms hysteresis)`.

---

### Task 6: The tray: Monitors ▸, per-monitor menus, per-monitor settings, Identify Monitors

**Files:**
- Create: `windows/Wallpapers/IdentifyWindow.cs`
- Modify: `Tray.cs`, `SettingsWindow.cs`, `App.cs`, `windows/Wallpapers.Core/Catalog.cs` (+ `CatalogTests`)

**Interfaces:**
- Core: `static string CatalogInfo.Tooltip(IReadOnlyList<CatalogInfo> perMonitor, bool paused)`. It's W1's single form for one monitor or when every monitor shows the same thing; otherwise names joined by ` · ` (`Wallpapers: Snow · Fish Tank`). Never past 63 characters: names are cut evenly.
- `SettingsWindow.ShowOrFocusAsync(SurfacePlan? monitor = null)`. With a monitor in Different mode: URL `PageUrl.Settings(monitor.Key)`, title `Wallpapers Settings · Monitor <n> · <name>`. It's one window; switching monitors navigates it. `App.OpenSettings(SurfacePlan? monitor = null)`.
- `IdentifyWindow.ShowAll(IReadOnlyList<(SurfacePlan Plan, Rect Screen)> where)`: per monitor, a borderless, topmost, non-activating (`ShowWithoutActivation`), click-through window, centred on its rect. It shows the number at about a third of the monitor's height and the name under it, on a translucent dark panel, and closes itself after 3 s.
- The menu (§10.25.10):
  - Same mode: W1's menu, plus `Monitors ▸ ● Same on All · ○ Different per Monitor ── Identify Monitors`, placed after Pause.
  - Different mode:
    - The header becomes one disabled row per monitor (`1  ❄️ Snow`).
    - The top-level Wallpaper/Surprise/Next/Previous are replaced by one submenu per monitor, `Monitor <n> · <name>` (with ` (main)` on the primary): `Wallpaper ▸ · Surprise Me · Next · Previous · Settings…`.
    - The top-level Settings… opens monitor 1's.
  - Catalog refreshes ask every surface: one `CatalogInfo` per key.

- [ ] **Step 1: Write the failing tests:** `Tooltip_joins_monitors`, `Tooltip_same_everywhere_is_the_single_form`, `Tooltip_cuts_long_names_evenly_within_63`.
- [ ] **Step 2: Run `make win-unit`.** Expected: FAIL.
- [ ] **Step 3: Implement it.**
- [ ] **Step 4: Run `make win-unit`.** Expected: PASS.
- [ ] **Step 5: Implement the menu, the per-monitor settings window and `IdentifyWindow`.** Picking the mode saves `settings.json` and calls `Desktop.SetModeAsync`.
- [ ] **Step 6: Run on Windows** (owner, two monitors):
  1. Monitors → Different. Expected: both keep what they showed (inheritance).
  2. Pick Fish Tank on Monitor 2 only. Expected: monitor 1 unchanged; after a restart of the app both are kept.
  3. Monitor 2 → Settings…. Expected: the title names it, and a pick there changes monitor 2 only.
  4. Identify Monitors. Expected: 1 and 2 on the right screens for 3 s, with no focus taken.
  5. Back to Same. Expected: both show `wp:current`.
- [ ] **Step 7: Commit** `Windows W2: the tray's Monitors menu, per-monitor wallpapers and settings, Identify Monitors`.

---

### Task 7: The tray: Performance ▸

**Files:**
- Modify: `windows/Wallpapers.Core/Catalog.cs` (+ tests), `Tray.cs`

**Interfaces:**
- Core: `sealed record PerformanceInfo(string Mode, bool BatteryAware, string? Status) { const string Script; static PerformanceInfo Parse(string json); }`.
  - The script: `(window.WP && WP.player) ? JSON.stringify({ mode: (WP.store.get('wp:performance') || {}).mode || 'auto', batteryAware: (WP.store.get('wp:performance') || {}).batteryAware !== false, stats: WP.player.stats }) : null`.
  - `Status` is `now: <stats.label> · <stats.fps> fps · <reasons joined by ", " or "no power limits">`, or null without stats.
- The menu: `Performance ▸ ● Auto · ○ Low · ○ Medium · ○ High · ✓ Save Power on Battery ── <Status>` (disabled). A pick runs `WP.player.setMode('<mode>')`; the toggle runs `WP.player.setBatteryAware(true|false)`. Both go to the first surface only: the others follow through the `wp:performance` storage event, which the player already handles.

- [ ] **Step 1: Write the failing tests:** `Performance_parses_the_pages_answer` (a fixture string with `stats: { label: 'Medium', fps: 30, reasons: ['on battery'] }` → `Status == "now: Medium · 30 fps · on battery"`), `Performance_defaults_without_a_saved_choice`, `Performance_without_stats_has_no_status`.
- [ ] **Step 2: Run `make win-unit`.** Expected: FAIL.
- [ ] **Step 3: Implement `PerformanceInfo`.**
- [ ] **Step 4: Run `make win-unit`.** Expected: PASS.
- [ ] **Step 5: Implement the submenu.**
- [ ] **Step 6: Run on Windows.** Expected: each mode changes the scene's quality on every monitor within a second; the status line follows; the settings panel shows the same mode (one source of truth).
- [ ] **Step 7: Commit** `Windows W2: the tray's Performance menu`.

---

### Task 8: Self-test: coverage, `display=`, resize in place, power

**Files:**
- Modify: `windows/Wallpapers/SelfTest.cs`, `README.md` (the `win-test` row)

**Interfaces:**
- Consumes: `Desktop.SetModeAsync`, `Desktop.UseFakeDisplaysForTest(IReadOnlyList<MonitorInfo>? layout)` (internal; null returns to the real monitors), `Coverage`, `Power`.
- New checks, in this order, after W1's `pause`:
  - `coverage`: a plain test `Form` maximized on surface 0's monitor (not topmost, not in the taskbar).
    - Within 2 s that surface is not visible and every other surface still is.
    - After closing the form, it's visible within 1 s.
    - SKIP when the session is hidden for another reason (`power.HiddenEverywhere`).
  - `power`: each page's `WP.player.policy.reasons` contains `'remote desktop'` exactly when `power.State.Remote` (proves the signal reaches the page).
  - `display=`: switch to Different.
    - Every surface's URL carries `display=<its key>`.
    - Show `snow` on the first and `rain` on the second. With one real monitor, use a built-in fake two-monitor layout: two 1280×720 monitors at 100%, side by side.
    - Reload both: they come back with their own choices.
    - The storage has both `wp:current@<key>` values, and `wp:current` is untouched.
    - Switch back to Same.
  - `resize in place`, in the fake layout: change monitor 1's bounds (1280×720 → 1280×800) and reconcile.
    - The surface is the same object, with `performance.timeOrigin` unchanged and the page's `innerHeight` updated.
    - Then remove monitor 2 and reconcile: its fake host window is gone and monitor 1's page didn't reload.
    - Back to the real monitors.

- [ ] **Step 1: Implement the four checks.** Write `resize in place` against the failure first: first make reconcile tear down and rebuild, to prove the timeOrigin check catches it. Note the failing line in the commit message.
- [ ] **Step 2: Run `make win-test`** (quit the normal app first, restart it after). Expected: all PASS on the owner's two monitors, ~40 s.
- [ ] **Step 3: Commit** `Windows W2: self-test coverage, display=, resize in place, power`.

---

### Task 9: The by-hand pass and docs

**Files:**
- Modify: `README.md` (the Windows section: Monitors, Performance, what pauses it, "it lowers quality on battery and over Remote Desktop, and never pauses for it"; the GPU note from §10.25.9), `SPEC.md` (§10.25 status line; §10.25.16 W2 *As built*; §10.25.6 what RDP gave for device paths; §4.2/§4.8 already in Task 1), `docs/superpowers/handoffs/2026-11-02-windows-handoff.md`, memory

- [ ] **Step 1: By-hand pass with the owner**, at the console with two monitors (now available), then once over RDP:
  1. Different mode with two wallpapers, a restart, and a reconnect (keys kept).
  2. Unplug and replug monitor 2, or switch it off in Settings → Display → "Disconnect this display". Expected: monitor 1 doesn't reload; monitor 2 comes back with its wallpaper.
  3. A scale change on one monitor. A taskbar moved to the left.
  4. A maximized window on each monitor in turn.
  5. Lock and unlock, display off, sleep and wake.
  6. Performance modes.
  7. Identify Monitors.
  8. An RDP session (the `remote` reason).

  Record the results in §10.25.16's *As built*.
- [ ] **Step 2: Docs** as listed under Files. SPEC §10.25 status: "W0 passed; W1 built; **W2 built** (date); W3 next".
- [ ] **Step 3: Run `make ci` and `make win-test`.** Expected: both green.
- [ ] **Step 4: Commit** `Windows W2: by-hand pass and docs`, and push when the owner says so.

---

## Order and checkpoints

Task 1 (web, independent) → 2 → 3 (**owner checkpoint:** two monitors, a scale change, a fake layout) → 4 → 5 (**owner checkpoint:** lock, maximize) → 6 → 7 → 8 → 9 (owner by-hand pass). Tasks 4 and 5's Core parts don't depend on Task 3 and can be written earlier. Every task ends green on `make win-unit` (and `make test` and `make smoke` for Task 1).

## Decision for the owner

**What Remote Desktop does to quality** (SPEC §10.25.7 item 5 left it open):
- **Recommended: ceiling Low, no extra fps cap.** Low halves the resolution, so RDP sends a quarter of the pixels. The frame rate stays what reduced motion already gives (20 fps, paced to 16 on RDP's 32 Hz).
- **As designed: Low at 15 fps.** On 32 Hz frames that paces to about 10.7 fps, visibly choppier, for little more saving.
- **Nothing extra:** RDP keeps today's High at 16 fps. The sharpest picture, the most bandwidth and CPU.
