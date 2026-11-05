# Windows: live desktop wallpaper, tray app and screen saver — design

Date: 2026-11-02 · Status: **approved; superseded by SPEC.md §10.25**, which
is the living version. This file is kept as the original design note.

## 1. Intent

The Mac app proved the idea: the same `web/` wallpapers, unchanged, running
as the real desktop background and as the screen saver. The owner wants the
same on Windows 11, where they sit in front of a two-monitor desktop all day.

Windows is friendlier ground than macOS, so this design goes further than the
Mac app did:

- The wallpaper truly sits **behind the desktop icons** (the Mac sits in a
  window just above the picture; here we live inside Explorer's own
  wallpaper layer).
- **Each monitor its own world**, or the same wallpaper on all (one world
  spanning both is planned for later).
- **The wallpaper reacts to the real mouse**, on the real desktop: fish
  follow the cursor, a click on bare desktop is a tap, Neko chases the
  pointer.
- **The screen saver is a first-class citizen**, because Windows `.scr`
  files are just programs and the app can select itself as the saver in one
  click (macOS couldn't).

## 2. Goals, non-goals, anti-goals

**Goals (owner)**
1. Live wallpaper behind the icons on Windows 11, every monitor.
2. A tray icon that does everything (there are no global hotkeys, so the
   menu must be complete).
3. Per-monitor wallpapers. (Span across all monitors: later, owner.)
4. Interactive: pointer moves and desktop clicks reach the wallpaper.
   **Required.**
5. Pause per monitor when it's covered (fullscreen *or* a maximized or
   snapped window filling it).
6. On battery: drop to the power-save quality, never stop.
7. Ground lines sit above the taskbar.
8. C# (.NET), WebView2.

**Goals (proposed here, all approved by the owner)**
- The same app is the screen saver (`.scr`), sharing settings. **Built
  last**; it never holds up a release of the desktop app.
- Survives Explorer restarts, monitor hot-plug, DPI changes, sleep, lock and
  Remote Desktop without a relaunch.
- Installs per user with no admin rights, and uninstalls cleanly from
  Settings → Apps.
- Developed and built from WSL on the owner's machine; CI builds and tests it.

**Not in v1 (owner: later)**
- **Span mode** (one wallpaper across all monitors). v1's code shouldn't
  make it hard, but nothing is built for it; §6 keeps the sketch. No
  wallpaper learns about monitor edges (no Neko crossing screens).
- **Jellyfin on the Windows desktop.** Pages load from an https origin and a
  home Jellyfin server is usually plain http: mixed content and local-network
  blocks, the problem Android solved with its `MediaProxy`. In v1 Jellyfin
  shows its own offline/sign-in state like any unreachable server, is never
  picked by the saver's random pool, and the README says so. §19 has the
  later plan.

**Non-goals (owner)**
- Lock screen. Accent colour. Global hotkeys. Playlists/rotation on the
  desktop. Code signing (later; SmartScreen will warn on first run until
  then).

**Anti-goals: failure even if it "works"**
- Any wallpaper code forked or special-cased for Windows. `web/` gets only
  small, host-neutral additions (§7); a wallpaper never checks for Windows.
- Icons, desktop right-click, icon drag/drop or rubber-band selection
  breaking or lagging because of us.
- A stale frame or black desktop left behind after Quit or a crash.
- Burning GPU/CPU while nobody can see it: covered, locked, display off,
  fullscreen game.
- Stealing focus, appearing in Alt-Tab or the taskbar, or showing a console.
- Changing the user's Windows wallpaper or screen saver without asking.

## 3. What research found (Nov 2026)

| Goal | Possible? | How | Risk |
|---|---|---|---|
| Behind the icons | **Yes** | Explorer's undocumented `0x052C` message to `Progman` creates the wallpaper layer; our window goes into it. Wallpaper Engine and Lively work this way. | **Medium**: 24H2 changed the layout (below); proven in spike W0.1 |
| WebView2 in it | **Yes**, with care | WebView2 is on every Windows 11 machine (the owner's: runtime 156) | **Medium**: Chromium's occlusion tracking may think we're covered by the icons and stop rAF (W0.2) |
| Pointer moves and clicks | **Yes** | Raw Input with `RIDEV_INPUTSINK` sees the mouse with no hook and no permission; a hit test tells bare desktop from icons and apps | Low |
| Per-monitor pause | **Yes** | Enumerate top-level windows on window events; measure how much of each monitor is covered | Low |
| Screen saver | **Yes, solid** | A `.scr` is an exe run with `/s`, `/p <hwnd>`, `/c`; selecting it is `HKCU\Control Panel\Desktop` + `SystemParametersInfo` | Low (Mac's equivalent was the fragile part) |
| Per-user install, no admin | **Yes** | `%LOCALAPPDATA%\Programs\Wallpapers`, `HKCU` Run and Uninstall keys | Low |

**The 24H2 change.** Through 23H2, `0x052C` split the desktop into two
top-level `WorkerW` windows and wallpaper apps parented into the one *behind*
the icon view. From 24H2 (the owner runs **25H2, build 26200**) the desktop is
"raised": `Progman` has `WS_EX_NOREDIRECTIONBITMAP`, the icon view
(`SHELLDLL_DefView`) is a *layered child* of `Progman`, and Explorer's own
wallpaper layer is a `WorkerW` child of `Progman` below it. Lively broke on
24H2 and was fixed in 2.1.0.6. Projects that work on 24H2/25H2 report:

- Send `0x052C` with **wParam `0xD`, lParam `1`** (with `0, 0` the shell
  silently does nothing on new builds); send it only if the layer doesn't
  already exist; give Explorer up to ~2 s to build it.
- Put our window in a **layered child of `Progman` (alpha 255)**, Z-ordered
  **directly below `SHELLDLL_DefView` and above Explorer's `WorkerW`**.
  Check the order periodically and repair it only if Explorer changed it.
- The process needs a manifest declaring Windows 8–11 support (layered
  *child* windows need it).
- Read the window tree once and pick a layout: **classic** (≤ 23H2, two
  top-level `WorkerW`s, parent into the one without the icons), **raised**
  (24H2+), or **not split** (draw in front of the icons as a last resort,
  and log it).

Reports disagree on details across builds (one finds parenting into
`SHELLDLL_DefView` works where `Progman` didn't), so W0.1 tries the
candidates on the owner's 25H2 machine and records what works, like the Mac's
Spike M0.1. Sources: [lively#2074](https://github.com/lively-community/lively/issues/2074),
[kirie#11](https://github.com/UnhingedSoftware/kirie/pull/11),
[Intonaco#5](https://github.com/77worldd/Intonaco/pull/5),
[beautiful-wallpaper#83](https://github.com/C0uki/beautiful-wallpaper/pull/83).

**Occlusion.** Chromium on Windows computes native-window occlusion from the
Z-order and, when it decides a window is covered, treats the page as a
background tab: rendering stops and timers throttle. A full-screen icon
view above us may trigger that. Candidate fixes, tried in W0.2: browser
argument `--disable-features=CalculateNativeWinOcclusion` (plus
`--disable-background-timer-throttling`), or WebView2 **visual hosting**
(`CoreWebView2CompositionController` drawing into our own DirectComposition
visual), which also gives real input injection (§8). This is the analogue of
the Mac saver's occlusion gotcha. We then own visibility ourselves through
`CoreWebView2Controller.IsVisible` (§9).

**The owner's machine right now:** Windows 11 25H2, a laptop (RTX 3080 Ti
Laptop + Iris Xe, a battery), usually two monitors; this session was over
**Remote Desktop** (one virtual 2560×1440 screen, taskbar 48 px), with
Parsec and a virtual-display driver installed. So RDP and virtual displays are
first-class cases (§9), and real two-monitor testing happens at the console.

## 4. Architecture

One process, one exe. WinForms (for `NotifyIcon`, the settings window and the
WebView2 control) plus hand-written P/Invoke in one file. No other NuGet
packages but `Microsoft.Web.WebView2` (and xUnit in the test project).

```
windows/
  Wallpapers/                  net10.0-windows, WinForms, the exe
    Program.cs                 mode dispatch: app · /s /p /c (saver) · --install · --uninstall · --selftest
    App.cs                     single instance (named mutex + pipe), startup, shutdown, crash cleanup
    Tray.cs                    NotifyIcon and the whole menu (§10)
    DesktopLayer.cs            finds/creates Explorer's wallpaper layer, attaches hosts, repairs Z-order (§5)
    Desktop.cs                 one Surface per monitor; rebuilds on display change (§6)
    Surface.cs                 a host HWND + its WebView2; bounds, DPI, visibility, power push
    WebFactory.cs              the shared CoreWebView2Environment, virtual host, policies (§7)
    BingJson.cs                answers bing.json natively, like Android/Mac
    Pointer.cs                 Raw Input → pointer events in the right page (§8)
    Coverage.cs                gathers top-level window rects per monitor (math is in Core)
    Power.cs                   lock, display, sleep, battery, Energy Saver, RDP, fullscreen apps (§9)
    SettingsWindow.cs          the panel in a normal window (§11)
    PlayWindow.cs              a wallpaper in a normal focused window, for keyboard games (§8)
    Saver/                     /s full-screen windows, /p preview, /c options, watchdog (§12)
    Install.cs                 per-user install, Run key, Uninstall entry, saver selection (§13)
    Native.cs                  P/Invoke
    SelfTest.cs                --selftest (§15)
    app.manifest               PerMonitorV2 DPI, Windows 8–11 compatibility, asInvoker
  Wallpapers.Core/             net10.0, no Windows references, so it builds and tests on Linux
    Layout.cs                  modes → surfaces, insets, display keys
    CoverageMath.cs            rectangle subtraction: fraction of a work area covered
    SaverArgs.cs               /s /p:123 /p 123 /c:456 parsing (Windows passes all of these)
    AppSettings.cs             settings.json (mode, mouse, saver choices) with defaults
    PageUrl.cs                 index.html?host=windows&display=…&insets=…&screens=…
    Mirror.cs                  which wp: keys reach the saver (no secrets, no wp:hinted)
  Wallpapers.Tests/            xUnit over Core; runs in WSL and CI
  build.sh                     publish + copy web/ + version stamping (like mac/build.sh)
  release.sh                   zip, checksum, checks
```

**Host kind:** `?host=windows` (and `?host=windows-saver`). The page code stays
the same apart from §7's small additions.

**Where things live (per user):**

| What | Where |
|---|---|
| App | `%LOCALAPPDATA%\Programs\Wallpapers\` (`Wallpapers.exe`, `Wallpapers.scr`, `web\`) |
| Web storage (all wallpaper settings) | `%LOCALAPPDATA%\Wallpapers\WebView2\` (one shared user data folder) |
| App settings (display mode, mouse, saver) | `%LOCALAPPDATA%\Wallpapers\settings.json` |
| Saver mirror (if needed, §12) | `%LOCALAPPDATA%\Wallpapers\saver.json` |
| Log | `%LOCALAPPDATA%\Wallpapers\log.txt` (rolls at 1 MB, keeps one old) |

## 5. Behind the icons (`DesktopLayer.cs`)

- **Attach:** detect the layout (classic / raised / not split) as in §3.
  Create one **host window** per surface: a borderless child,
  `WS_CHILD | WS_VISIBLE | WS_CLIPCHILDREN`, layered (alpha 255) where the
  raised layout needs it, never activatable, positioned in the parent's
  client coordinates (the virtual screen's origin can be negative: a monitor
  left of or above the primary).
- **Z-order:** raised: directly below `SHELLDLL_DefView`. Classic: inside the
  back `WorkerW`. Checked on every display change and on a 5 s timer;
  repaired only when wrong.
- **Explorer restarts:** listen for the registered `TaskbarCreated` message.
  Re-detect, re-create the layer, and **re-parent the existing hosts**: the
  web views keep running, no reload, the cat doesn't lose its place.
  Also re-attach if the parent HWND dies (`IsWindow` check on the timer).
- **At login:** Explorer may not be ready. Retry the attach with backoff for
  up to 60 s, then stay running and attach on the next `TaskbarCreated`.
- **Quit and crash:** destroy the hosts, then make Explorer repaint its own
  picture by re-applying the current wallpaper path
  (`SPI_GETDESKWALLPAPER` → `SPI_SETDESKWALLPAPER` with the same path, no
  `SPIF_UPDATEINIFILE`), so no stale frame is left. The same cleanup runs from
  the unhandled-exception handler and on `WM_ENDSESSION`.
- **Not split** (a runtime safety net for a *future* Windows build that
  breaks the layer after we ship; at W0 this case means the project stops,
  §16): draw in front of the icons only if the owner ticks
  *Troubleshooting → Draw above icons*; otherwise show a tray balloon
  explaining, and keep running (the tray still works, the saver still works).

## 6. Monitors: Same and Different (`Desktop.cs`, `Core/Layout.cs`)

A tray choice, `Monitors ▸`, stored in `settings.json`:

| Mode | Surfaces | Which wallpaper | Default |
|---|---|---|---|
| **Same on all** | one per monitor | all follow `wp:current` | ✓ |
| **Different per monitor** | one per monitor | each its own (`?display=<key>`, §7) | |
| *Span across all (later)* | *one, covering every monitor* | *`?display=span`* | |

- **Display keys** must survive reboots and port changes, so not
  `\\.\DISPLAY1`: use the monitor device path from `QueryDisplayConfig` +
  `DisplayConfigGetDeviceInfo` (falls back to the GDI name), hashed to a
  short stable id (`m-3fa9c2`). Friendly names come from the same call
  ("DELL U2720Q"), for the menu.
- **Same wallpaper on two monitors in Different mode share that wallpaper's
  settings** (`wp:<id>`); only the *choice* is per monitor. *(Design call;
  keeps the panel and storage model unchanged.)*
- **Hot-plug, resolution, DPI, taskbar moves:** `WM_DISPLAYCHANGE`,
  `WM_SETTINGCHANGE` (`SPI_SETWORKAREA`) and `WM_DPICHANGED`, debounced
  500 ms, then rebuild like the Mac: surfaces whose key still exists are kept
  and moved; new monitors get a surface; gone ones are disposed. A monitor
  that comes back in Different mode gets its old wallpaper back (its key's
  `wp:current@` stays in storage).
- **DPI:** the process is PerMonitorV2. Each per-monitor surface uses its
  monitor's scale (WebView2 `RasterizationScale`), so CSS px match Windows'
  scaling on each screen.
- **Taskbar → `host.insets`:** per surface, `monitor rect − work area` on
  each side (handles a taskbar on any edge and Windows 11's taskbar on
  secondary monitors), in CSS px. Auto-hide taskbar → 0. Passed as
  `?insets=t,r,b,l` (§7). A change reloads that surface's page (rare).

**Span (later, owner: not in v1). A sketch so v1 doesn't paint it into a
corner;** v1 only needs `Layout` to return a list of surfaces, each with its
own bounds, scale, insets and display key, which span later fills with one
entry.
- One surface over the **bounding box** of all monitors. Parts of the box no
  monitor shows (monitors of different heights, or offset) are drawn but
  never seen.
- `host.screens` (a new web parameter, added with span) would list each monitor's rect inside the canvas, in
  CSS px, so a wallpaper *can* avoid the invisible parts. Nothing has to:
  most wallpapers just fill the box and look right.
- **Insets in span:** bottom = canvas bottom − the highest work-area bottom
  of any monitor, so ground lines sit above every taskbar. The same rule for
  the other edges.
- **Mixed DPI in span:** one web view has one scale; use the **primary
  monitor's**. The other monitor shows things slightly larger or smaller
  than its own scaling. Accepted; documented in the README.
- **Pause in span:** only when *every* monitor is covered.
- **Cost:** one page instead of two; at 2 × 2560×1440 the tier governor
  (§4.8) handles it as it does a 5K browser window.

## 7. Changes to `web/` (small, additive, host-neutral)

Each is useful beyond Windows and testable in a browser with URL parameters.

1. **`host=windows` / `windows-saver`** recognised by `player.js` and
   `stage.js` as host kinds (the desktop defaults: Auto, ceiling High,
   battery-aware). Today only `android` is special-cased; `mac` falls through
   to `standalone`, and that's fine for Windows too, except for the next
   items.
2. **`?insets=t,r,b,l`** (CSS px) sets `host.insets` on any host; the player
   passes it to the stage. Replaces nothing: `host=android` keeps its 48 px
   default when `insets` is absent. Lets anyone test ground lines in a
   browser: `?w=harvest&insets=0,0,48,0`.
3. **`?display=<key>`**: the player reads and writes the choice as
   `wp:current@<key>` instead of `wp:current`. Absent key → inherit
   `wp:current` (so a new monitor starts with what the others show), then
   Seasonal. Its storage listener watches the right key. Picking in the
   panel opened with `display=` persists to that key.
4. *(With span, later: `?screens=x,y,w,h;…` → `host.screens`. Not in v1.)*
5. **Power policy:** a `remote` signal (Remote Desktop session) lowers the
   ceiling to Low at 15 fps: RDP sends every changed pixel over the
   network. Reason text `remote desktop`.
6. **Tests:** unit tests for the params and the policy; a smoke
   `STAGE_CHECKS` entry proving `insets` reaches `host.insets` and
   `display=` keeps two choices apart.

## 8. The mouse (`Pointer.cs`), required

The host windows never take input: clicks belong to Explorer (icons,
right-click menu, rubber band). We *watch* the mouse and replay it into the
page, as the Mac does with its global monitor.

- **Source:** Raw Input (`RegisterRawInputDevices`, mouse,
  `RIDEV_INPUTSINK`) on a hidden message window: delivered even though we're
  never focused, no hook (so nothing Windows can time out, no lag added to
  the user's mouse). Position from `GetCursorPos` (physical px with
  PerMonitorV2); buttons from the raw flags. Unregistered while every surface
  is hidden.
- **Moves:** forwarded to the surface under the cursor, if it's visible,
  coalesced to at most 60 per second. Moves count even when the cursor is
  over an app window (fish still follow it), matching the Mac.
- **Clicks (left button only):** forwarded only on **bare desktop**:
  `WindowFromPoint` is the desktop (`SysListView32` in `SHELLDLL_DefView`,
  `Progman`, `WorkerW` or our host), and UI Automation's `ElementFromPoint`
  there isn't a `ListItem` (an icon). Down, up and click, so `host.gestures`
  sees taps and drags. A drag on bare desktop also draws Explorer's
  selection rectangle; that's expected and harmless. Right and middle
  buttons are never forwarded.
- **Coordinates:** physical px → the surface's client px → CSS px (÷ its
  rasterization scale).
- **Delivery:** first choice, if visual hosting won in W0.2,
  `CoreWebView2CompositionController.SendMouseInput`: real, trusted events
  with zero script. Otherwise the Mac's approach: `ExecuteScriptAsync`
  dispatching `PointerEvent`s and `MouseEvent`s into the active
  `iframe.stage` (same origin under our virtual host, so `contentDocument`
  is reachable). Also a `pointerleave` when the cursor leaves a surface.
- **Settings (tray):** *Wallpaper Follows the Mouse* (moves) and *Clicks on
  the Desktop Play* (taps), both on by default. Touchscreens arrive as mouse
  raw input and just work.
- **Keyboard:** never forwarded from the desktop (typing there jumps between
  icons). Wallpapers that need keys (Quest; catalog `keys`) get
  **Play in a Window**: the current wallpaper in a normal, focused,
  resizable window where keys and clicks work natively. It also covers games
  you'd rather play than watch.
- **Elevated apps:** when an admin window has focus, Windows may withhold
  input from us (UIPI). The wallpaper then just doesn't react until focus
  moves. Accepted.

## 9. Visibility and power (`Power.cs`, `Coverage.cs`)

Everything becomes `WP.power({...})` on each page, as on Mac and Android,
plus `IsVisible = false` on hidden web views (Chromium then stops rendering
outright, the biggest saving).

**Per-monitor coverage.**
- Candidates: top-level windows that are visible, not minimized, not cloaked
  (`DWMWA_CLOAKED`: other virtual desktops, suspended UWP apps, Task View),
  not ours, not shell windows (`Progman`, `WorkerW`, `Shell_TrayWnd`,
  `Shell_SecondaryTrayWnd`), and not click-through overlays
  (`WS_EX_TRANSPARENT`, or layered with alpha 0: GeForce and Discord
  overlays are full-screen and must not pause us). Rects from
  `DWMWA_EXTENDED_FRAME_BOUNDS` (excludes the invisible resize border).
- **Covered** when ≥ 97% of the monitor's work area is under candidates
  (rectangle subtraction in `Core/CoverageMath.cs`). That catches
  fullscreen, maximized and two snapped halves.
- **When:** `SetWinEventHook` (out of context) for foreground, show/hide,
  minimize start/end, move-size end, cloak/uncloak and top-level location
  changes; debounced 150 ms; plus a 2 s safety timer. An `EnumWindows` pass
  is well under a millisecond.
- **Hysteresis:** uncovered → resume at once; covered → pause after 300 ms
  (Alt-Tab and window drags don't flicker).

**All signals:**

| Signal | Windows source | Effect |
|---|---|---|
| Monitor covered | coverage, above | that surface: `hidden` |
| Fullscreen game / presentation | `SHQueryUserNotificationState` (`QUNS_RUNNING_D3D_FULL_SCREEN`, `QUNS_PRESENTATION_MODE`) | all: `hidden` |
| Locked, user switched | `WTSRegisterSessionNotification` | all: `hidden` |
| Display off, sleep | `RegisterPowerSettingNotification(GUID_CONSOLE_DISPLAY_STATE)`, `WM_POWERBROADCAST` | all: `hidden` |
| Screen saver running | the saver tells the app over the pipe; `SPI_GETSCREENSAVERRUNNING` as backup | desktop: `hidden` |
| Tray Pause | menu | all: `hidden` (paused) |
| On battery | `GUID_ACDC_POWER_SOURCE`, `GUID_BATTERY_PERCENTAGE_REMAINING` | `battery {charging, level}` → ceiling Medium, Low under 20% (existing policy) |
| Energy Saver on | `GUID_ENERGY_SAVER_STATUS` (Win 11), else `GUID_POWER_SAVING_STATUS` | `saver` → Low, 15 fps |
| Remote Desktop | `GetSystemMetrics(SM_REMOTESESSION)` + session change | `remote` → Low, 15 fps (§7) |
| Animation effects off | Chromium maps it to `prefers-reduced-motion` already | existing reduced-motion profile |

This matches the owner's rule: battery and Energy Saver *lower* quality and
never pause. Only invisibility pauses.

**GPU on hybrid laptops:** WebView2 renders on the adapter Chromium picks
(usually the one driving the display). Nothing to do; noted in the README for
anyone who wants to force the power-saving GPU in Windows' Graphics settings.

**Sound:** web views are muted (`IsMuted`) on the desktop. *Allow Sound* in
the tray (off by default) unmutes them; it matters once Jellyfin arrives
(§19). A desktop that talks unexpectedly is a failure.

## 10. The tray (`Tray.cs`)

Our icon (`web/icons/icon.svg` → `.ico` via `make icons`), tooltip = what's
showing ("Wallpapers: Snow · Fish Tank"). Left or right click opens the same
menu. Everything is here, since there are no hotkeys:

```
❄  Snow                                  (what's showing; per monitor in Different mode)
Wallpaper                             ▸  catalog list, current ticked
  — in Different mode this becomes one submenu per monitor:
Monitor 1 · DELL U2720Q (main)        ▸  Wallpaper ▸ · Surprise Me · Next · Previous · Settings…
Monitor 2 · LG 27GL850                ▸  …
Surprise Me · Next · Previous            (all surfaces, in Same mode)
───
Pause / Resume
Wallpaper Follows the Mouse           ✓
Clicks on the Desktop Play            ✓
Allow Sound
Play in a Window…                        (current wallpaper; per monitor in Different)
───
Monitors                              ▸  ● Same on All · ○ Different per Monitor   (Span added later)
                                         ── Identify Monitors (a big number on each for 3 s)
Performance                           ▸  ● Auto · Low · Medium · High · ✓ Save Power on Battery
                                         ── now: Medium, fewer · 30 fps · on battery
Settings…                                (the panel; per monitor in Different)
Screen Saver                          ▸  (§12)
───
Start with Windows                    ✓
Troubleshooting                       ▸  Open Log Folder · Reload Wallpapers · Draw Above Icons · Developer Tools (debug builds)
About Wallpapers 0.11.0
Quit
```

- The catalog and current choice come from a page, as on the Mac
  (`ExecuteScriptAsync` on the first surface: `WP.catalog`, `WP.store`).
- Menu rows show the wallpaper's `thumb.webp` as a small image (Windows 11
  decodes WebP through WIC) next to its name; falls back to the emoji.
- Performance writes `wp:performance` through the page (`WP.store`), so the
  panel, the tray and every surface agree.

## 11. Settings window (`SettingsWindow.cs`)

The panel, exactly as Android and Mac do it: a normal window with
`index.html?host=windows&panel=open` (`&display=<key>` in Different mode;
the title says which monitor). Same user data folder, so changes reach the
desktop through `storage` events, which Chromium fires across all pages of
a profile. Remembers its size and position. Closing hides it. It shows in the
taskbar only while open. The first-run hint (`wp:hinted`) is pre-set on
desktop surfaces, like the Mac, because "press , for settings" is wrong on a
desktop that ignores keys.

## 12. Screen saver (`Saver/`)

**Shape.** The same exe, installed a second time as `Wallpapers.scr` next
to `Wallpapers.exe`. `Program.cs` dispatches on arguments (`SaverArgs`
handles `/s`, `/p 123`, `/p:123`, `/c`, `/c:456`, any case, and no argument =
`/c` when the file is `.scr`).

- **`/s` run:** one topmost borderless window per monitor, each with a WebView2 on `?host=windows-saver`.
  Quality ceiling High. Exits on a key, a click, or the mouse moving more than
  8 px from where it started; the cursor is hidden. Windows' *On resume,
  display logon screen* works unchanged (Windows locks when our process
  exits).
- **`/p <hwnd>` preview:** a child window in the little monitor in
  Windows' dialog, with a live web view; if that fails, the wallpaper's
  `thumb.webp`. Exits when the parent window goes away.
- **`/c` options:** brings up the tray app (starting it if needed) and opens
  a small native dialog with the saver choices below. (Unlike the Mac's dead
  Options button, this works.)

**Choices (tray `Screen Saver ▸`):**
```
✓ Use Wallpapers as the Screen Saver…      (asks first; sets SCRNSAVE.EXE, ScreenSaveActive)
Start After                             ▸  1 · 3 · 5 · 10 · 15 · 30 min        (ScreenSaveTimeOut)
Show                                    ▸  ● Same as the Desktop · ○ A Different One Each Time · ○ One Wallpaper ▸
Change Every                            ▸  1 · 5 · 15 · 30 min                 (for "Different")
Show a Clock                            ✓  (the web clock overlay, §4.9: ?clock=drift)
Preview Now
Open Windows Screen Saver Settings…
```
Selecting writes `HKCU\Control Panel\Desktop` (`SCRNSAVE.EXE` = full path
to our `.scr`, which Windows accepts outside `System32`), then
`SystemParametersInfo(SPI_SETSCREENSAVEACTIVE / SPI_SETSCREENSAVETIMEOUT,
SPIF_SENDCHANGE)`. Group Policy can override; we detect that and say so.
"A Different One Each Time" skips Blank, Jellyfin and Bing (they need a
network), and monitors avoid each other's wallpaper, as on the Mac.

**Settings reach the saver.** First choice (W0.3): the saver opens the
**same WebView2 user data folder** as the app. WebView2 lets two processes
share one if their environment options match; they then share a browser
process and `localStorage` directly, so no mirror at all. If that proves
unreliable, the Mac's approach: the app mirrors every `wp:` key (no
`secrets`, no `wp:hinted`) to `saver.json` a second after it settles, and the
saver seeds a throwaway profile from it before the page runs.

**Watchdog** (from the Mac): the page's frame counter is checked every 4 s;
two stalls reload, the next recreates the web view, the next shows the clock
on black and retries every minute. A dead renderer
(`ProcessFailed`) takes the same path.

While the saver runs, it tells the tray app over the named pipe, and the
desktop surfaces go `hidden`.

## 13. Install, start, uninstall (`Install.cs`)

- **The download** is a zip: `Wallpapers.exe` (self-contained, single-file,
  .NET included, ~70 MB unpacked) and `web\`. Run `Wallpapers.exe` from
  anywhere: if it isn't installed, it offers **Install** (copy to
  `%LOCALAPPDATA%\Programs\Wallpapers`, create `Wallpapers.scr`, a Start menu
  shortcut, an `HKCU\…\Uninstall` entry so it's in Settings → Apps, and
  *Start with Windows* ticked), or **Just Run** from where it is.
- **Updates:** running a newer exe offers to replace the installed one
  (compared by version), restarting the app.
- **Start with Windows:** `HKCU\…\CurrentVersion\Run`.
- **Uninstall** (`--uninstall`, from Settings → Apps or the tray's About
  dialog): quits the app, restores Windows' screen saver if it was ours
  (to what it was before; we save that when selecting), removes the Run
  key, shortcut, Uninstall entry and program folder. Asks whether to keep
  settings (`%LOCALAPPDATA%\Wallpapers`).
- **SmartScreen:** an unsigned exe from the internet shows "Windows
  protected your PC" → *More info* → *Run anyway*. The README says so. Built
  locally with `make win-install`, there's no Mark of the Web and no warning.
- **Single instance:** a second launch tells the first (named pipe) to open
  Settings, and exits.
- No admin rights anywhere. No services, no scheduled tasks, no drivers.

## 14. Web view details (`WebFactory.cs`)

- One `CoreWebView2Environment` for the app, user data folder as in §4.
  Browser arguments decided in W0.2. DevTools and
  `--remote-debugging-port` only with `WP_DEBUG=1`.
- **Serving `web/`:** `SetVirtualHostNameToFolderMapping("wallpapers.example",
  <web folder>, Deny)`, so pages load from `https://wallpapers.example/`: one
  origin for every web view (shared storage), a secure context (battery
  API, geolocation), the CSP holds, no local server, no open port. `.example`
  is reserved and never resolves. `WP_WEB_ROOT` overrides the folder for
  development (§15).
- **`bing.json`:** `WebResourceRequested` for
  `https://wallpapers.example/bing.json` → `BingJson.cs` fetches Bing's
  archive natively (no CORS for the app) in `tools/bing.mjs`'s shape, cached
  an hour. `bing.js` already fetches `bing.json` on non-`http:` pages.
- **Navigation:** only our origin and `about:` load; any `http(s)` link
  (Bing's credit) opens the default browser; new windows likewise.
- **Console:** page errors go to the log (`WP_DEBUG=1`: everything).
- Default background black, so a slow first load isn't white.

## 15. Build, develop, test, ship

**Toolchain.** .NET 10 SDK (current LTS). It cross-compiles Windows desktop
apps on Linux (`EnableWindowsTargeting=true`), so the whole build runs in
WSL and on Ubuntu CI. Running it needs Windows; WSL launches Windows exes
directly.

**Make targets (new, each with a `##` description; README Development
section):**

| Target | Does |
|---|---|
| `win-build` | `windows/build.sh`: publish win-x64 self-contained single-file to `dist/win/`, copy `web/` beside it, stamp `web/manifest.json`'s version |
| `win-unit` | `dotnet test` over Core (runs in WSL/Linux, no Windows needed) |
| `win-dev` | build, copy to `%LOCALAPPDATA%\Wallpapers-dev\` on the Windows side (found with `wslpath` and `cmd.exe /c echo %LOCALAPPDATA%`), and run it with `WP_WEB_ROOT` pointing at this checkout's `web/` through `\\wsl.localhost\…`, so a web edit + *Reload Wallpapers* shows at once. Uses a separate user data folder (`Wallpapers-dev`), never the installed app's |
| `win-run` | build and run the built exe (normal settings) |
| `win-test` | `--selftest` against a throwaway user data folder (below); needs Windows (WSL interop or CI) |
| `win-install` / `win-uninstall` | install/uninstall the built app for this Windows user |
| `win-saver` | run the built `.scr /s` for 15 s and print its log |
| `win-log` | tail the log |
| `win-release` | `windows/release.sh`: build, check, `dist/wallpapers-windows-<version>.zip` + `.sha256` |

`make ci` stays as it is, except `win-unit` joins it when `dotnet` is on the
PATH (skipped with a note otherwise, so contributors without .NET aren't
blocked).

**`--selftest`** (like `mac-test`, about 30 s, prints one line per check, exits
non-zero on failure):
1. Desktop layer found (layout name logged); host attached below the icons;
   Z-order correct.
2. Every surface's page reports ready and its frame counter advances (proves
   W0.2's occlusion fix is in place).
3. A setting written in a second web view arrives as a `storage` event on the
   desktop page.
4. `WP.power({hidden})` freezes frames; resume restarts them; `IsVisible`
   follows.
5. Coverage: a test window maximized on a monitor hides that surface only;
   restoring it resumes.
6. Pointer: a synthetic move/click fed through the forwarder lands in the
   page (`host.gestures` sees a tap at the right CSS px).
7. `display=` keeps two monitors' choices apart (fake two-monitor layout, below).
8. Explorer-restart path: re-attach after destroying our parent (simulated;
   never kills the real Explorer).
9. Saver: `/s` in a harness, frames advance, input ends it; the watchdog's
   three steps; `/p` into a test parent.
10. Quit cleanup leaves no host windows.

**Core unit tests (xUnit, Linux):** surfaces and insets for side-by-side,
stacked, offset, mixed-size and negative-origin layouts; coverage math
(maximized, two snapped halves, 96% vs 98%, overlays ignored); display key
stability; saver argument forms; page URL encoding; mirror filtering.

**CI:**
- `ci` (Ubuntu): `make win-build` and `make win-unit` (cross-compile proves
  it builds on every push).
- New `win` job on `windows-2025`: `make win-test`, `make win-release`,
  upload `wallpapers-windows` artifact. *Unverified:* that the hosted runner
  has an Explorer desktop for the layer; if not, `--selftest --no-desktop`
  runs every check but 1 and 8 in a normal window, and those two are covered
  by hand.
- `release` job: attaches the zip and checksum, non-blocking like the Mac's.

**Planning for two monitors before testing on them (owner: test later, plan
now).** Development mostly happens over Remote Desktop, which shows one
virtual screen. So nothing multi-monitor may depend on a second monitor being
there to work:
- All layout logic (surfaces, insets, display keys, coverage) lives in
  `Wallpapers.Core` and is unit-tested against recorded layouts: side by
  side, stacked, offset, mixed sizes, mixed DPI, negative origins, a taskbar
  on each edge. Real layouts are captured with `Wallpapers.exe --dump-displays`
  (JSON: monitors, work areas, scales, keys) and added as fixtures.
- `WP_FAKE_DISPLAYS=<file.json>` makes the app lay its surfaces out as
  if that layout were real, each in an ordinary window (not behind the
  icons), so Different mode, the tray's per-monitor submenus,
  hot-plug (edit the file) and pointer mapping can be exercised on one
  screen. `--selftest` check 7 uses it.
- The owner's RDP client can also present both physical monitors
  (*Use all my monitors*), a cheap real two-monitor check before W6.

**By hand (the owner, at the console with two monitors, W6):** icons, right-click
menu, rubber band and icon drag still work; Win+D; Task View and virtual
desktops; a fullscreen game; snapped windows; unplug/replug a monitor; a
different scale on each monitor; sleep/wake; lock; Explorer restart from
Task Manager; RDP in and out; the saver from Windows' dialog; uninstall.

## 16. Roadmap

- **W0 Spikes: prove it (throwaway code; each ends with a result written into
  SPEC §10.25, like the Mac's M0).**
  - W0.1 Behind the icons on 25H2: a host window with a plain coloured
    panel, in each layout candidate. → visible behind icons, icons and
    right-click work, survives Explorer restart. Record what worked.
  - W0.2 WebView2 in it: `index.html?w=aquarium` animating at display rate
    behind the icons for 10 minutes. Try windowed + occlusion flags, then
    visual hosting. → pick one; record fps and CPU.
  - W0.3 Two processes on one user data folder (app + saver). → works or
    mirror.
  - W0.4 Raw Input + bare-desktop hit test: log moves and taps; icons
    excluded.
  - **Gate (owner):** W0.1 + W0.2 must pass. If a live web page can't run
    behind the icons on 25H2, **the project stops**: no tray-only or
    saver-only consolation release, and drawing in front of the icons is
    not an acceptable default. Nothing past W0 is built before the gate.
  - **Where the spikes run:** over Remote Desktop is fine for W0 (the owner's
    usual session). Record the session type with every result, measure W0.2
    with the `remote` ceiling overridden (`?tier=high`), and note that the
    console's layout must be re-checked later (§15, two-monitor pass).
- **W1 Desktop core:** project skeleton, `make win-*` targets, install-free
  run, attach, one surface per monitor in Same mode, insets, tray (pick,
  next, pause, settings, quit), settings window, bing.json, Explorer
  restart, quit cleanup, self-test checks 1–4 and 10. Web changes §7.1–7.2.
- **W2 Monitors and power:** Different mode and display keys, hot-plug and
  DPI, coverage pause, every power signal, Performance menu, Identify
  Monitors. Web §7.3, §7.5. Self-test 5, 7.
- **W3 Interactivity (required):** Raw Input, bare-desktop clicks, delivery,
  the two tray toggles, Play in a Window. Self-test 6.
- **W4 Install and release:** self-installer, Start with Windows, updates,
  uninstall, Start menu, `win-release`, CI `win` job, README sections, SPEC
  §2/§10.25 updates. The first release ships here, without the saver.
- **W5 Screen saver (last, owner):** `/s /p /c`, selection and timeout,
  choices, clock, watchdog, saver ↔ app pipe; uninstall restores Windows'
  saver. Self-test 9. Ships in the next release.
- **W6 Two-monitor pass (owner, later):** the by-hand list in §15 at the
  console with both monitors. Everything multi-monitor is built and tested
  before this (W2) against simulated layouts, so W6 is verification and
  fixes, not new design.

## 17. Risks

| Risk | Mitigation |
|---|---|
| A future Windows build changes the desktop layers again | Layout detection with three paths and clear logging; *Draw Above Icons* escape hatch; the saver and tray keep working regardless |
| Chromium occlusion stops rAF behind the icons | W0.2 before anything else; visual hosting as the fallback |
| WebView2 can't render inside a layered child | Visual hosting (DirectComposition) sidesteps redirection; W0.2 |
| Two monitors × a heavy wallpaper on a laptop | Per-monitor pause, battery ceiling, governor |
| RDP shows one virtual screen, unlike the console | Treated as its own layout: rebuild on session change, `remote` ceiling; fake layouts and fixtures (§15) cover two monitors until W6 |
| SmartScreen scares a first-time user | README; local builds aren't flagged; signing later |

## 18. Left to the builder

- Windowed vs visual hosting and the exact browser arguments (W0.2 decides).
- Exact Z-order and parent per layout (W0.1 decides).
- Menu wording and order details, thumbnail size, icon rendering.
- Log format, retry timings within the ranges given.
- Whether the saver shares the user data folder or mirrors (W0.3 decides).
- File and class names beyond the sketch in §4.

## 19. Ideas for later (not in scope)

- **Match Windows to the wallpaper:** Windows 11's Mica and the
  Alt-Tab/Task View backdrops sample the *real* wallpaper picture, not our
  window. A confirmable *Use a Still as the Windows Wallpaper* (as the Mac's
  lock-screen item does) would make them match, and would cover the lock
  screen if that's wanted later.
- **`make win-bench`:** drive the desktop web views over the DevTools port
  (`WP_DEBUG=1`) like `android-bench`, for real two-monitor numbers.
- **Desktop toys:** a double-click on bare desktop as a second gesture
  (fireworks launch a big one); the cursor as a light source in Night Train.
- **winget** manifest once releases are signed.
- **Jellyfin (owner: later).** A `WebResourceRequested` proxy on our origin
  for the user's server (API and streamed media, ranges included), like
  Android's `MediaProxy`, so no Chromium security flags are needed.

## 20. Owner decisions (2026-11-02)

1. C# / .NET with WebView2.
2. Required: behind the icons, tray with everything, per-monitor,
   interactive (mouse), per-monitor pause, battery → power save (never
   stop), ground above the taskbar.
3. No accent colour, no global hotkeys, no playlists, no lock screen,
   signing later.
4. Every addition in this design is in: screen saver, installer, recovery
   paths. **The screen saver comes last.**
5. If the wallpaper can't live behind the icons, the project stops (§16 gate).
6. Two-monitor testing later, but the implementation plans for it (§15).
7. Jellyfin on Windows later (§2, §19).
8. **Span mode later**, and no wallpaper learns about monitor edges (no
   Neko crossing screens); §6 keeps a sketch only.

**Design calls made without the owner (check these):**
- Same wallpaper on both monitors in Different mode shares its settings.
- Remote Desktop runs at Low, 15 fps (new `remote` signal).
- Covered = 97% of a monitor's work area; pause after 300 ms.
- Moves are forwarded even over app windows; clicks only on bare desktop,
  left button only; keys never (Play in a Window instead).
- Desktop web views are muted by default.
- Self-contained single-file exe (~70 MB) rather than requiring the .NET
  runtime; per-user install, no admin.
- `make ci` runs `win-unit` only when `dotnet` is installed.
