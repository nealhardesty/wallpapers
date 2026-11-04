# Windows Phase W3 (Interactivity) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The wallpaper reacts to the real mouse on the real desktop: fish follow the cursor, Neko chases it, a click on bare desktop is a tap (and a double-click a `dblclick`), on the right monitor at the right CSS point, without ever taking a click, a key or the focus away from Explorer; two tray toggles switch it; and *Play in a Window* opens the current wallpaper in a normal focused window for the ones that want keys.

**Architecture:** We watch the mouse with Raw Input (`RIDEV_INPUTSINK`, no hook) and replay it: moves go into the surface under the cursor as trusted `pointermove`s through `CompositionController.SendMouseInput`; presses are classified (bare desktop, icon, other) by `WindowFromPoint` plus UI Automation on a worker thread and, when bare, dispatched by script into the stage iframe (`SendMouseInput` presses steal the foreground: W0.4). Every decision that can be pure lives in `Wallpapers.Core` with xUnit tests: the hit-test verdict, which surface a physical point is on and its CSS coordinates (mixed DPI, fake layouts), the move throttle, the poll fallback for elevated windows, and the gesture tracker (the press decides, the release follows, double-clicks from the system's time and distance). The app gets `Pointer.cs` (Raw Input, UIA, the 30 Hz `GetCursorPos` poll) and `PlayWindow.cs`; `Surface` learns to deliver; `Desktop` tells the pointer which surfaces are visible. `web/` changes once: no corner buttons on a host whose page can't be clicked.

**Tech Stack:** as W2: .NET 10 in WSL (`EnableWindowsTargeting`), C#, WinForms, hand-written P/Invoke (`user32` Raw Input, `WindowFromPoint`, `GetCursorPos`, `GetDoubleClickTime`), `System.Windows.Automation` (`UseWPF`, for `UIAutomationClient` only, as spike W0.4), WebView2 1.0.4314.35 (`SendMouseInput`, `ExecuteScriptAsync`), xUnit v3; Node 22 for the web tests.

**Spec:** `SPEC.md` §10.25.8 (the mouse: the source of truth), §10.25.16 W3 line ("Raw Input, bare-desktop clicks, delivery, the two tray toggles, Play in a Window. Self-test 6."), §10.25.15 (self-test 6, fake layouts, the by-hand list), §10.25.10 (the two toggles and *Play in a Window…* in the menu), §10.25.21 W0.4 (what was measured; Neko is the visual check), §4.3 (`host.gestures`), §10.25.2 anti-goals (icons, right-click, rubber band, focus). W2 as built: §10.25.16 *As built* and `docs/superpowers/plans/2026-11-04-windows-w2-monitors-power.md`. W0.4's spike code (`git show 625a11d:windows/spikes/Input.cs` and `Web.cs`) is working reference for the raw-input parsing, the UIA worker and the click script; W3 rewrites it properly.

## Global Constraints

- Everything in W1's and W2's Global Constraints still holds (visual hosting with the controller on our keeper window, never steal focus, no Alt-Tab/taskbar presence but the settings and play windows while open, make targets for everything, `make ci` green, zero warnings (`TreatWarningsAsErrors`), commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`).
- **Source:** `RegisterRawInputDevices` (usage page `1`, usage `2`, `RIDEV_INPUTSINK = 0x100`) on a hidden **top-level** window of ours; `WM_INPUT = 0xFF`, `GetRawInputData` with `RID_INPUT = 0x10000003`, `RAWINPUTHEADER` 24 bytes on x64, `RAWMOUSE.usButtonFlags` at +4 (`RI_MOUSE_LEFT_BUTTON_DOWN = 1`, `RI_MOUSE_LEFT_BUTTON_UP = 2`), `lLastX`/`lLastY` at +12/+16. Position always from `GetCursorPos` (physical px). **No hook of any kind** (`SetWindowsHookEx` is forbidden). Unregistered (`RIDEV_REMOVE = 1`) while every surface is hidden or both toggles are off.
- **Hit test:** desktop classes are `SysListView32`, `SHELLDLL_DefView`, `Progman`, `WorkerW` and our `WallpapersHost`. UI Automation (`AutomationElement.FromPoint`) is asked **only** when `WindowFromPoint` is one of those, **only on a worker MTA thread**, never on the UI thread. `ListItem` → icon. Chromium's alpha-0 overlay and a *Draw Above Icons* host are `WS_EX_TRANSPARENT`, which `WindowFromPoint` skips, so the verdict is the same in both modes.
- **Buttons:** left only; right and middle are never forwarded. The press decides: a press classified bare is forwarded through its release (moves in between are drag moves to the pressed surface, even off it); a press on an icon or anything else forwards nothing, release included. **No click is ever made from the poll**, and **no button ever goes through `SendMouseInput`** (W0.4: it takes the foreground); `SetForegroundWindow` is never called.
- **Moves:** to the surface under the cursor if it's visible, over app windows too, coalesced to at most one per **16 ms** (the latest position is flushed when the burst ends); `SendMouseInput(Move, LeftButton while a gesture is in flight)`; `SendMouseInput(Leave)` when the cursor leaves a surface.
- **Coordinates:** physical → the surface's local px = `(x − Placement.Screen.Left, y − Placement.Screen.Top)` (`BoundsMode = UseRawPixels`) → CSS = local ÷ `Placement.RasterizationScale`. That is one rule for real monitors (mixed DPI: each surface its own scale) and fake layouts (the fit factor is in the scale). The monitor mode (Same/Different) changes nothing here.
- **Clicks:** script in the newest `iframe.stage`'s `contentDocument` at the CSS point on `elementFromPoint(x, y) || documentElement`: down → `pointerdown`, `mousedown` (`buttons: 1`); up → `pointerup`, `mouseup`, `click` (`buttons: 0`), plus `dblclick` (`detail: 2`) when the gesture tracker says so. Init: `bubbles, cancelable, composed, clientX, clientY, button: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true, view`. No wallpaper reads `isTrusted`.
- **Double click:** `GetDoubleClickTime()` and `GetSystemMetrics(SM_CXDOUBLECLK = 36, SM_CYDOUBLECLK = 37)`, read when the pointer starts: a second bare press within that time of the previous press, on the same surface, within `±cx/2`, `±cy/2` px. A double resets the pair (a third click is single).
- **Elevated foreground:** a **33 ms** `GetCursorPos` poll runs while the pointer is active; a poll sample counts only when raw input has been silent for **250 ms** and the position differs from the last one seen.
- **Settings:** `settings.json` gains `"followMouse"` and `"desktopClicks"`, both default `true`; old files without them read as `true`.
- **Keyboard:** never forwarded from the desktop. *Play in a Window* is `index.html?host=windows&w=<id>` in a normal, focused, resizable window using the desktop's WebView2 environment, set up as the settings window is (`desktop: false`).
- **Self-test:** never synthesizes real input (`SendInput`, `mouse_event` are forbidden; the foreground may be the owner's terminal). It feeds the forwarder directly (`Pointer.FeedForTest`) and classifies real points without clicking. It must be able to fail: write each check against a broken path first where the plan says so.
- **Build:** `UseWPF=true` in `Wallpapers.csproj` only for `UIAutomationClient` (as spike W0.4; its `DropWebView2Wpf` target stays). With `UseWPF` the implicit usings drop `System.IO`: add `<Using Include="System.IO" />`. Measure `dist/win/Wallpapers.exe` before and after and record it in the SPEC (README says about 50 MB).
- **Machine:** the owner is usually on RDP (one monitor at 200%, 32 Hz, reduced motion on). Implementers may screenshot (PowerShell `CopyFromScreen`) and read logs; they must not lock, sleep, change displays, restart Explorer or synthesize input. Real mouse work is the owner's, at the console (Task 8).

## Review Focus

1. **The mouse is busy while nothing can be seen** (locked, display off, Pause, every monitor covered). Expected: nothing is delivered and raw input isn't even registered; it comes back by itself. *(Task 4: `Pointer.Update`; Task 7: `pointer hidden`.)*
2. **A press whose verdict arrives after its release** (UIA p95 37 ms on the desktop, 178 ms max over apps; an icon double-click opens an app meanwhile). Expected: down and up reach the page in order or not at all, never an up alone, never a stuck drag. *(Task 4: both button events go through the one worker queue; Task 3: `An_up_without_a_press_is_nothing`.)*
3. **A drag that starts bare and ends somewhere else** (over an app window, the taskbar, the other monitor). Expected: the release still goes to the pressed surface so `host.gestures` ends the drag. *(Task 3: `A_release_off_the_surface_still_goes_to_the_pressed_one`.)*
4. **An elevated window has focus** (Task Manager, an installer). Expected: fish still follow at ~30 Hz; no click is ever invented. *(Task 2: `CursorSource` tests; Task 4; Task 8 by hand with Task Manager.)*
5. **Double-clicks where they don't belong**: an icon double-click (opens a file), two bare clicks on two monitors, two clicks 600 ms apart. Expected: no `dblclick` reaches any page. *(Task 3: the double-click tests.)*

---

## File Structure

```
web/core/wp.js                    + WP.cornerButtons(kind): false for android, windows, windows-saver
web/core/player.js                the corner handler uses it
tools/wp.test.mjs                 + test
windows/Wallpapers.Core/
  Pointer.cs                      HitKind, HitTest, PointerTarget, PointerHit, PointerMap, MoveThrottle, CursorSource
  Gesture.cs                      DoubleClickRule, PointerAction (Press | DragMove | Release), GestureTracker, PointerScript
  AppSettings.cs                  + FollowMouse, DesktopClicks
  PageUrl.cs                      + Play(id)
windows/Wallpapers/
  Pointer.cs                      raw input window, UIA worker, poll, throttle timer → Surface delivery
  Surface.cs                      Target, SendMove, SendLeave, SendPressAsync
  Desktop.cs                      owns the Pointer; Update on power and reconcile
  DesktopLayer.cs                 HostClass = HitTest.HostClass
  Native.cs                       + the new P/Invoke
  App.cs                          SetFollowMouse, SetDesktopClicks, OpenPlay
  Tray.cs                         the two toggles, Play in a Window… (top level and per monitor)
  PlayWindow.cs                   the current wallpaper in a focused window
  SelfTest.cs                     + pointer checks
  Wallpapers.csproj               UseWPF, Using System.IO
windows/Wallpapers.Tests/         PointerTests.cs, GestureTests.cs, + AppSettingsTests, PageUrlTests
```

---

### Task 1: Web: no corner buttons on a host whose page can't be clicked

**Files:**
- Modify: `web/core/wp.js`, `web/core/player.js` (the `corner` message handler: `const c = host === 'android' ? null : message.near`), `tools/wp.test.mjs`, `SPEC.md` §10.25.7 (a new item 7, *built in W3*)

**Interfaces:**
- Produces: `WP.cornerButtons(kind) → boolean`: `false` for `'android'`, `'windows'` and `'windows-saver'`, `true` otherwise.

Why: W3 sends trusted `pointermove`s into the desktop pages, and the stage reports a mouse near a corner to the player, which would show the ⚙ and ⛶ buttons on the desktop; a desktop click can't press them (it goes into the stage, not the player), and `,` works in *Play in a Window*. This is the owner's call (see *Decision for the owner*); the plan assumes the recommendation.

- [ ] **Step 1: Write the failing test** in `tools/wp.test.mjs`: `corner buttons: hosts that can't click the player get none`: `WP.cornerButtons('standalone') === true`, `WP.cornerButtons('extension') === true`, `WP.cornerButtons('android') === false`, `WP.cornerButtons('windows') === false`, `WP.cornerButtons('windows-saver') === false`.
- [ ] **Step 2: Run `make test`.** Expected: FAIL (`WP.cornerButtons is not a function`).
- [ ] **Step 3: Implement** `WP.cornerButtons` in `wp.js` and use it in `player.js`: `const c = WP.cornerButtons(host) ? message.near : null`.
- [ ] **Step 4: Run `make test` and `make smoke`.** Expected: PASS; the smoke's gear check (`?` help and the gear, Phase 4.4) still passes on the standalone host.
- [ ] **Step 5: Docs.** SPEC §10.25.7 item 7: *(Built in W3.)* no corner buttons for `windows` hosts, and why. Also fix §10.25.20's "design calls" line, which still says Remote Desktop runs at "Low, 15 fps": the owner's W2 decision is Low with no extra fps cap.
- [ ] **Step 6: Commit** `web: no corner buttons on hosts whose page can't be clicked (SPEC §10.25.7)`.

---

### Task 2: Core: the hit-test verdict, which surface and where, the throttle, the poll fallback

**Files:**
- Create: `windows/Wallpapers.Core/Pointer.cs`; Test: `windows/Wallpapers.Tests/PointerTests.cs`
- Modify: `windows/Wallpapers/DesktopLayer.cs` (`public const string HostClass = HitTest.HostClass;`)

**Interfaces:**
- `public enum HitKind { Bare, Icon, Other }`
- `public static class HitTest { public const string HostClass = "WallpapersHost"; public static bool IsDesktop(string windowClass); public static HitKind Kind(string windowClass, bool? uiaListItem); }`. `Kind`: not a desktop class → `Other` (UIA is never asked, `uiaListItem` is null); desktop and `true` → `Icon`; desktop and `false` or `null` (UIA failed: the spike's behaviour) → `Bare`.
- `public sealed record PointerTarget(string Key, HostPlacement Placement, bool Visible);`
- `public sealed record PointerHit(string Key, int LocalX, int LocalY, double CssX, double CssY);`
- `public static class PointerMap { public static PointerTarget? Find(IReadOnlyList<PointerTarget> targets, int x, int y); public static PointerHit Into(PointerTarget t, int x, int y); }`. `Find`: the first visible target whose `Placement.Screen` contains the point (`Rect.Contains`); `Into` maps even a point outside the target (a drag that left).
- `public sealed class MoveThrottle(int intervalMs = 16) { public (int X, int Y)? Offer(int x, int y, long nowMs); public int? DueInMs { get; } public (int X, int Y)? Flush(long nowMs); }`. `Offer` returns the point to send now, or null when it's held (then `DueInMs` says when to `Flush`, which returns the latest held point, or null).
- `public sealed class CursorSource { public const int RawSilentMs = 250; public void Raw(int x, int y, long nowMs); public bool UsePoll(int x, int y, long nowMs); }`.

- [ ] **Step 1: Write the failing tests** in `PointerTests.cs`:
  - `Desktop_classes_and_the_host_are_desktop` (a theory over the five classes → true; `Chrome_WidgetWin_1`, `CabinetWClass`, `Shell_TrayWnd` → false).
  - `Kind_is_other_off_the_desktop_icon_on_a_list_item_else_bare`: `Kind("CabinetWClass", null) == Other`; `Kind("SysListView32", true) == Icon`; `Kind("SysListView32", false) == Bare`; `Kind("Progman", null) == Bare`.
  - `Find_picks_the_monitor_under_the_point_and_maps_its_css_px_across_mixed_dpi`: targets from `Layout.Plan(displays-mixed-dpi.json)` with `new HostPlacement(p.Bounds, p.Scale)`, all visible. `(1000, 500)` → monitor 1's key, `Into` gives `LocalX 1000, LocalY 500, CssX 500, CssY 250`; `(3000, 100)` → monitor 2's key, `Local 120, 100`, `Css 120, 100`; `(6000, 100)` → null; `(2880, 0)` → monitor 2 (left edge inclusive), `(2879, 0)` → monitor 1.
  - `Find_skips_a_hidden_surface`: the same with monitor 2 `Visible: false` → `(3000, 100)` is null.
  - `Find_maps_a_fake_layout_through_its_fit`: `FakeLayout.Fit(Layout.Plan(displays-side-by-side.json), new Rect(0, 0, 2940, 1590))` as placements; the centre of monitor 2's `Screen` → monitor 2's key, `CssX` within ±1 of 960 and `CssY` within ±1 of 540 (1920×1080 at scale 1 through the fit factor).
  - `Into_maps_a_point_off_the_surface`: monitor 1 of the mixed layout, `(3000, 100)` → `CssX 1500, CssY 50`.
  - `Throttle_sends_the_first_holds_the_rest_and_flushes_the_latest`: `Offer(0, 0, 0) == (0, 0)`; `Offer(5, 5, 5) == null` and `DueInMs == 11`; `Offer(10, 10, 10) == null`; `Flush(16) == (10, 10)`; `Flush(16) == null`; `Offer(20, 20, 17) == null` and `DueInMs == 15`; `Offer(40, 40, 32) == (40, 40)` (and nothing is held: `Flush(50) == null`).
  - `Poll_counts_only_while_raw_input_is_silent_and_the_cursor_moves`: `Raw(0, 0, 0)`; `UsePoll(5, 5, 100) == false`; `UsePoll(5, 5, 250) == true`; `UsePoll(5, 5, 283) == false`; `UsePoll(9, 9, 316) == true`; `Raw(20, 20, 320)`; `UsePoll(25, 25, 350) == false`.
- [ ] **Step 2: Run `make win-unit`.** Expected: FAIL (missing types).
- [ ] **Step 3: Implement Core `Pointer.cs`** as in Interfaces, and point `DesktopLayer.HostClass` at `HitTest.HostClass`.
- [ ] **Step 4: Run `make win-unit`.** Expected: PASS (and all W1/W2 tests).
- [ ] **Step 5: Commit** `Windows W3: Core hit test, surface lookup and CSS mapping, move throttle, poll fallback`.

---

### Task 3: Core: the gesture tracker and the click script

**Files:**
- Create: `windows/Wallpapers.Core/Gesture.cs`; Test: `windows/Wallpapers.Tests/GestureTests.cs`

**Interfaces:**
- `public sealed record DoubleClickRule(int TimeMs, int Width, int Height) { public static readonly DoubleClickRule WindowsDefault = new(500, 4, 4); public bool IsDouble(int x1, int y1, long t1, int x2, int y2, long t2); }` (`t2 − t1 <= TimeMs`, `|x2 − x1| <= Width / 2`, `|y2 − y1| <= Height / 2`).
- `public abstract record PointerAction(string Key, PointerHit At); public sealed record Press(string Key, PointerHit At) : PointerAction; public sealed record DragMove(string Key, PointerHit At) : PointerAction; public sealed record Release(string Key, PointerHit At, bool DoubleClick) : PointerAction;`
- `public sealed class GestureTracker(DoubleClickRule rule) { public string? Pressed { get; } public Press? Down(PointerTarget? target, HitKind kind, int x, int y, long nowMs); public DragMove? Move(int x, int y); public Release? Up(int x, int y, long nowMs); }`. `Down` starts a gesture only when `target != null && kind == Bare` (a press on an icon or off every surface starts nothing, and clears any previous click pair). `Move` and `Up` map through `PointerMap.Into(pressed target, …)`; `Up` with nothing pressed is null. Double-click is judged from press to press on the same key; after a double the pair resets.
- `public static class PointerScript { public static string Press(bool down, double cssX, double cssY, bool doubleClick = false); }`: the script in Global Constraints, invariant culture, one decimal.

- [ ] **Step 1: Write the failing tests** in `GestureTests.cs`, with `T1` = key `m-1`, `Screen (0,0)-(2880,1800)`, scale 2 and `T2` = key `m-2`, `Screen (2880,0)-(5440,1440)`, scale 1 (the mixed-DPI layout), both visible, `rule = DoubleClickRule.WindowsDefault`:
  - `A_press_on_bare_desktop_is_forwarded_through_its_release`: `Down(T1, Bare, 100, 100, 0)` → `Press("m-1", At CssX 50, CssY 50)`, `Pressed == "m-1"`; `Move(110, 120)` → `DragMove` at `55, 60`; `Up(110, 120, 300)` → `Release` at `55, 60`, `DoubleClick false`; `Pressed == null`.
  - `A_press_on_an_icon_is_never_forwarded_even_if_it_ends_bare`: `Down(T1, Icon, …) == null`; `Move == null`; `Up == null`.
  - `A_press_off_every_surface_is_nothing`: `Down(null, Bare, …) == null`.
  - `An_up_without_a_press_is_nothing`: `Up(100, 100, 0) == null`; `Move(100, 100) == null`.
  - `A_release_off_the_surface_still_goes_to_the_pressed_one`: `Down(T1, Bare, 100, 100, 0)`; `Up(3000, 100, 200)` → `Release.Key == "m-1"`, `At.CssX == 1500`, `At.CssY == 50`.
  - `Two_quick_clicks_make_a_double_and_the_third_doesnt`: press/release at t 0/50, press/release at 400/450 → second `Release.DoubleClick == true`; press/release at 800/850 → `false` (within 500 ms of 400, but the pair reset).
  - `A_slow_second_click_isnt_double`: presses at 0 and 600 → false.
  - `A_second_click_too_far_isnt_double`: presses at `(100,100)` t 0 and `(103,100)` t 100 → false (dx 3 > 2); a third at `(102,100)` t 200 → true (dx 1 from the second, which is now the pair's first).
  - `A_second_click_on_another_surface_isnt_double`: T1 then T2 at the same instant + 100 ms → false.
  - `An_icon_click_between_two_bare_clicks_breaks_the_pair`: bare at 0, icon press at 100 (null), bare at 200 → false.
  - `Script_dispatches_the_right_events_in_order`: `Press(true, 400, 300)` contains `'pointerdown'` before `'mousedown'`, `clientX: 400.0`, and no `'click'`; `Press(false, 400, 300)` has `'pointerup'`, `'mouseup'`, `'click'` in that order and no `'dblclick'`; `Press(false, 400, 300, doubleClick: true)` ends with `'dblclick'` and `detail: 2`.
- [ ] **Step 2: Run `make win-unit`.** Expected: FAIL.
- [ ] **Step 3: Implement `Gesture.cs`.**
- [ ] **Step 4: Run `make win-unit`.** Expected: PASS.
- [ ] **Step 5: Commit** `Windows W3: Core gesture tracker (the press decides, double-clicks) and the click script`.

---

### Task 4: The pointer: Raw Input, the classifier, the poll, delivery

**Files:**
- Create: `windows/Wallpapers/Pointer.cs`
- Modify: `Native.cs`, `Surface.cs`, `Desktop.cs`, `Wallpapers.csproj` (`UseWPF`, `Using System.IO`), `windows/build.sh` only if the publish needs a change for WPF assemblies

**Interfaces:**
- `Native.cs`: `RAWINPUTDEVICE`, `RegisterRawInputDevices`, `GetRawInputData`, `GetCursorPos(out POINT)`, `WindowFromPoint(POINT)`, `GetDoubleClickTime()`, `SM_CXDOUBLECLK = 36`, `SM_CYDOUBLECLK = 37`, `WM_INPUT = 0xFF`, `RIDEV_INPUTSINK = 0x100`, `RIDEV_REMOVE = 1`, `RID_INPUT = 0x10000003`, `RI_MOUSE_LEFT_BUTTON_DOWN = 1`, `RI_MOUSE_LEFT_BUTTON_UP = 2`.
- `Surface`: `PointerTarget Target => new(Plan.Key, Placement, Visible)`; `void SendMove(int localX, int localY, bool leftDown)`; `void SendLeave()`; `Task SendPressAsync(bool down, double cssX, double cssY, bool doubleClick)` (`ExecuteScriptAsync(PointerScript.Press(…))`; a closing page is logged, never thrown).
- `sealed class Pointer : IDisposable`:
  - `Pointer(Func<IReadOnlyList<Surface>> surfaces)`; `bool Follow { get; set; } = true`; `bool Clicks { get; set; } = true`; `bool Active { get; }` (registered now).
  - `void Update()`: registers raw input and starts the 33 ms poll when `(Follow || Clicks)` and any surface's `Target.Visible`; unregisters and stops them otherwise; logs `pointer: on (raw input registered, double-click 500 ms 4x4)` / `pointer: off (<why>)` on a change.
  - Moves (`Follow`): raw `WM_INPUT` moves and accepted poll samples → `MoveThrottle` → `PointerMap.Find` over `surfaces().Select(s => s.Target)` → `SendMove(local, leftDown: tracker.Pressed == that key)`; a change of surface (or none) sends `SendLeave` to the one left. While a gesture is in flight, moves go to the pressed surface as `DragMove`s instead.
  - Presses (`Clicks`): left down/up are queued in order to one MTA worker thread; a down is classified there (`WindowFromPoint` → `HitTest.IsDesktop` → only then `AutomationElement.FromPoint` → `HitTest.Kind`); the result is posted back to the UI thread (`SynchronizationContext`) and fed to the `GestureTracker` (`DoubleClickRule` from `GetDoubleClickTime` and the two metrics). `Press` → `SendPressAsync(true, …)`; `Release` → `SendPressAsync(false, …, DoubleClick)`.
  - Logs each press verdict at `WP_DEBUG` level: `pointer: click #n down bare → m-5b3fcd (400,300) uia 11 ms`, `… down icon (not forwarded)`; once a minute at info level: `pointer: moves/s raw=… poll=… sent=…` only while non-zero.
  - `internal void FeedForTest(bool? down, int x, int y, HitKind kind = HitKind.Bare)` (null `down` = a move, for which `kind` is ignored): the same path from the throttle/tracker on, skipping Raw Input and UIA; `internal Task<(HitKind Kind, double UiaMs)> ClassifyForTest(int x, int y)`: the real classifier on the worker.
- `Desktop`: `public Pointer Pointer { get; }` created in the constructor with `() => surfaces`; `ApplyPowerAsync()` and the end of `ReconcileOnceAsync` call `Pointer.Update()`; `Dispose` disposes it.

- [ ] **Step 1: Add the P/Invoke and `UseWPF`**, build with `make win-build`. Expected: zero warnings; note the exe size against the previous build.
- [ ] **Step 2: Implement `Surface` delivery and `Pointer`** as in Interfaces. Keep the `WinEventProc`-style rule: delegates and the worker thread live in fields. The worker drains a `BlockingCollection`; `Dispose` completes it, unregisters, destroys the window.
- [ ] **Step 3: Wire `Desktop`.**
- [ ] **Step 4: Run on Windows (implementer, over RDP):** `make win-dev`, pick Fish Tank, `make win-log FLAVOR=dev FOLLOW=1`. Ask the owner to move the mouse across the desktop and over the terminal, click bare desktop twice quickly, click an icon, and drag an icon to bare desktop. Expected in the log: `pointer: on …`; `moves/s raw=… sent=…` non-zero; `down bare → m-… (x,y)`, `up`, then a second `up … dblclick`; `down icon (not forwarded)` and no `up` line for it; the icon drag: `down icon (not forwarded)` only. Food appears where the owner clicked (screenshot via `CopyFromScreen` if the owner can't say). The foreground window class in the log never becomes ours.
- [ ] **Step 5: Run on Windows (implementer):** with the owner's Task Manager open and focused, ask for a slow mouse move over the desktop. Expected: `moves/s raw=0 poll=… sent=…` (the poll carries them); afterwards `raw=…` again. Then Pause from the tray: `pointer: off (no visible surface)`; Resume: `pointer: on`.
- [ ] **Step 6: Commit** `Windows W3: the pointer: Raw Input, bare-desktop clicks by script, moves by SendMouseInput, the GetCursorPos poll`.

---

### Task 5: Settings and the tray's two toggles

**Files:**
- Modify: `windows/Wallpapers.Core/AppSettings.cs` (+ `AppSettingsTests.cs`), `App.cs`, `Tray.cs`, `Desktop.cs` (the pointer takes its toggles from settings at start)

**Interfaces:**
- Core: `AppSettings(bool DrawAboveIcons = false, Rect? SettingsBounds = null, MonitorMode Monitors = MonitorMode.Same, bool FollowMouse = true, bool DesktopClicks = true)`, serialized camelCase.
- `App.SetFollowMouse(bool on)` / `App.SetDesktopClicks(bool on)`: save, set `Desktop.Pointer.Follow` / `.Clicks`, `Pointer.Update()`, log `tray: follows the mouse off`.
- Tray (§10.25.10): after *Pause*, in this order: `Wallpaper Follows the Mouse` (checked), `Clicks on the Desktop Play` (checked), then a separator before *Monitors*. `Sync` reads the checks from `app.Settings`. `internal void ClickPointerForTest(string which)` performs the real click on `"follow"` or `"clicks"`.

- [ ] **Step 1: Write the failing tests:** `Pointer_toggles_round_trip` (`FollowMouse: false, DesktopClicks: false` → the file has `"followMouse": false` and loads equal), `Old_files_without_the_toggles_follow_and_click` (the W2 fixture string `{ "drawAboveIcons": true }` loads with both `true`).
- [ ] **Step 2: Run `make win-unit`.** Expected: FAIL.
- [ ] **Step 3: Implement the settings, the two rows and the wiring.** `Desktop`'s constructor sets `Pointer.Follow`/`Clicks` from the settings it's given (add the two to its constructor, as `MonitorMode` is).
- [ ] **Step 4: Run `make win-unit`.** Expected: PASS.
- [ ] **Step 5: Run on Windows (implementer):** `make win-run`; untick *Clicks on the Desktop Play*; ask the owner for a bare click: the log shows no `down bare →` line (the classifier isn't even run: `pointer: clicks off`). Untick both: `pointer: off (both toggles off)`. Tick both: `pointer: on`. Quit and start: the ticks are kept.
- [ ] **Step 6: Commit** `Windows W3: Wallpaper Follows the Mouse and Clicks on the Desktop Play (settings and tray)`.

---

### Task 6: Play in a Window

**Files:**
- Create: `windows/Wallpapers/PlayWindow.cs`
- Modify: `windows/Wallpapers.Core/PageUrl.cs` (+ `PageUrlTests.cs`), `App.cs`, `Tray.cs`, `README.md` (the Windows menu list)

**Interfaces:**
- Core: `PageUrl.Play(string id) → "https://wallpapers.example/index.html?host=windows&w=<id>"` (`id` URL-escaped).
- `sealed class PlayWindow : Form`: `Task ShowAsync(string id, string name, Rect monitorWork)`: one window (a second ask navigates it); title `Wallpapers · <name>`; the WinForms `WebView2` control on the desktop's environment, `WebFactory.SetUpAsync(…, desktop: false)` (not muted: see *Decision for the owner*); client size 1280×720 logical, clamped to `monitorWork` and centred on it; resizable, in the taskbar and Alt-Tab while open, keys and clicks native; `ContainsFullScreenElementChanged` → `FormBorderStyle.None` + maximized, and back (the player's `f`). Closing really closes it (the page is gone, nothing lingers); the app's cleanup closes it too.
- `App.OpenPlay(SurfacePlan? monitor = null)`: the current wallpaper of that surface (monitor 1's, or Same mode's) from the tray's last catalog answer (`CatalogInfo.Current` and its name); nothing is known yet → a log line, no window.
- Tray: `Play in a Window…` after the two toggles (Same mode: monitor 1's current; Different: monitor 1's), and a `Play in a Window…` row at the end of each per-monitor submenu (`MonitorItems` gains `Play`).

- [ ] **Step 1: Write the failing test** `Play_shows_one_wallpaper`: `PageUrl.Play("quest") == "https://wallpapers.example/index.html?host=windows&w=quest"`.
- [ ] **Step 2: Run `make win-unit`.** Expected: FAIL.
- [ ] **Step 3: Implement `PageUrl.Play`, `PlayWindow`, `App.OpenPlay` and the rows.**
- [ ] **Step 4: Run `make win-unit`.** Expected: PASS.
- [ ] **Step 5: Run on Windows (implementer):** `make win-run`, pick Quest on the desktop, *Play in a Window…*. Expected: a window titled `Wallpapers · Quest`, centred on monitor 1, Quest running in it (screenshot); the log has `play: Quest (quest) on monitor 1`. The owner presses arrow keys in it: the hero moves; `,` opens the panel in it; `f` fills the screen and `f` again restores. Close it; the desktop is unchanged. In Different mode, *Monitor 2 ▸ Play in a Window…* (fake layout over RDP: `WP_FAKE_DISPLAYS`) opens monitor 2's wallpaper.
- [ ] **Step 6: README:** add the three menu rows to the Windows list; drop "Wallpapers don't react to the mouse on Windows yet (that's coming: SPEC §10.25.8)" and say what the mouse does (moves everywhere, clicks on bare desktop only, keys never: *Play in a Window*).
- [ ] **Step 7: Commit** `Windows W3: Play in a Window`.

---

### Task 7: Self-test 6: the pointer

**Files:**
- Modify: `windows/Wallpapers/SelfTest.cs`, `README.md` (the `win-test` row)

**Interfaces:**
- Consumes: `Desktop.Pointer.FeedForTest`, `Pointer.ClassifyForTest`, `Pointer.Active`, `Tray.ClickPointerForTest`.
- The stage probe, installed in every surface after `animates` (same shape as `__selftestPower`): in the stage window `w`: `w.__pt = { moves: 0, last: null, taps: [], dbl: null }`; `w.WP.host.gestures({ tap: (x, y) => w.__pt.taps.push([x, y]) })`; `w.document.addEventListener('pointermove', e => { w.__pt.moves++; w.__pt.last = [e.clientX, e.clientY]; })`; `w.document.addEventListener('dblclick', e => w.__pt.dbl = [e.clientX, e.clientY])`. Read back as JSON.
- The test point of a surface: physical `(Placement.Screen.Left + round(400 × RasterizationScale), Placement.Screen.Top + round(300 × RasterizationScale))`; expected CSS `(400, 300)` ± 1.
- New checks, after `pause` and before `coverage`, on surface 0 unless said:
  - `pointer move`: `FeedForTest(null, P.X, P.Y)` → within 1 s `moves >= 1` and `last` within ±1 of `(400, 300)`.
  - `pointer tap`: the foreground window before; `FeedForTest(true, P, Bare)`, 50 ms, `FeedForTest(false, P, Bare)` → within 1 s `taps == [[400±1, 300±1]]`, `dbl == null`, and `GetForegroundWindow()` unchanged (`focus kept`).
  - `pointer double click`: the same again 200 ms later → `taps.Length == 2` and `dbl` within ±1 of `(400, 300)`.
  - `pointer icon`: `FeedForTest(true, P, Icon)` + up → `taps.Length` still 2 after 500 ms.
  - `pointer hidden`: `SetPausedAsync(true)` → `Pointer.Active == false`; `FeedForTest` a move and a tap → `moves` and `taps` unchanged after 500 ms; `SetPausedAsync(false)` → `Active == true`.
  - `pointer toggles`: `ClickPointerForTest("clicks")` → a bare tap isn't delivered and `app.Settings.DesktopClicks == false`; click again → delivered and `true`. The same for `"follow"` with a move.
  - `pointer classify` (the real desktop, no clicks; SKIP on `Fake`): the icons of monitor 1's `SysListView32` from UIA (`AutomationElement.FromHandle(listView).FindAll(TreeScope.Children, ControlType.ListItem)`): each centre → `ClassifyForTest` is `Icon`; a 5×4 grid over monitor 1's work area, skipping points within 8 px of an icon and points whose `WindowFromPoint` root isn't `Progman` or `WorkerW` (the terminal is there) → `Bare`. PASS when every verdict is right and there was at least one of each kind, else FAIL (or SKIP with "no icons, no bare points" when the desktop is fully covered). Detail: `n of m right; uia median x ms, p95 y ms`.
  - In `MonitorsAsync`, after `display=`: `pointer (fake monitor 2)`: the test point of `fake[1]` (its own `Placement`, so the fit factor is in it) → a tap in `fake[1]` at `(400±1, 300±1)` and none in `fake[0]`.

- [ ] **Step 1: Write `pointer tap` against a broken path first:** make `Surface.SendPressAsync` divide by `Plan.Scale` instead of `Placement.RasterizationScale`, run `make win-test` over RDP (one monitor at 200%: the two agree) *and* in the fake layout (`pointer (fake monitor 2)` fails: the fit factor is missing). Note the failing line in the commit message. Put it back.
- [ ] **Step 2: Implement the checks.**
- [ ] **Step 3: Run `make win-test`** (quit the normal app first, restart it after). Expected: all PASS over RDP, ~55 s; `pointer classify` reads `n of n right` with the UIA median under 40 ms.
- [ ] **Step 4: README** `win-test` row: add "the pointer (a move, a tap and a double-click at the right CSS px, icons and hidden surfaces ignored, the toggles, the bare-desktop classifier against your real icons, a tap on fake monitor 2)".
- [ ] **Step 5: Commit** `Windows W3: self-test pointer checks`.

---

### Task 8: The by-hand pass and docs

**Files:**
- Modify: `README.md` (Windows section: what the mouse does; the elevated-window limit; Play in a Window), `SPEC.md` (§10.25 status line; §10.25.8 *As built*; §10.25.16 W3 *As built* with the checklist below; §10.25.15 the self-test list; §10.25.3 nothing), `docs/superpowers/handoffs/2026-11-02-windows-handoff.md`, memory

- [ ] **Step 1: Run `make ci`, `make win-unit` and `make win-test`.** Expected: all green.
- [ ] **Step 2: Docs** as listed. SPEC §10.25 status: "W0 passed; W1 built; W2 built; **W3 built** (date); W4 next". Record the exe size with `UseWPF`, the UIA timings from `pointer classify`, and the app's CPU with the mouse busy (Task Manager, owner).
- [ ] **Step 3: Still to check by hand (owner, at the console with two monitors, then over RDP).** Watch `make win-log FOLLOW=1` (normal app, `make win-run`). Write the results into §10.25.16's W3 *As built*.
  1. *Neko.* Pick Neko: the cat runs to the cursor wherever it goes, over app windows too; it keeps following with a window focused. A click on bare desktop tosses yarn there.
  2. *Fish Tank.* Click bare desktop: food drops there (right place at 250% and at 150%). Double-click bare desktop: the glass is tapped (the fish startle) *and* two foods drop. Right-click: Explorer's menu opens first time, no food. Middle-click: nothing.
  3. *Icons.* Click an icon (selected, no food); double-click an icon (it opens, no food, no glass tap); drag an icon onto bare desktop (moves, no food); rubber-band from bare desktop across icons (icons selected; one gesture in the page; the drag's moves show `buttons 1`, e.g. the Fish Tank's current pushes the plants).
  4. *Apps and the taskbar.* Click in a window, on the taskbar, on the Start button: nothing forwarded. Move the mouse over a maximized window on monitor 2 while monitor 1 is uncovered: monitor 1's page gets nothing, monitor 2's is hidden (covered) so nothing either; un-maximize: moves resume at once.
  5. *Two monitors.* Different mode, Neko on monitor 2 and the Fish Tank on monitor 1: Neko follows only on monitor 2 (it never crosses: owner decision 8); a click on each monitor lands in that monitor's page at the right spot. Mixed scales: the food drops under the cursor on both.
  6. *Elevated.* Open Task Manager (console: Ctrl+Shift+Esc) and keep it focused: fish still follow (`moves/s raw=0 poll=…`); a bare click while it's focused does nothing (accepted); click the desktop once and clicks work again.
  7. *Focus.* After a bare click, type an arrow key: the desktop's icon selection moves (the key never reached us; `GetForegroundWindow` never ours in the log).
  8. *Toggles.* Untick *Wallpaper Follows the Mouse*: fish stop following, clicks still feed. Untick *Clicks on the Desktop Play*: no food. Both off: `pointer: off (both toggles off)`; Task Manager shows the app at 0.x% while the mouse is busy. Both on again. Quit and start: kept.
  9. *Hidden.* Win+L and unlock; a maximized window over the only monitor: `pointer: off (no visible surface)` and `pointer: on` back.
  10. *Draw Above Icons.* With it ticked: bare clicks feed, icon clicks don't; untick.
  11. *Play in a Window.* Quest in a window: arrows, Space, `n`, `?` help, `,`, `f`; close it. Per monitor in Different mode.
  12. *RDP.* The same items 1–2 over Remote Desktop (one monitor at 200%, 32 Hz): moves arrive (`sent=…`), clicks land where clicked; the app's CPU stays under 2% with the mouse busy.
  13. *Touch,* if a touchscreen is at hand: a tap on bare desktop feeds; a drag is a drag.
  14. *`make win-test` at the console:* `PASS pointer classify` with real icons (`n of n right`), `pointer tap` with `focus kept`.
- [ ] **Step 4: Commit** `Windows W3: docs and the by-hand checklist`, and push when the owner says so.

---

## Order and checkpoints

*Execution note (2026-11-04):* steps that say "ask the owner" to move or click the mouse can't be done by an implementer working alone. Implementers verify those paths through `Pointer.FeedForTest`, `ClassifyForTest`, the log and screenshots, never by synthesizing input, and move the real-mouse items to Task 8's by-hand list. The owner checkpoint after Task 4 joins Task 8's pass.

Task 1 (web, independent) → 2 → 3 → 4 (**owner checkpoint:** Fish Tank feeds on bare clicks over RDP, icons don't, the arrow key still reaches the desktop) → 5 → 6 → 7 → 8 (owner by-hand pass at the console). Tasks 2 and 3 are pure and can be written before Task 1. Every task ends green on `make win-unit` (and `make test` and `make smoke` for Task 1); Tasks 4–7 end green on `make win-test` as well.

## Decision for the owner

*Resolved 2026-11-04: the owner asked for W3 "done in its entirety" without stopping, so all three go with the recommendation.*

1. **The ⚙ and ⛶ corner buttons on the Windows desktop** (SPEC is silent; the Mac's desktop shows them to a mouse near a corner, which nobody could press there either). **Recommended: off for `windows` hosts, as for Android** (Task 1): a desktop click can't reach the player's button, so a gear that appears and can't be pressed is a tease; the tray and *Play in a Window*'s `,` open the panel. Alternative: leave them (no web change; a gear fades in whenever the mouse nears a desktop corner).
2. **Sound in *Play in a Window*** (§10.25.9 mutes desktop surfaces; *Allow Sound* isn't assigned to a phase). **Recommended: unmuted**, like the settings window's preview today: it's a focused window the user opened on purpose, and Quest has sound effects. Alternative: muted until *Allow Sound* is built.
3. **What a stray UIA failure does** (`AutomationElement.FromPoint` throws or times out on a desktop window, rare). **Recommended: treat the press as bare** (the spike's behaviour): the worst case is a tap the wallpaper didn't deserve; the icon still gets its click either way. Alternative: treat it as other (a lost tap).
