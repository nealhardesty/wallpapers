# Handoff: the Windows app (2026-11-02)

For whoever picks this up next (the owner, or a fresh Claude session). Read
this first, then **SPEC.md §10.25**, which is the design and the source of
truth. This file is only the session's state and context.

## 1. Where things stand

| | |
|---|---|
| Branch | `windows` (from `master` at `fd8405a`), pushed |
| PR | https://github.com/nealhardesty/wallpapers/pull/9: design only, nothing built |
| Commits | `b6da34e` design note · `c3c2f5a` SPEC §10.25 + intro, §3, open questions · this handoff |
| Design | **SPEC.md §10.25** (living version); `docs/superpowers/specs/2026-11-02-windows-design.md` (original note, marked superseded) |
| Status | **Design approved by the owner.** No code, no `windows/` folder, no Makefile targets, no README changes yet (nothing to run, so README is untouched on purpose) |
| Checks | `make lint`, `make audit`, `make test` (228 pass) all green on the branch |

**Update 2026-11-03:** the W0 plan is written
(`docs/superpowers/plans/2026-11-03-windows-w0-spikes.md`), the .NET 10 SDK is
installed in WSL (Ubuntu's `dotnet-sdk-10.0`, 10.0.114), and **W0.1 passed**
(SPEC §10.25.21: raised layout, a layered child of `Progman` below
`SHELLDLL_DefView`; the host dies with Explorer and is recreated). Spike code:
`windows/spikes/`, run with `make win-spike ARGS=…`. **W0.2 passed too: the W0
gate is passed** (visual hosting, controller parented to our own window, an
input fix for Chromium's overlay; SPEC §10.25.21). **W0.3 and W0.4 are done
as well** (the saver shares the WebView2 folder, no mirror; clicks go in by
script because a `SendMouseInput` press steals focus). **Phase W0 is complete.
Next: plan and build W1** (SPEC §10.25.16). New owner decision pending: **signing**, since Smart App
Control on this PC blocks some unsigned builds (SPEC Open questions).

**Update 2026-11-03 (later): W1 is built.** Plan
`docs/superpowers/plans/2026-11-03-windows-w1-desktop-core.md`; results in SPEC
§10.25.16 *As built*. The app (`windows/Wallpapers`, `Wallpapers.Core`,
`Wallpapers.Tests`) runs the wallpaper behind the icons on every monitor, with
the tray, the settings window and `make win-test` (all pass). The spikes are
deleted. The owner checked an RDP reconnect and resize too. **Next: plan W2**
(monitors and power, SPEC §10.25.16) with superpowers:writing-plans. Signing is
still the owner's call.

**Update 2026-11-04: W2 is built** (monitors and power). Plan
`docs/superpowers/plans/2026-11-04-windows-w2-monitors-power.md`; results and the
owner's by-hand checklist in SPEC §10.25.16 *As built*. Done: display keys,
Different mode, in-place reconcile, coverage pause, every power signal, the
Monitors and Performance menus, Identify Monitors, `WP_FAKE_DISPLAYS`; `make
win-unit` and `make win-test` pass over RDP and in fake two-monitor layouts.
**Pending:** the owner's console pass with two real monitors, then over RDP
(the checklist; lock, sleep, display-off, battery and unplug were never
triggered). Known limit: a missed display-on without a sleep leaves the
wallpaper hidden. **Next: plan and build W3** (interactivity: Raw Input,
desktop clicks, Play in a Window; SPEC §10.25.8 and §10.25.16). Signing is
still the owner's call.

**Update 2026-11-04 (later): W3 is built** (interactivity). Plan
`docs/superpowers/plans/2026-11-04-windows-w3-interactivity.md`; what was built
is in SPEC §10.25.8 *As built*, and the owner's by-hand checklist (console with
two monitors, then RDP; `make win-test` at the console so `pointer classify` can
pass) in §10.25.16's W3 *As built*. Done: Raw Input pointer, bare-desktop clicks
(UI Automation by hand-written COM, exe still ~52 MB), double-click, the two tray
toggles, Play in a Window; `make win-unit` 166 and `make win-test` pass over RDP
and in fake layouts. **Pending:** the by-hand pass. **Next: W4, install and
release** (SPEC §10.25.16): plan it with superpowers:writing-plans. Not pushed
yet when this was written.

**Update 2026-11-04 (latest): W4 is built** (install and release). Plan
`docs/superpowers/plans/2026-11-04-windows-w4-install-release.md`; what was built
is in SPEC §10.25.13 *As built*, the targets and the CI `win` job in §10.25.15,
and the owner's by-hand checklist in §10.25.16's W4 *As built*. Done: Install /
Update / Just Run, Start with Windows, the Start menu shortcut, the Settings →
Apps entry, uninstall (stage 2 from `%TEMP%`), About, `make win-install` and
`win-uninstall`, optional Azure Trusted Signing (`windows/sign.sh`, unrun
against the service), and the `win` job that self-tests the shipped zip.
Owner decisions (2026-11-04): ship unsigned first, sign before telling anyone;
no online update check; a failed Windows self-test drops the Windows zip.
**Pending:** the by-hand checklist, and **the owner's OK to cut v0.11.0** (bump
the version, tag, push the tag: nothing is tagged yet). **Next: W5, the screen
saver** (SPEC §10.25.12), then the W6 two-monitor pass.

~~**The very next step:** write the implementation plan for Phase W0.~~ Done.
Nothing past W0 is built until W0.1 and W0.2 pass. See §5 below.

Merging PR #9 before W0 is fine (it's docs only) or it can stay open and
collect the spike results. Owner's call; not discussed.

## 2. What the owner asked for, and decided

The ask: "we have a working mac wallpaper/screensaver app now… build the same
for the windows side of the world." Brainstormed, then specced.

**Required (owner):**
1. C# / .NET with WebView2.
2. Live wallpaper truly **behind the desktop icons**, Windows 11.
3. **Tray icon is a must**, and since there are **no global hotkeys**,
   *everything* must be in the tray menu.
4. **Separate wallpaper per monitor.**
5. **Interactive is required:** pointer moves and desktop clicks reach the
   wallpaper.
6. **Pause per monitor** when it's covered (fullscreen, or windows filling it).
7. **On battery: power-save quality, but never stop.**
8. **Ground lines sit above the taskbar.**

**Approved additions (proposed by Claude, owner said "I want all the features"):**
screen saver (`.scr`), per-user self-installer with uninstall in Settings →
Apps, recovery from Explorer restarts / hot-plug / DPI / sleep / lock / RDP,
WSL + CI build.

**Ordering and scope (owner):**
- **Screen saver comes last** (phase W5), after the first release (W4).
- **If the wallpaper can't live behind the icons, the project stops.** No
  tray-only or saver-only consolation release; drawing in front of the icons
  is not an acceptable default.
- **Two-monitor testing later** (W6), **but plan for it in the
  implementation** (simulated layouts, fixtures; SPEC §10.25.15).
- **Span mode later**, and **no Neko crossing monitors** ("might complicate
  things"). v1 only keeps `Layout` returning a list of surfaces so span can
  be added later; §10.25.6 keeps a sketch.
- **Jellyfin on Windows later** (https origin vs http LAN server; needs a
  proxy like Android's `MediaProxy`).
- **Not wanted:** accent colour sync, global hotkeys, playlists/rotation on the
  desktop, lock screen. **Signing later** (SmartScreen warns until then).

**Calls Claude made without the owner** (in SPEC "Open questions", each with
a recommendation; the owner hasn't objected but hasn't explicitly ruled):
shared per-wallpaper settings across monitors in Different mode; Remote
Desktop → Low at 15 fps (new `remote` power signal); "covered" = 97% of the
work area, pause after 300 ms; desktop web views muted by default; one
self-contained ~70 MB exe; `make ci` runs `win-unit` only when `dotnet` exists.

## 3. The design in one screen (details: SPEC §10.25)

- **One process, one exe**, WinForms + hand-written P/Invoke, NuGet only
  `Microsoft.Web.WebView2` (+ xUnit for tests). Projects: `windows/Wallpapers`
  (net10.0-windows), `windows/Wallpapers.Core` (net10.0, pure logic, tests run
  on Linux), `windows/Wallpapers.Tests`.
- **Behind the icons:** send `0x052C` to `Progman` (wParam `0xD`, lParam `1`
  on 24H2+), detect layout (classic ≤23H2 / raised 24H2+ / not split), put a
  layered child host (alpha 255) inside `Progman` directly below
  `SHELLDLL_DefView` (raised) or in the back `WorkerW` (classic). Re-parent on
  the `TaskbarCreated` message (Explorer restart) without reloading pages.
  Quit/crash: destroy hosts, re-apply the user's wallpaper path to repaint.
- **WebView2:** one shared user data folder `%LOCALAPPDATA%\Wallpapers\WebView2`
  (shared `localStorage`, `storage` events across pages), `web/` served at
  `https://wallpapers.example/` via `SetVirtualHostNameToFolderMapping`,
  `bing.json` answered natively in `WebResourceRequested`, links open the
  browser, `IsVisible=false` when hidden.
- **Monitors:** *Same on All* (default, `wp:current`) or *Different per
  Monitor* (`?display=<key>` → `wp:current@<key>`). Keys from the monitor
  device path (`QueryDisplayConfig`), hashed. Per-monitor DPI. Taskbar →
  `?insets=t,r,b,l`.
- **Mouse:** Raw Input with `RIDEV_INPUTSINK` (no hook) + `GetCursorPos`.
  Moves forwarded anywhere on a visible monitor (≤60/s); left clicks only on
  bare desktop (`WindowFromPoint` is the desktop and UI Automation says it's
  not a `ListItem`/icon). Delivered by `SendMouseInput` if visual hosting won
  W0.2, else by script dispatching into `iframe.stage` (the Mac's way).
  Keys never; **Play in a Window** for keyboard games (Quest).
- **Power:** per-monitor coverage from `EnumWindows` (skip cloaked, shell,
  click-through overlays; `DWMWA_EXTENDED_FRAME_BOUNDS`) on WinEvent hooks;
  plus fullscreen D3D/presentation, lock, display off, sleep, saver running,
  tray Pause → `hidden`; battery → `battery`; Energy Saver → `saver`; RDP →
  `remote`. All as `WP.power({...})`.
- **Web changes (small, additive):** `host=windows`/`windows-saver` kinds;
  `?insets=`; `?display=`; `remote` in `WP.powerPolicy`; unit + smoke tests.
  When built, document them in SPEC §4.2 (params) and §4.3 (host).
- **Saver (last):** same exe copied as `Wallpapers.scr`; `/s /p /c`; selects
  itself via `HKCU\Control Panel\Desktop` + `SystemParametersInfo` (asks
  first); settings by sharing the WebView2 folder (W0.3) or a `saver.json`
  mirror like the Mac's `SaverSync`; web clock overlay via `?clock=drift`;
  the Mac's watchdog.
- **Make targets (planned):** `win-build`, `win-unit`, `win-dev`, `win-run`,
  `win-test`, `win-install`, `win-uninstall`, `win-saver`, `win-log`,
  `win-release`. Each needs a `##` description and a README Development line
  when added (AGENTS.md).
- **Roadmap:** W0 spikes (gate) → W1 desktop core → W2 monitors + power →
  W3 mouse → W4 install + first release → W5 screen saver → W6 two-monitor
  pass at the console.

## 4. Facts about the owner's machine (checked this session)

- **Windows 11 25H2, build 26200.** This is the "raised desktop" era, so the
  24H2 recipe applies.
- **It's a laptop**: NVIDIA GeForce RTX 3080 Ti Laptop GPU + Intel Iris Xe
  (hybrid graphics), one battery. Normally docked to **two monitors**.
- **This session was over Remote Desktop** (`SESSIONNAME=RDP-Tcp#0`,
  `TerminalServerSession=True`). Windows then reported **one virtual screen,
  2560×1440, work area 2560×1392 (48 px taskbar at the bottom)**, device
  `\\.\DISPLAY65`. Real two-monitor geometry hasn't been captured yet;
  `Wallpapers.exe --dump-displays` (planned) will do it at the console.
- Also installed: **Parsec Virtual Display Adapter**, **SudoMaker Virtual
  Display Adapter**, Microsoft Remote Display Adapter. Virtual displays may
  show up as monitors; the design treats them like any monitor.
- **WebView2 Runtime 156.0.4314.58** is installed (evergreen).
- **.NET:** Windows has `C:\Program Files\dotnet\dotnet.exe` but
  `dotnet --list-sdks` printed **no SDKs** (runtime only). **WSL has no
  `dotnet` at all.** Install the **.NET 10 SDK in WSL** before building
  (`EnableWindowsTargeting=true` cross-compiles WinForms on Linux).
- **WSL ↔ Windows:** interop is enabled, but **`cmd.exe` and `powershell.exe`
  aren't on the WSL PATH**. Use full paths:
  - `/mnt/c/Windows/System32/cmd.exe`
  - `/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe`
  - Find `%LOCALAPPDATA%` from WSL with
    `wslpath "$(/mnt/c/Windows/System32/cmd.exe /c echo %LOCALAPPDATA% | tr -d '\r')"`
    (the Windows user name is deliberately not written in this public repo).
  - Pipe PowerShell output through `tr -d '\r'`.
  - Windows exes launched from WSL show up in the **current interactive
    session** (over RDP: the RDP desktop).
- **VS Code** is a per-user install (`%LOCALAPPDATA%\Programs\Microsoft VS
  Code`), not under `Program Files`. The `code` alias in the owner's
  `~/.zshrc` was repointed there this session (backup:
  `~/.zshrc.bak-2026-11-02`).

## 5. Phase W0: what to do next, concretely

Write the plan with `superpowers:writing-plans`, then run it. Spikes are
**throwaway code** (e.g. `windows/spikes/`, or scratch outside the repo); each
records its result in **SPEC §10.25.21 Spike results**: Windows build, session
type (console or RDP), monitors, what was tried, what worked, numbers.

Prerequisite: .NET 10 SDK in WSL; a tiny `make win-spike` (or similar) that
publishes win-x64 and launches the exe on the Windows side from WSL.

- **W0.1 Behind the icons on 25H2.** A host window with a plain coloured
  fill (no WebView yet). Try in order: (a) layered child of `Progman` (alpha
  255) placed directly below `SHELLDLL_DefView`; (b) child of the `WorkerW`
  that's a child of `Progman`; (c) child of `SHELLDLL_DefView` at the bottom.
  Send `0x052C` with `(0xD, 1)` first, only if the layer is missing; wait up
  to 2 s. Pass = visible behind the icons; icons, right-click menu, rubber
  band and icon drag still work; survives restarting Explorer (re-parent on
  `TaskbarCreated`). App manifest must declare Windows 8–11 support.
- **W0.2 WebView2 animating in it.** `index.html?w=fishtank&tier=high`
  (force High, since RDP would otherwise drop to Low later). Try (a)
  windowed WebView2 with `--disable-features=CalculateNativeWinOcclusion
  --disable-background-timer-throttling`, then (b) visual hosting
  (`CoreWebView2CompositionController` + DirectComposition). Pass = page
  frame counter advances at display rate for 10 minutes behind the icons.
  Record fps and CPU (app + `msedgewebview2.exe` processes).
- **W0.3 Two processes, one WebView2 user data folder** (app + a second exe
  standing in for the saver). Works → the saver needs no mirror; flaky →
  mirror to `saver.json`.
- **W0.4 Raw Input + bare-desktop hit test.** Log moves and left clicks; a
  click on an icon must *not* count, a click on empty desktop must.
- **Gate:** W0.1 and W0.2 must pass; if they can't, write that up in
  §10.25.21 and stop (owner decision). Over RDP is fine for W0; note the
  console must be re-checked later (W6). The RDP client's *Use all my
  monitors* is a cheap real two-monitor check before W6.

Risks to watch in W0 (SPEC §10.25.17): Chromium's native-window occlusion
throttling behind the icon view; WebView2 not rendering inside a layered child
(visual hosting sidesteps it); RDP possibly laying out the desktop differently
from the console.

## 6. Research behind the design (sources)

- 24H2 changed the desktop tree ("raised desktop": `Progman` has
  `WS_EX_NOREDIRECTIONBITMAP`, icon view is a layered child of `Progman`,
  wallpaper `WorkerW` is a child below it); `0x052C` needs `(0xD, 1)`; Lively
  broke on 24H2 and was fixed in 2.1.0.6. Reports disagree on details by
  build, hence the spike.
  - https://github.com/lively-community/lively/issues/2074
  - https://github.com/UnhingedSoftware/kirie/pull/11 (layout detection,
    layered holder below `SHELLDLL_DefView`, Z-order repair, manifest note)
  - https://github.com/77worldd/Intonaco/pull/5
  - https://github.com/C0uki/beautiful-wallpaper/pull/83
  - https://www.deskmodder.de/blog/author/moinmoin/page/133 (Lively 2.1.0.6)
- Chromium's Windows occlusion tracking: covered windows are treated as
  background tabs (rendering stops, timers throttle):
  https://chromium.googlesource.com/chromium/src/+/main/docs/windows_native_window_occlusion_tracking.md
- A community report of WebView2 pausing rAF and timers when the window was
  considered occluded, fixed by disabling occlusion-backgrounding plus a
  watchdog: https://github.com/ArdaDDemir/crew/releases/tag/v0.12.9
- Microsoft is testing native video wallpapers in 24H2/25H2 preview builds
  (Beta channel only); not something we can build on.

## 7. Reuse map: Mac app → Windows app

| Mac (`mac/Wallpapers/`) | Windows (planned) | Notes |
|---|---|---|
| `Desktop.swift` (window per screen, rebuild, power push, pointer script, bare-desktop test) | `Desktop.cs`, `Surface.cs`, `Pointer.cs` | `pointerScript` is the template for script delivery |
| `MenuBar.swift` (catalog read via JS, picker, Surprise/Next/Prev, Pause, mouse toggle, saver submenu, login item) | `Tray.cs` | Same menu shape, plus per-monitor submenus, Monitors, Performance, Troubleshooting |
| `WebFactory.swift` (shared store, quiet `wp:hinted`, sync script, nav policy) | `WebFactory.cs` | Virtual host instead of the `wp://` scheme |
| `AssetScheme.swift` | `SetVirtualHostNameToFolderMapping` | |
| `Power.swift` | `Power.cs`, `Coverage.cs` | |
| `SaverSync.swift` (mirror `wp:` keys minus secrets and `wp:hinted`) | *(not needed: W0.3, the saver shares the user data folder)* | |
| `Saver/WallpapersSaverView.swift` (watchdog: 4 s checks, reload → rebuild → clock) | `Saver/` | Use the web clock overlay, not a native clock |
| `SettingsWindow.swift` | `SettingsWindow.cs` | |
| `SelfTest.swift`, `mac-test` | `SelfTest.cs`, `win-test` | |
| `mac/build.sh`, `mac/release.sh`, CI `mac` job | `windows/build.sh`, `windows/release.sh`, CI `win` job | Release job attaches the zip non-blocking, like the Mac's |

Web side: the player and stage detect host kinds in `web/core/player.js`
(line ~10) and `web/core/stage.js` (line ~92); insets are hard-coded there for
`android` (48 px). `WP.powerPolicy` is in `web/core/perf.js` (~line 126).
`mac` isn't a host kind in the web code; it falls through to `standalone`.

## 8. Repo rules to remember (AGENTS.md)

- Read SPEC before changing anything; keep SPEC and README current.
- Everything runnable gets a `make` target with a `## description`; CI calls
  make targets only; new targets go in README's Development section.
- No inline `<script>`/`on…=` (CSP); no API keys; no real names/locations in
  code, docs, tests or fixtures.
- `make ci` must pass.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
  PR bodies end with the Claude Code line.
- Small, surgical changes; nothing speculative.

## 9. Suggested prompt to resume

> Read `docs/superpowers/handoffs/2026-11-02-windows-handoff.md` and SPEC.md
> §10.25. We're on branch `windows` (PR #9). Write the implementation plan for
> Phase W0 (the spikes) with superpowers:writing-plans, then let's run W0.1.
