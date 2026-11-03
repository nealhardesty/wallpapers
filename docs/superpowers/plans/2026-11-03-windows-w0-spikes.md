# Windows Phase W0 (Spikes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove, on the owner's Windows 11 25H2 machine, that a window can live behind the desktop icons (W0.1) and that a WebView2 page animates there at display rate (W0.2), then settle the saver's settings path (W0.3) and the mouse path (W0.4). Every result is written into SPEC §10.25.21.

**Architecture:** One throwaway console exe, `windows/spikes/` (`Spike.exe`), with one subcommand per experiment (`tree`, `layer`, `check`, `web`, `share`, `input`, plus helpers). It is cross-compiled in WSL with the .NET 10 SDK, copied to `%LOCALAPPDATA%\Wallpapers-spike\` on the Windows side, and launched from WSL through interop by one make target. Each experiment's pass criteria are written as an automated `check` (or probe log) *before* the code that should pass it. Items a script can't judge (icon drag, rubber band) get an explicit owner-by-eye step. Nothing here is production code: W1 starts fresh in `windows/Wallpapers*` and deletes `windows/spikes/`.

**Tech Stack:** .NET 10 SDK (WSL, `EnableWindowsTargeting=true`), C# 14, WinForms (message loop, `NativeWindow`, timers), hand-written P/Invoke, UI Automation (`UIAutomationClient`, via `UseWPF`), `Microsoft.Web.WebView2` (from W0.2), DirectComposition by COM interop (W0.2b), bash + make.

**Spec:** `SPEC.md` §10.25 (esp. §10.25.3, .5, .8, .14, .16, .17, .21) and the session handoff `docs/superpowers/handoffs/2026-11-02-windows-handoff.md` (§4 machine facts, §5 W0).

## Global Constraints

- Gate (owner): **W0.1 and W0.2 must both pass, or the project stops.** Write the failure up in §10.25.21 and build nothing past W0. Drawing in front of the icons is not an acceptable outcome, and there is no consolation release.
- Windows: 11 25H2, build 26200 ("raised desktop"); session normally **RDP** (`SESSIONNAME=RDP-Tcp#…`). Record session type, monitors (count, px, work area) and scaling with **every** result.
- `0x052C` to `Progman` with **wParam `0xD`, lParam `1`**. Send it **only if the layer is missing**, then wait **up to 2 s**.
- The app manifest declares Windows 8, 8.1 and 10/11 in `supportedOS`, with `PerMonitorV2` DPI awareness and `asInvoker`.
- Layered hosts use **alpha 255** (`SetLayeredWindowAttributes(…, 255, LWA_ALPHA)`).
- Hosts never take focus or input: `WS_EX_NOACTIVATE`, and they never appear in Alt-Tab or the taskbar.
- W0.2 page: `index.html?w=aquarium&tier=high`, served at `https://wallpapers.example/` by `SetVirtualHostNameToFolderMapping(…, Deny)`. Occlusion flags to try first: `--disable-features=CalculateNativeWinOcclusion --disable-background-timer-throttling`. Soak: **10 minutes**.
- Spike user data and binaries live in `%LOCALAPPDATA%\Wallpapers-spike\`, never the planned app's folders.
- Public repo (AGENTS.md, `tools/audit.mjs`): nothing committed may contain a home path (`/home/<user>`, `C:\Users\<user>`), an email address, the Windows user name, or any hex run of 32 characters or more. Strip these from logs before pasting them into SPEC. The spike prints paths relative to `%LOCALAPPDATA%`.
- Everything runnable is a make target with a `## description` and a README Development row. CI calls make only. `make ci` stays green (spikes aren't added to it).
- Never kill Explorer without the owner's go-ahead in the moment. Never change the user's wallpaper or saver setting. The repaint re-applies the *same* path without `SPIF_UPDATEINIFILE`.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commit or push only when the owner says so.

## Review Focus

1. **Explorer restart destroys our host.** A child window usually dies with its parent, and here the parent (`Progman`) belongs to Explorer. §10.25.5's "re-parent the existing hosts, no reload" may be impossible. Expected: `layer` logs whether `IsWindow(host)` is still true after `TaskbarCreated`, re-creates the host if not, and ends up with a passing `check`. W0.2 repeats this with a live page and records whether it reloads. *(Task 3, Task 5 step 7)*
2. **Session scaling isn't 100%** (RDP picks the client's scale; the console laptop panel is probably 150%). Expected: host rect == monitor rect in physical px. `check` asserts it, and the result records the scale. *(Task 2 check 4)*
3. **Desktop icons hidden or none on the desktop.** Expected: the icon checks print `SKIP` (not `FAIL`), and the layer is still found because `SHELLDLL_DefView` exists while hidden. *(Task 2 checks 7–8)*
4. **The spike killed without cleanup** (Ctrl+C through WSL interop, a crash, `taskkill`). Expected: no stale magenta desktop. Cleanup runs on `CancelKeyPress`, `ProcessExit` and unhandled exceptions, and `repaint` restores Explorer's picture by hand. *(Task 3 steps 4–6)*
5. **Wallpaper is a solid colour, slideshow or Spotlight**: `SPI_GETDESKWALLPAPER` returns an empty or transient path. Expected: repaint skips an empty path and logs it, never setting `""`. The result records the owner's wallpaper type. *(Task 3 step 2)*

---

## File Structure

```
windows/spikes/                 throwaway; deleted at W1
  Spike.csproj                  net10.0-windows, Exe, WinForms+WPF refs, self-contained win-x64
  app.manifest                  supportedOS Win8–11, PerMonitorV2, asInvoker
  Program.cs                    subcommand dispatch + shared options (--mode, --seconds, --layered)
  Native.cs                     every P/Invoke and constant
  Log.cs                        timestamped lines to stdout and spike.log
  DesktopTree.cs                snapshot + print the shell's window tree; classify layout; EnsureLayer()
  Host.cs                       one host HWND per monitor (NativeWindow): fill, clock, attach/reattach
  Layer.cs                      `layer`: attach in a mode, TaskbarCreated, 5 s z-order/IsWindow timer, cleanup
  Check.cs                      `check`: automated pass/fail for W0.1 (separate process)
  Shell.cs                      `repaint`, `stop`, `restart-explorer`
  Web.cs                        W0.2 `web`: WebView2 windowed|visual in the host, frame + CPU probes
  Dcomp.cs                      W0.2b DirectComposition COM interop (3 interfaces, only used methods)
  Share.cs                      W0.3 `share`
  Input.cs                      W0.4 `input`
  run.sh                        build in WSL, copy to the Windows side, run with ARGS, fetch outputs
Makefile                        + win-spike target
.gitignore                      + windows/**/bin/, windows/**/obj/
README.md                       + one Development row (marked temporary)
SPEC.md                         §10.25.21 results (each task); §10.25 status line at the gate
docs/superpowers/handoffs/2026-11-02-windows-handoff.md   "where things stand" at the end
```

Window class names (all tasks rely on these): host `WallpapersSpikeHost`, message window `WallpapersSpikeMsg`. Host window text is `spike:<mode>:<RRGGBB>` so `check` can learn the mode and colour. Stop event: `Local\WallpapersSpikeStop`.

Mode colours: `raised` `#FF00C8`, `workerw` `#00C8FF`, `defview` `#C8FF00`, `window` (a normal top-level control window, W0.2) `#FFAA00`.

---

### Task 0: Toolchain and spike skeleton (`tree`)

**Files:**
- Create: `windows/spikes/Spike.csproj`, `app.manifest`, `Program.cs`, `Native.cs`, `Log.cs`, `DesktopTree.cs`, `run.sh`
- Modify: `Makefile` (target + `.PHONY`), `.gitignore`, `README.md` (Development table, after the `mac-*` rows)

**Interfaces:**
- Produces: `make win-spike ARGS="<subcommand> [opts]"`. Outputs land in `dist/win-spike/` (`spike.log`, PNGs).
- Produces: `DesktopTree.Snapshot() -> TreeSnapshot`, with `IntPtr Progman, DefView, DefViewParent, ListView, WallpaperWorkerW` (Progman's `WorkerW` child in raised, or the top-level `WorkerW` without `SHELLDLL_DefView` in classic), `string Layout` (`"raised"|"classic"|"not-split"`), and `IReadOnlyList<WinInfo> Windows`.
- Produces: `DesktopTree.EnsureLayer() -> (TreeSnapshot snap, bool sentMessage, int waitedMs)`.
- Produces: `record WinInfo(IntPtr Hwnd, IntPtr Parent, string Class, string Text, uint Style, uint ExStyle, RECT Rect, int Depth, int ZIndex, int Pid)`.

- [ ] **Step 1: Install the .NET 10 SDK in WSL.** If `apt-cache policy dotnet-sdk-10.0` shows a candidate and passwordless sudo works, use `sudo apt-get install -y dotnet-sdk-10.0`. Otherwise run Microsoft's `dotnet-install.sh --channel 10.0 --install-dir ~/.dotnet` (no sudo). Verify that `~/.dotnet/dotnet --version` (or `dotnet --version`) prints `10.0.x`.

- [ ] **Step 2: Write `Spike.csproj`.** Set `TargetFramework net10.0-windows`, `OutputType Exe`, `UseWindowsForms true`, `UseWPF true` (only for `UIAutomationClient`), `EnableWindowsTargeting true`, `RuntimeIdentifier win-x64`, `SelfContained true`, `Nullable enable`, `AllowUnsafeBlocks true`, `ApplicationManifest app.manifest` and `InvariantGlobalization true`. No NuGet packages yet. `app.manifest` declares `supportedOS` for Win8 `{4a2f28e3-53b9-4441-ba9c-d69d4a4a6e38}`, Win8.1 `{1f676c76-80e1-4239-95bb-83d0f6d0da78}` and Win10/11 `{8e0f7a12-bfb3-4fe8-b9a5-48fd50a15a9a}`, plus `dpiAwareness PerMonitorV2` and `requestedExecutionLevel asInvoker`.

- [ ] **Step 3: Write `run.sh` and the target.** `run.sh`:
  1. `$DOTNET publish windows/spikes -c Release -o dist/win-spike/bin --nologo -v q`.
  2. Find the Windows side with `WIN=$(wslpath "$(cmd.exe /c echo %LOCALAPPDATA% | tr -d '\r')")/Wallpapers-spike`, using full paths to `cmd.exe` (handoff §4).
  3. `rsync -a --delete dist/win-spike/bin/ "$WIN/bin/"`. From Task 4 on, also `rsync -a --delete --exclude bing.json web/ "$WIN/web/"`.
  4. `cd "$WIN"` (so the Windows process gets a Windows cwd), then run `"$WIN/bin/Spike.exe" $ARGS`. `Log.cs` writes `spike.log` next to `bin/`.
  5. Copy `$WIN/*.png` and `spike.log` back to `dist/win-spike/`.

  In the Makefile, set `DOTNET ?= $(shell command -v dotnet 2>/dev/null || echo $(HOME)/.dotnet/dotnet)` and add `win-spike: ## Windows Phase W0 spikes (throwaway, SPEC §10.25.21): build windows/spikes in WSL and run it on the Windows side (ARGS="tree", "layer --mode raised", "check", …)`. Add it to `.PHONY`. Add the README row: `` `make win-spike` | Temporary, for the Windows design's W0 spikes: build the spike exe and run it on the Windows side, `ARGS="tree"` etc. (SPEC §10.25.21) ``. `.gitignore` gets `windows/**/bin/` and `windows/**/obj/`.

- [ ] **Step 4: Run it before `tree` exists.** Run `make win-spike ARGS=tree`. Expected: the build succeeds, and the exe prints `unknown command: tree` and exits 2. This proves the cross-compile, the copy, interop and stdout. If `UseWPF` fails to cross-compile, drop it, record that as a W1 finding, and use `LVM_GETITEMRECT` through `VirtualAllocEx`/`ReadProcessMemory` in Task 2 check 7 instead.

- [ ] **Step 5: Implement `tree`** (`DesktopTree.Snapshot` and a printer). Enumerate top-level windows of class `Progman` and `WorkerW` (`EnumWindows`), and every descendant of each (`EnumChildWindows`, depth from `GetParent` chains, z-index from `GetWindow(GW_CHILD/GW_HWNDNEXT)` order). Print one line per window: indent by depth, then `hwnd class "text" style=0x… ex=0x… rect=l,t,r,b z=n pid=n`. Then print `layout=<raised|classic|not-split>`: raised if `SHELLDLL_DefView`'s parent is `Progman`; classic if its parent is a top-level `WorkerW`; otherwise not-split. Also print the monitors (`EnumDisplayMonitors` + `GetMonitorInfo`: device, rect, work, primary, `GetDpiForMonitor` effective DPI), `SESSIONNAME`, `GetSystemMetrics(SM_REMOTESESSION)`, `RtlGetVersion` build and the wallpaper path (`SPI_GETDESKWALLPAPER`, shown as `<set>`/`<empty>` and its file extension, never the full path).

- [ ] **Step 6: Run it.** Run `make win-spike ARGS=tree`. Expected: `layout=raised`, `Progman` with a `SHELLDLL_DefView` child (`WS_EX_LAYERED` set) containing `SysListView32`, and one monitor (RDP). Note whether Progman already has a `WorkerW` child. Paste the redacted tree into a scratch note for Task 6.

- [ ] **Step 7: Implement `tree --ensure`** (`DesktopTree.EnsureLayer`). If the layout is raised and `WallpaperWorkerW` exists, or classic, return without sending. Otherwise `SendMessageTimeout(Progman, 0x052C, 0xD, 1, SMTO_NORMAL, 1000, out _)` and re-snapshot every 100 ms for up to 2000 ms until the layer appears. Print `sent=<bool> waited=<ms>` and the tree again.

- [ ] **Step 8: Run it.** Run `make win-spike ARGS="tree --ensure"`. Expected: `layout=raised` with a `WorkerW` child of `Progman` below `SHELLDLL_DefView`. Record `sent` and `waited`.

- [ ] **Step 9: Run `make lint audit test`.** Expected: all green, with no audit hits from `windows/spikes/`.

- [ ] **Step 10: Commit** (when the owner OKs commits): `git add windows/spikes Makefile .gitignore README.md && git commit -m "Windows W0: spike skeleton, win-spike target, desktop tree dump"`.

---

### Task 1: The W0.1 check, written first (`check`)

**Files:**
- Create: `windows/spikes/Check.cs`
- Modify: `windows/spikes/Program.cs`, `Native.cs`

**Interfaces:**
- Consumes: `DesktopTree.Snapshot()`, `WinInfo`.
- Produces: `check [--interact] [--after-quit] [--tag <name>]`, which prints `PASS|FAIL|SKIP  <name>  <detail>` lines, exits 0 only if nothing failed, and saves `check-<tag>.png`.

Checks, in order (each a `PASS/FAIL/SKIP` line). The hosts are found by walking all children of `Progman` and of every top-level `WorkerW` for class `WallpapersSpikeHost`, and the mode and colour come from the host's text:

1. `hosts`: the number of hosts equals the number of monitors.
2. `parent`: `raised` → `GetParent(host) == Progman`; `workerw` → `== WallpaperWorkerW`; `defview` → `== DefView`.
3. `z-order`: `raised` → `GetWindow(DefView, GW_HWNDNEXT) == host` (directly below the icon view) **and** the host is above `WallpaperWorkerW` in Progman's child order. `defview` → `GetWindow(host, GW_HWNDNEXT) == 0`. `workerw` → the host is a child of the layer (z is moot).
4. `bounds`: `GetWindowRect(host)` equals its monitor's rect, in physical px.
5. `visible`: `IsWindowVisible(host)`, and for layered hosts `GetLayeredWindowAttributes` alpha == 255.
6. `pixels`: capture each monitor (`Graphics.CopyFromScreen`). PASS if ≥ 50% of its pixels are within ±10 per channel of the host colour; report the %.
7. `icons-in-front`: list the desktop icons (UIA: `AutomationElement.FromHandle(ListView)`, then `FindAll(Children, ControlType.ListItem)`, with `BoundingRectangle`). For each icon, sample a 5×5 grid inside its rect. PASS if every icon has ≥ 1 sample that is *not* the host colour (an icon's glyph or label is drawn there). With no icons, or icons hidden (`!IsWindowVisible(ListView)`), print SKIP.
8. `hit-test`: from a 7×7 grid of points per monitor, pick the first one that is outside every icon rect, inside the work area, and where `GetAncestor(WindowFromPoint(p), GA_ROOT)` is `Progman` or a `WorkerW` (bare desktop, not covered by an app). PASS if `WindowFromPoint(p)` is `SysListView32` or `SHELLDLL_DefView`, and **not** our host. SKIP if no such point exists. Explorer must still receive the clicks.
9. `context-menu` (only with `--interact`, since it moves the owner's mouse; **advisory**: W0.1 found synthetic right-clicks over RDP sometimes land on the taskbar, even with no host, and the menu can take ~5 s after an Explorer restart; `menu` runs it alone as a control): save the cursor, `SendInput` a right click at the check-8 point, and wait 600 ms. PASS if a visible `#32768` window exists whose pid is Explorer's. Then send `Esc` and restore the cursor.

With `--after-quit`, run only: `no-hosts` (0 hosts) and `pixels-gone` (< 1% host-colour pixels on every monitor, using the colour from `--color RRGGBB`, default the raised magenta).

- [ ] **Step 1: Implement `Check.cs`** with exactly the checks above. Find the colour by parsing the host text `spike:<mode>:<RRGGBB>`.

- [ ] **Step 2: Run it with no spike running.** Run `make win-spike ARGS="check --tag none"`. Expected: `FAIL hosts 0 of 1`, then FAIL or SKIP for the host-dependent checks, and exit ≠ 0. This proves the check can fail.

- [ ] **Step 3: Run `check --after-quit`.** Run `make win-spike ARGS="check --after-quit --tag baseline"`. Expected: `PASS no-hosts`, and `PASS pixels-gone` (the owner's normal wallpaper has < 1% pure magenta; if it doesn't, choose another raised colour and say why). Look at `dist/win-spike/check-baseline.png`: it's the owner's desktop as captured over RDP.

- [ ] **Step 4: Commit:** `git commit -m "Windows W0.1: automated check (hosts, parent, z-order, bounds, pixels, icons in front, hit test)"`.

---

### Task 2: W0.1 attach, each candidate (`layer`)

**Files:**
- Create: `windows/spikes/Host.cs`, `Layer.cs`
- Modify: `Program.cs`, `Native.cs`

**Interfaces:**
- Consumes: `DesktopTree.EnsureLayer()`, `TreeSnapshot`.
- Produces: `layer --mode raised|workerw|defview [--layered on|off] [--seconds N=120]`. It runs a WinForms message loop until N seconds pass or `Local\WallpapersSpikeStop` is set, then cleans up (Task 3).
- Produces: `sealed class Host : NativeWindow` with `Host(Screen-like MonitorInfo m, string mode, Color c)`, `bool Attach(IntPtr parent, IntPtr insertAfter, bool layered)`, `void Reposition(IntPtr parent)`, `bool Alive => IsWindow(Handle)` and `void Destroy()`.
- Produces (for Task 4): `Layer.Hosts` (the live list) and `Layer.Winner` (the parent and z rule that passed), as code that `web` reuses.

Default `--layered` per mode: `raised` on, `defview` on, `workerw` off.

- [ ] **Step 1: Implement `Host`.** Register the class `WallpapersSpikeHost` once with `RegisterClassEx` (`DefWindowProc`, no background brush). `Host` creates its window with `CreateWindowEx` and subclasses it with `NativeWindow.AssignHandle`. *(Not `NativeWindow.CreateHandle`: it superclasses a custom class name into `WindowsForms10.<name>…`; found in W0.1.)* Use style `WS_CHILD | WS_VISIBLE | WS_CLIPCHILDREN | WS_CLIPSIBLINGS` and ex-style `WS_EX_NOACTIVATE` (+ `WS_EX_LAYERED` when layered). Pass the parent HWND to `CreateWindowEx`, with the position as the monitor rect mapped into the parent's client coordinates (`MapWindowPoints(IntPtr.Zero, parent, …)`; origins can be negative). If `CreateWindowEx` with the foreign parent returns 0, log `GetLastWin32Error`, create the window top-level (`WS_POPUP`), then `SetParent` it and switch the style to `WS_CHILD`, logging `via=setparent`. When layered, call `SetLayeredWindowAttributes(h, 0, 255, LWA_ALPHA)`. Finish with `SetWindowPos(h, insertAfter, …, SWP_NOMOVE|SWP_NOSIZE|SWP_NOACTIVATE)`. `WM_PAINT` (`BeginPaint`/`Graphics.FromHdc`) fills the colour and draws `W0.1 <mode>  HH:mm:ss` in white, 48 px, at the centre. A 1 s WinForms timer calls `InvalidateRect`. A frozen clock in a screenshot means a stale frame.

- [ ] **Step 2: Implement `Layer`.**
  1. `EnsureLayer()`, logging the layout, `sent` and `waited`.
  2. One `Host` per monitor. The parent and `insertAfter` depend on the mode: `raised` → (`Progman`, `DefView`); `workerw` → (`WallpaperWorkerW`, `HWND_TOP`); `defview` → (`DefView`, `HWND_BOTTOM`).
  3. Create a hidden top-level `WallpapersSpikeMsg` window (`WS_POPUP`, never shown, `WS_EX_TOOLWINDOW`). It is **not** `HWND_MESSAGE`, because message-only windows miss the `TaskbarCreated` broadcast. Register `RegisterWindowMessage("TaskbarCreated")`. The handler is in Task 3.
  4. A 5 s timer: for each host, if `!IsWindow(parent)`, log it and re-attach. If the z-order check from Task 1 check 3 is wrong, log `z repaired` and call `SetWindowPos` again.
  5. A 250 ms timer polls the stop event and the deadline.
  6. Log one line per host after attaching: `host=0x… parent=0x… mode=… layered=… rect=…`.

- [ ] **Step 3: Run candidate (a), raised.** In one terminal, run `make win-spike ARGS="layer --mode raised --seconds 300"`. In a second, run `make win-spike ARGS="check --tag raised"`. Expected for a pass: checks 1–8 PASS. Look at `dist/win-spike/check-raised.png`: magenta behind the icons, the clock ticking between two checks. Then run `check --interact --tag raised-menu` and expect `PASS context-menu`.

- [ ] **Step 4: Owner by eye (raised).** Ask the owner to, while it runs: drag an icon and drop it back, rubber-band select some icons, right-click the bare desktop then press Esc, double-click an icon (it opens), and press Win+D twice. Expected: all behave normally, with no lag; the magenta stays behind the icons and the clock keeps ticking. Record each yes/no.

- [ ] **Step 5: Run candidates (b) workerw and (c) defview the same way,** even if (a) passed, so the result names every option. For each, `layer --mode <m> --seconds 180` plus `check --tag <m>`. If `workerw` fails `pixels` unlayered, retry once with `--layered on`. Record PASS/FAIL per check per mode.

- [ ] **Step 6: Pick the winner.** It's the first mode with checks 1–9 PASS and every owner check yes, in the order raised > workerw > defview (§10.25.3 preference). If none passes, go straight to Task 6 and write the stop-up. W0.2 is not attempted.

---

### Task 3: W0.1 recovery: Explorer restart, quit, crash

**Files:**
- Create: `windows/spikes/Shell.cs`
- Modify: `Layer.cs`, `Host.cs`, `Program.cs`

**Interfaces:**
- Produces: `repaint`, which runs `Shell.Repaint()`: `SPI_GETDESKWALLPAPER` → if empty, log `repaint skipped: empty path` and return; else `SPI_SETDESKWALLPAPER` with the same path and flags `0`.
- Produces: `stop`, which sets `Local\WallpapersSpikeStop`.
- Produces: `restart-explorer`, which kills `explorer.exe` processes in the current session, waits up to 10 s for Winlogon's auto-restart (`AutoRestartShell`), and otherwise runs `explorer.exe`. It prints the elapsed time.
- Produces: `Layer.Cleanup()`, idempotent: destroy every host, then `Shell.Repaint()`. It's wired to the deadline, `stop`, `Console.CancelKeyPress`, `AppDomain.ProcessExit` and `AppDomain.UnhandledException`.

- [ ] **Step 1: Write the `TaskbarCreated` handler in `Layer`.** Log `taskbar-created`. For each host, log `alive=<IsWindow(host)>`. Then re-snapshot and run `EnsureLayer()`. Then: alive → `SetParent(host, newParent)` + `Reposition` + z, logging `reparented`; dead → create a new `Host`, logging `recreated`.

- [ ] **Step 2: Implement `Shell.cs` and `Cleanup`.** Run `make win-spike ARGS=repaint`. Expected: one log line, `repaint path=<set> ext=.jpg` (or `skipped: empty path`). Record the owner's wallpaper type (picture, solid, slideshow or Spotlight).

- [ ] **Step 3: Explorer restart (owner go-ahead first: it closes File Explorer windows briefly).** With `layer --mode <winner> --seconds 300` running, run `make win-spike ARGS=restart-explorer`, wait 5 s, then run `check --tag <winner>-restart`. Expected for a pass: the layer log shows `taskbar-created`, `alive=…`, and then `reparented` or `recreated`; the check passes. **Record `alive`.** It decides whether §10.25.5's "no reload" is possible with HWND hosting (it feeds W0.2's windowed vs visual choice).

- [ ] **Step 4: Clean quit.** Let the deadline pass (or run `ARGS=stop`), then run `check --after-quit --tag quit`. Expected: `PASS no-hosts`, `PASS pixels-gone`, and the screenshot shows the owner's own wallpaper.

- [ ] **Step 5: Ctrl+C.** Start `layer` and press Ctrl+C in that terminal after 10 s, then run `check --after-quit --tag ctrlc`. Record whether `CancelKeyPress` ran (the log line `cleanup reason=ctrl-c`). If it didn't, note that WSL interop doesn't forward the signal.

- [ ] **Step 6: Hard kill.** Start `layer`, then from WSL run `/mnt/c/Windows/System32/taskkill.exe /f /im Spike.exe`, then `check --after-quit --tag kill`. Record what's left on screen (a stale magenta frame, or Explorer's picture). If it's stale, run `ARGS=repaint` and check again: this tells W1 whether a watchdog or next-start repaint is needed.

---

### Task 4: W0.2 WebView2 in the host (`web`)

**Files:**
- Create: `windows/spikes/Web.cs`, `Dcomp.cs`
- Modify: `Spike.csproj` (`<PackageReference Include="Microsoft.Web.WebView2" Version="<latest stable, exact>" />`, recording the version), `run.sh` (copy `web/`), `Program.cs`

**Interfaces:**
- Consumes: `Layer` attach (the winner's parent and z rule), `Layer.Cleanup()`, the `TaskbarCreated` handler.
- Produces: `web --mode <winner|window> --hosting windowed|visual [--args "<browser args>"] [--minutes 10] [--url "index.html?w=aquarium&tier=high"]`. `--args` defaults to the two occlusion flags, and `--args none` passes none. `--mode window` is a normal, visible, top-level 1280×720 window: the *reference* rate for this session.
- Produces: log lines `fps t=<s> frames=<n> fps=<f> vis=<stage visibilityState>/<top visibilityState>` every 10 s, and `cpu t=<s> app=<%> webview=<%> procs=<n>` every 60 s. Percentages are of one core.

- [ ] **Step 1: Write the probes first.** The frame probe is `ExecuteScriptAsync` of `(() => { const f = [...document.querySelectorAll('iframe.stage')].pop(); const w = f && f.contentWindow; return JSON.stringify({ n: w?.WP?.host?.frames?.count ?? -1, vis: f?.contentDocument?.visibilityState ?? 'none', top: document.visibilityState }); })()`, every 10 s; fps = Δn/Δt. The CPU probe runs every 60 s over `env.GetProcessInfos()` pids plus our own: Δ`TotalProcessorTime` / Δwall × 100. At exit, print a summary: median, min and the first 10 s window under 50% of the median.

- [ ] **Step 2: Implement windowed hosting.** `CoreWebView2Environment.CreateAsync(null, <LOCALAPPDATA>\Wallpapers-spike\WebView2, new CoreWebView2EnvironmentOptions(args))`, then `env.CreateCoreWebView2ControllerAsync(host.Handle)`, with `Bounds` = the host's client rect, `DefaultBackgroundColor` black, `IsVisible true`. Call `SetVirtualHostNameToFolderMapping("wallpapers.example", <LOCALAPPDATA>\Wallpapers-spike\web, CoreWebView2HostResourceAccessKind.Deny)` and navigate to `https://wallpapers.example/` + url. Async code runs on the WinForms sync context (`Application.Run` + `async void` start).

- [ ] **Step 3: Get the reference rate.** Run `make win-spike ARGS="web --mode window --hosting windowed --minutes 2"`. Expected: the fps median is near the session's refresh (60 at the console; over RDP whatever it delivers), and `vis=visible/visible`. Record it as **R**.

- [ ] **Step 4: Run (a): windowed with the flags behind the icons, 10 minutes.** Run `make win-spike ARGS="web --mode <winner> --hosting windowed --minutes 10"`, with `check --tag web-a` at minute 1 (pixels will fail, since it's no longer magenta; look at the screenshot instead: fish behind the icons, and two checks a few seconds apart differ). **Pass:** median fps ≥ 0.9·R, no 10 s window < 0.5·R, `vis=visible` throughout. Also run once with `--args none` for 2 min, to learn whether the flags are what make it work. Record both.

- [ ] **Step 5: Implement visual hosting (`Dcomp.cs`).** It needs `DCompositionCreateDevice(IntPtr dxgiDevice = 0, ref Guid IID_IDCompositionDevice {C37EA93A-E7AA-450D-B16F-9746CB0407F3}, out object)` and `[ComImport]` interfaces declaring vtable slots in order, up to the last one used:
  - `IDCompositionDevice`: `Commit`, `WaitForCommitCompletion`, `GetFrameStatistics`, `CreateTargetForHwnd(IntPtr, bool topmost, out IDCompositionTarget)`, `CreateVisual(out IDCompositionVisual)`.
  - `IDCompositionTarget` {EACDD04C-117E-4E17-88F4-D1B12B0E3D89}: `SetRoot(IDCompositionVisual)`.
  - `IDCompositionVisual` {4D93059D-097B-4651-9A60-F0F25116E2F3}: no methods called.

  Then `env.CreateCoreWebView2CompositionControllerAsync(host.Handle)` → `RootVisualTarget = visual` → `Commit()`. Variant: the host created with `WS_EX_NOREDIRECTIONBITMAP` instead of `WS_EX_LAYERED` (`--layered off --noredir`), since layered redirection and DComp may not mix.

- [ ] **Step 6: Run (b): visual hosting behind the icons, 10 minutes,** even if (a) passed (it decides §10.25.8's input delivery). Use the same command with `--hosting visual`, the same pass rule, and also with `--args none` for 2 min. Record both.

- [ ] **Step 7: Explorer restart with a live page** (owner go-ahead). **W0.1 found the host HWND dies with Explorer**, so windowed hosting will lose its web view; this step measures whether visual hosting's `CoreWebView2CompositionController` can be re-pointed (`ParentWindow` to a new host + a new DComp target) without a reload. During a 5-minute run of the leading option, `restart-explorer`. Record whether the page kept its frame count (no reload: `frames` keeps rising from where it was) or restarted near 0, how long until frames resumed, and whether visual hosting could be re-targeted to a recreated host (`CompositionController` survives; new DComp target).

- [ ] **Step 8: Decide.** If both options pass, prefer visual hosting (trusted `SendMouseInput`, no child HWND to lose on Explorer restart), unless its CPU is clearly worse (> 1.25× windowed). If neither passes, go to Task 6 and write the stop-up.

---

### Task 5: W0.3 two processes on one user data folder (`share`)

**Files:**
- Create: `windows/spikes/Share.cs`
- Modify: `Program.cs`

**Interfaces:**
- Consumes: the `Web.cs` environment and host setup (a normal visible window is fine; this is about storage, not the desktop).
- Produces: `share --role writer|reader [--seconds 60] [--args "<browser args>"]`. Both open `https://wallpapers.example/index.html?w=blank` on the same user data folder. The writer runs `localStorage.setItem('wp:spike-share', String(Date.now()))` every 2 s. The reader registers `addEventListener('storage', e => (window.__ev ||= []).push([e.key, e.newValue, Date.now()]))`, drains `__ev` every 2 s and logs `got key latency=<ms>`. Both log `browserPid=<CoreWebView2.BrowserProcessId>`.

- [ ] **Step 1: Implement `share`.**
- [ ] **Step 2: Run concurrently.** Run `make win-spike ARGS="share --role writer --seconds 70"` and, 5 s later in a second terminal, `ARGS="share --role reader --seconds 60"`. **Pass:** the reader logs ≥ 25 of the ~30 writes, median latency < 500 ms, and both show the same `browserPid`.
- [ ] **Step 3: Reverse the start order** (the reader first, then the writer), and record the same numbers.
- [ ] **Step 4: Persistence.** After both exit, run the reader alone for 10 s with a one-shot read of `localStorage.getItem('wp:spike-share')`. Expected: the last writer value.
- [ ] **Step 5: Mismatched options.** Run the writer with the default args and the reader with `--args none`. Record the error (`CreateAsync` failing with a message). This tells W5 that the saver must pass identical environment options.
- [ ] **Step 6: Decide.** If all pass, the saver shares the folder; if anything is flaky, use the `saver.json` mirror (§10.25.12).

---

### Task 6 (written after W0.1, then after each spike): results into SPEC and the gate

**Files:**
- Modify: `SPEC.md` §10.25.21 (replace "None yet."), and the §10.25 status line at the gate; `docs/superpowers/handoffs/2026-11-02-windows-handoff.md` §1 table / §5

- [ ] **Step 1: Write one block per spike** in the Mac's style (§10.21 "Spike results"). Header: `**W0.1 behind the icons: passes|fails.** (Windows 11 25H2 build 26200, RDP|console, N monitor(s) <w>×<h> @<scale>%, 2026-11-03)`. Bullets: the layout found and the tree before and after `0x052C` (classes, parents, z order; no hwnd values), whether the message was needed and the wait, each mode's check results, the owner's by-eye checks, the restart result **with `alive`**, the quit, Ctrl+C and kill results, the wallpaper type, and gotchas found. W0.2 adds R, the fps median and min, CPU per option, flags versus none, the restart result, the decision, and the WebView2 SDK and runtime versions.
- [ ] **Step 2: Feed decisions back into the design** where a spike settled one, with a one-line pointer to §10.25.21: §10.25.3/§10.25.5 (exact parent and z rule; whether hosts survive an Explorer restart), §10.25.14/§10.25.18 (browser args, hosting), §10.25.8 (delivery), §10.25.12 (share vs mirror). Fix any design statement a spike disproved.
- [ ] **Step 3: Gate.** If W0.1 and W0.2 pass: §10.25 status becomes "W0 gate passed (date); W1 next". If either fails: "stopped at W0 (date): <one line>", the handoff says so, and nothing more is built.
- [ ] **Step 4: Run `make lint audit test`.** Expected: green. The audit catches leaked paths or the user name in pasted logs.
- [ ] **Step 5: Commit** (owner OK): `git commit -m "SPEC: Windows spike W0.x results"`.

---

### Task 7: W0.4 Raw Input and the bare-desktop hit test (`input`)

**Files:**
- Create: `windows/spikes/Input.cs`
- Modify: `Program.cs`

**Interfaces:**
- Consumes: optionally a running `layer` (to prove our host counts as desktop).
- Produces: `input [--seconds 90]`. A hidden top-level window registers Raw Input (usage page 1, usage 2, `RIDEV_INPUTSINK`). It logs `moves/s=<n> pos=x,y` once a second (physical px via `GetCursorPos`), and for each left down/up: `click down|up pos=x,y wfp=<class> root=<root class> uia=<ControlType.ProgrammaticName> "<name, truncated 20>" -> bare|icon|other uiaMs=<ms>`.
- Classification (as §10.25.8): `bare` when `WindowFromPoint` is `SysListView32`, `SHELLDLL_DefView`, `Progman`, `WorkerW` or `WallpapersSpikeHost` **and** UIA's element isn't a `ListItem`; `icon` when it's those **and** a `ListItem`; otherwise `other`.

- [ ] **Step 1: Implement `input`.** UIA `AutomationElement.FromPoint` runs on a dedicated MTA worker thread fed by a queue, never on the message thread (UIA clients on a UI thread can deadlock). Each click gets a sequence number so the log lines pair up.
- [ ] **Step 2: Scripted owner run, with `layer --mode <winner>` also running.** Run `make win-spike ARGS="input --seconds 90"`. The owner, in order: moves the mouse over the desktop, then over an app window; clicks 3 different icons; clicks 3 bare spots; clicks inside 2 app windows; clicks the taskbar; makes one rubber-band drag on bare desktop. **Pass:** moves are logged throughout (including over the app, i.e. INPUTSINK works unfocused), every click is classified correctly (3 icon, 3 bare, the rest other), and UIA p95 < 50 ms.
- [ ] **Step 3: Elevated focus.** Open Task Manager (elevated) focused, move the mouse, and record whether raw input still arrives (UIPI; §10.25.8 accepts either).
- [ ] **Step 4: Record in §10.25.21 (Task 6 steps 1, 4 and 5).**

---

## Progress

- **2026-11-03: W0.1 passed** (Tasks 0–3 and Task 6 for W0.1 done; results in SPEC §10.25.21). Winner: raised, a layered child of `Progman` directly below `SHELLDLL_DefView`. Helpers added along the way: `show-desktop` (Win+D, so the checks can see the desktop past maximized windows) and `menu` (the right-click control). Next: Task 4 (W0.2).
- Gotcha for anyone driving it from WSL: `pkill -f` with the exe's name also matches the shell running the command; signal a pid instead.

## Order and stopping points

Task 0 → 1 → 2 → 3 → **Task 6 for W0.1** (if it fails, stop the project here) → 4 → **Task 6 for W0.2 + gate** → 5 → 7 → Task 6 for W0.3/W0.4. W0.3 and W0.4 don't affect the gate, but their answers are needed before W5 and W3.
