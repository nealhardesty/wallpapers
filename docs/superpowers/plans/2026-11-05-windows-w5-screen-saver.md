# Windows W5: the screen saver — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `Wallpapers.scr` — the same exe, installed a second time — runs the web wallpapers as the Windows
screen saver (`/s` on every monitor, `/p` in Windows' little preview monitor, `/c` opening our options), with
selection and timeout from the tray, Same / Different / One wallpaper, a clock, a watchdog, and the desktop
pausing while it runs; uninstall puts the person's old saver back.

**Architecture:** `Program` dispatches saver arguments before the self-test, install offer and mutex. The
saver reuses `Surface` (a WebView2 composition controller drawn into a window of ours by DirectComposition),
so a saver window is an ordinary borderless form that gets every key and mouse message itself; the page
never sees input. The saver opens the app's own WebView2 user data folder (W0.3: same options, shared
`localStorage`, no mirror) and reads `settings.json` for its choices. Pure decisions (argument forms, picks,
the watchdog's steps, the move threshold, registry values and restore) live in `Wallpapers.Core` with Linux
unit tests; the Windows side executes them. Selection writes `HKCU\Control Panel\Desktop` only in the `run`
flavour; the `test` flavour has its own scratch key, so the self-test can never change the real saver.

**Tech Stack:** .NET 10 WinForms + WebView2 (existing), xUnit v3 (existing), Win32 P/Invoke in `Native.cs`.

**Spec:** `SPEC.md` §10.25.12 (the saver), §10.25.13 (install/uninstall), §10.25.10 (the tray),
§10.25.15 (build/test), §10.25.16 (roadmap: W5), §10.25.20. Original design:
`docs/superpowers/specs/2026-11-02-windows-design.md` §12 (self-test item 9).

## Global Constraints

- Owner rules (memory, standing): **never synthesize global input** (no `SendInput`, `keybd_event`,
  `mouse_event`, `SetCursorPos`). The self-test may only `PostMessage` to windows it has confirmed belong to
  the saver child process it started (`N.PidOf(h) == child.Id`).
- **Never touch the real `HKCU\Control Panel\Desktop` outside the `run` flavour**, and never call
  `SystemParametersInfo(SPI_SET…)` outside it. Implementers never run the `run` flavour's selection either
  (that is the owner's by-hand checklist).
- **The self-test never shows a full-screen saver.** It runs the saver in harness windows
  (`--saver-window`) only.
- Before `make win-test`: quit the owner's normal app (`windows/run.sh` normal flavour:
  `"%LOCALAPPDATA%\Programs\Wallpapers\Wallpapers.exe" --quit`, or `Wallpapers-build\run\Wallpapers.exe --quit`),
  and start it again afterwards (`make win-run`, or the installed exe) if it was running.
- `make ci` needs `CHROME_PATH=~/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`.
- Smart App Control is on: a refused build shows as `Invalid argument`; `run.sh` rebuilds (BUILD=1).
- No API keys or secrets; no home paths, user names, emails or runs of 32+ hex characters in committed files.
- Never `DELETE_SETTINGS=1` on the owner's real settings. Never restart Explorer.
- Commit trailer: `Co-Authored-By: <the committing model> <noreply@anthropic.com>`.
- Style: match the existing files (XML-doc `///` one-liners saying *why*, records in Core, `N.` for
  P/Invoke, `Log.Info/Warn/Error`, every caught exception filtered by type). No new NuGet packages.
- Exact values (from the spec): exit on a key, a click, or the mouse more than **8 px** from where it
  started; watchdog every **4 s**, **two** stalls per step, steps **reload → recreate → clock on black**,
  retry every **60 s**; Start After **1 · 3 · 5 · 10 · 15 · 30** min; Change Every **1 · 5 · 15 · 30** min
  (default **5**); Different skips **blank, jellyfin, bing** (and pseudo entries: seasonal); the clock is
  `?clock=drift`; page host `?host=windows-saver`; the saver is `Wallpapers.scr` beside `Wallpapers.exe`.

## Review Focus

1. **A saver that won't go away.** Any input path that doesn't end it (a key while a WebView2 has focus, a
   wheel, a second monitor's window), or a crash that leaves a topmost black window → every input message
   ends the process, and an unhandled exception exits the process (Task 3 tests key, click, move).
2. **The desktop stuck hidden after the saver.** A saver that crashes without saying `saver-off` → the
   app's saver flag is a lease that lapses 10 s after the last ping (Task 2 `SaverLeaseTests`).
3. **The owner's real screen saver changed by a test or by a non-`run` flavour** → `SaverRegistry.KeyFor`
   pins `run` alone to `Control Panel\Desktop` (Task 2 test), and the selection executor refuses SPI calls
   outside `run` (Task 4).
4. **Uninstall leaving `SCRNSAVE.EXE` pointing at a deleted `.scr`** (Windows then shows nothing, or a
   blank "(None)") → `RestoreSaver` runs before files go, restores the saved previous saver or clears ours
   (Task 4 self-test "uninstall restores the saver").
5. **An update or install that leaves `.scr` stale or missing** (an older `.scr` runs the old saver; the
   W4→W5 in-place `--install` skips the copy) → `.scr` is staged and swapped with the exe and rolled back
   with it, and re-made when the copy is skipped (Task 4 self-test "install"/"update" check `.scr`).

---

## File Structure

Core (`windows/Wallpapers.Core/`, tested on Linux):
- `SaverArgs.cs` — `/s /p /c` forms → `SaverArgs`.
- `SaverSettings.cs` — `SaverShow`, `PreviousSaver`, `SaverSettings` (in `AppSettings.Saver`), `SaverChoices` (the menu values).
- `SaverPicker.cs` — the Different pool and the pick that avoids the other monitors.
- `SaverWatchdog.cs` — the recovery state machine.
- `SaverInput.cs` — the 8 px rule.
- `SaverRegistry.cs` — keys per flavour, value names, `IsOurs`, `SaverRestore.For`.
- `SaverLease.cs` — the app's "a saver of ours is running" lease.
- `PageUrl.cs` (modify) — `PageUrl.Saver(...)`.
- `AppSettings.cs` (modify) — `Saver` property.

App (`windows/Wallpapers/`):
- `Saver/SaverSession.cs` — `/s`: one `SaverWindow` per monitor (or harness rect), power, pings, state file, exit.
- `Saver/SaverWindow.cs` — one monitor: a borderless form, a `Surface` in it, input → exit, watchdog, fallback clock.
- `Saver/SaverPreview.cs` — `/p`: a child control in Windows' preview, exits with its parent.
- `Saver/SaverMain.cs` — the dispatch (`Run(paths, args, rawArgs)`), `/c` hand-over, the state file writer.
- `SaverSelection.cs` — the registry and SPI executor for one flavour.
- `SaverControl.cs` — what the tray and the options window call (select, timeout, show, clock, preview, Windows' dialog).
- `SaverOptionsWindow.cs` — the `/c` dialog.
- `Program.cs`, `App.cs`, `AppPaths.cs`, `Log.cs`, `Power.cs`, `Native.cs`, `Install.cs`, `Tray.cs`, `SelfTest.cs` (modify).
- `windows/run.sh`, `Makefile`, `README.md`, `SPEC.md` (modify).

---

### Task 1: Core — arguments, settings, page URL, picks, input

**Files:**
- Create: `windows/Wallpapers.Core/SaverArgs.cs`, `SaverSettings.cs`, `SaverPicker.cs`, `SaverInput.cs`
- Modify: `windows/Wallpapers.Core/AppSettings.cs`, `windows/Wallpapers.Core/PageUrl.cs`
- Test: `windows/Wallpapers.Tests/SaverArgsTests.cs`, `SaverSettingsTests.cs`, `SaverPickerTests.cs`, `SaverInputTests.cs`, `PageUrlTests.cs` (add), `AppSettingsTests.cs` (add)

**Interfaces:**
- Produces:
  - `public enum SaverMode { None, Run, Preview, Configure }`
  - `public sealed record SaverArgs(SaverMode Mode, long Window)` with `public static SaverArgs Parse(IReadOnlyList<string> args, bool isScr)` (`Window` 0 when none).
  - `public enum SaverShow { Same, Different, One }`
  - `public sealed record PreviousSaver(string? Exe, string? Active)`
  - `public sealed record SaverSettings(SaverShow Show = SaverShow.Same, string? Wallpaper = null, int ChangeMinutes = 5, bool Clock = false, PreviousSaver? Before = null)` with `public SaverSettings Normalized()`.
  - `public static class SaverChoices { public static readonly IReadOnlyList<int> StartAfterMinutes = [1, 3, 5, 10, 15, 30]; public static readonly IReadOnlyList<int> ChangeMinutes = [1, 5, 15, 30]; }`
  - `AppSettings`: `public SaverSettings Saver { get; init; } = new();` (an init property after the positional list, serialized as `"saver"`).
  - `PageUrl.Saver(string? wallpaper, string? display, bool clock)` → `https://wallpapers.example/index.html?host=windows-saver[&w=<id>][&display=<key>][&clock=drift]`.
  - `public static class SaverPicker { public static readonly IReadOnlySet<string> Never; public static IReadOnlyList<string> Pool(CatalogInfo c); public static string? Pick(IReadOnlyList<string> pool, IReadOnlyCollection<string> taken, Random rng); }`
  - `public static class SaverInput { public const int MoveThreshold = 8; public static bool Moved(int startX, int startY, int x, int y); }`

- [ ] **Step 1: Write the failing tests**

`SaverArgsTests` (a `[Theory]` per row, `isScr` as given):

| args | isScr | Mode | Window |
|---|---|---|---|
| `["/s"]` | false | Run | 0 |
| `["/S"]`, `["-s"]`, `["/s", "--selftest"]` | true | Run | 0 |
| `["/p", "1234"]`, `["/P:1234"]`, `["/p1234"]` | true | Preview | 1234 |
| `["/c"]` | true | Configure | 0 |
| `["/c:4567"]`, `["/C", "4567"]` | true | Configure | 4567 |
| `[]` | true | Configure | 0 |
| `[]` | false | None | 0 |
| `["--settings"]` | false | None | 0 |
| `["/p"]`, `["/p:abc"]` | true | Configure | 0 |
| `["/p"]` | false | None | 0 |
| `["--selftest", "/s"]` | false | None | 0 |

(Only the first argument decides; Windows always puts the switch first. A bad `/p` from an `.scr` opens the options rather than starting the whole app.)

`SaverSettingsTests`:
- `Normalized_KeepsAKnownChangeInterval` — `new SaverSettings(ChangeMinutes: 15).Normalized().ChangeMinutes == 15`.
- `Normalized_ReplacesAnUnknownInterval` — `ChangeMinutes: 7` and `0` and `-1` → `5`.
- `Normalized_OneWithoutAWallpaperIsSame` — `new SaverSettings(SaverShow.One, null).Normalized().Show == SaverShow.Same`; with `"snow"` stays `One`.
- `Choices_AreTheSpecsValues` — `SaverChoices.StartAfterMinutes` equals `[1,3,5,10,15,30]`, `ChangeMinutes` equals `[1,5,15,30]`.

`AppSettingsTests` (add):
- `Saver_DefaultsWhenMissing` — loading `{"monitors":"different"}` gives `Saver == new SaverSettings()`.
- `Saver_RoundTrips` — save `new AppSettings() with { Saver = new(SaverShow.Different, null, 15, true, new PreviousSaver(@"C:\Windows\System32\Ribbons.scr", "1")) }`, load, equal (records compare by value; `Before` too); the file contains `"saver"`, `"show": "different"`, `"changeMinutes": 15`.

`PageUrlTests` (add):
- `Saver_Plain` → `PageUrl.Saver(null, null, false) == "https://wallpapers.example/index.html?host=windows-saver"`.
- `Saver_All` → `PageUrl.Saver("koi-pond", "dell-u2720q-1", true) == "https://wallpapers.example/index.html?host=windows-saver&w=koi-pond&display=dell-u2720q-1&clock=drift"`.
- `Saver_Escapes` → `PageUrl.Saver("a b", null, false)` ends with `&w=a%20b`.

`SaverPickerTests` (build a `CatalogInfo` with entries seasonal (pseudo), blank, snow, rain, jellyfin, bing, koi-pond):
- `Pool_SkipsPseudoBlankJellyfinAndBing` → `["snow", "rain", "koi-pond"]` in catalog order.
- `Pick_AvoidsTaken` — pool `[snow, rain]`, taken `[snow]` → `"rain"` for any seed (loop seeds 0..20).
- `Pick_FallsBackToAnyWhenAllTaken` — pool `[snow]`, taken `[snow]` → `"snow"`.
- `Pick_EmptyPoolIsNull` → `null`.

`SaverInputTests`:
- `Moved_FalseWithinEightPixels` — `(100,100)→(108,100)`, `(100,100)→(105,106)` (√61 < 8) → false.
- `Moved_TrueBeyondEight` — `(100,100)→(109,100)`, `(100,100)→(106,106)` (√72 > 8), `(100,100)→(-5000,100)` → true.

- [ ] **Step 2: Run them to verify they fail**

Run: `make win-unit`
Expected: build errors (types not defined).

- [ ] **Step 3: Implement**

- `SaverArgs.Parse`: look only at `args[0]`; strip a leading `/` or `-`; the letter (case-insensitive) picks the mode; the handle is what follows the letter after an optional `:`, or else `args[1]`; parse with `long.TryParse` (invariant). An `.scr` with no args, an unknown first switch, or a `/p` with no valid handle is `Configure`; an exe in those cases is `None`. An exe with `/c` is `Configure`, `/s` is `Run`, a valid `/p` is `Preview`.
- `AppSettings`: add `public SaverSettings Saver { get; init; } = new();` below the positional record; JSON stays camelCase with string enums (existing options).
- `PageUrl.Saver`: same `Uri.EscapeDataString` as `Play`.
- `SaverPicker.Never = { "blank", "jellyfin", "bing" }`; `Pool` keeps catalog order, drops `Pseudo` and `Never`.
- `SaverInput.Moved`: `dx*dx + dy*dy > MoveThreshold*MoveThreshold` (use `long`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `make win-unit`
Expected: all pass (193 before + the new ones).

- [ ] **Step 5: Commit**

```bash
git add windows/Wallpapers.Core windows/Wallpapers.Tests
git commit -m "Windows W5: Core saver arguments, settings, picks, page URL and the 8 px rule"
```

---

### Task 2: Core — watchdog, registry, restore, lease

**Files:**
- Create: `windows/Wallpapers.Core/SaverWatchdog.cs`, `SaverRegistry.cs`, `SaverLease.cs`
- Test: `windows/Wallpapers.Tests/SaverWatchdogTests.cs`, `SaverRegistryTests.cs`, `SaverLeaseTests.cs`

**Interfaces:**
- Consumes: `PreviousSaver` (Task 1).
- Produces:
  - `public enum WatchdogStep { None, Reload, Recreate, Fallback, Retry, Recovered }`
  - `public sealed class SaverWatchdog(int retryTicks)` with `WatchdogStep Tick(int frames)` (frames = the page's counter, `-1` = no answer), `WatchdogStep Crashed()`, `bool InFallback { get; }`, `int Recoveries { get; }`. Constants: `public const int StallsPerStep = 2;`, `public static readonly TimeSpan Every = TimeSpan.FromSeconds(4), RetryAfter = TimeSpan.FromSeconds(60);`.
  - `public static class SaverRegistry` with `const string DesktopKey = @"Control Panel\Desktop"`, `PolicyKey = @"Software\Policies\Microsoft\Windows\Control Panel\Desktop"`, `ExeValue = "SCRNSAVE.EXE"`, `ActiveValue = "ScreenSaveActive"`, `TimeoutValue = "ScreenSaveTimeOut"`; `string KeyFor(string flavor)`; `string PolicyKeyFor(string flavor)`; `bool IsOurs(string? current, string saverPath, Func<string, string> longPath)`.
  - `public sealed record SaverRestore(string? Exe, string Active)` with `public static SaverRestore For(PreviousSaver? before, string saverPath, Func<string, string> longPath)` (`Exe` null = delete the value).
  - `public sealed class SaverLease` with `public static readonly TimeSpan Length = TimeSpan.FromSeconds(10)`, `void Ping(DateTime now)`, `void End()`, `bool Active(DateTime now)`.

- [ ] **Step 1: Write the failing tests**

`SaverWatchdogTests` (`var w = new SaverWatchdog(retryTicks: 3);`):
- `AdvancingFramesDoNothing` — ticks 1, 5, 9 → all `None`; `Recoveries == 0`.
- `TwoStallsReload` — ticks 10, 10 → `None` then… precisely: `Tick(10)` None (first reading), `Tick(10)` None (stall 1), `Tick(10)` → `Reload` (stall 2); `Recoveries == 1`.
- `NoAnswerIsAStall` — `Tick(5)`, `Tick(-1)`, `Tick(-1)` → `Reload`.
- `AfterAReloadTheCounterStartsAgain` — after `Reload`, `Tick(0)` → `None` (0 > the reset −1: a first reading, not yet an advance), `Tick(3)` → `None` (one advance), `Recoveries` still 1.
- `StepsGoReloadRecreateFallback` — keep ticking `-1`: the 2nd stall → `Reload`, the 4th → `Recreate`, the 6th → `Fallback`; `InFallback` true.
- `FallbackRetriesAfterRetryTicks` — after `Fallback`, `Tick(-1)` ×2 → `None`, the 3rd → `Retry`; `InFallback` still true.
- `RetryThatWorksRecovers` — after `Retry`, `Tick(0)` → `None`, `Tick(4)` → `Recovered`; `InFallback` false, `Recoveries == 0`.
- `RetryThatStallsFallsBackAgain` — after `Retry`, two stalls → `Fallback` (not Reload), then 3 more ticks → `Retry` again.
- `RecoveredLiveResetsRecoveries` — `Tick(1)`, stall ×2 → `Reload`; `Tick(0)`, `Tick(5)`, `Tick(9)` → `Recoveries == 0` (frames advancing twice in a row after a recovery step clears it), and a later double stall gives `Reload` again, not `Recreate`.
- `CrashedCountsAsTheSecondStall` — `Tick(1)`, `Crashed()` → `Reload`.

Semantics to implement (the tests above are the contract): keep `last` (starts −1) and `stalls`. A reading `> last` is progress: `last = frames`, `stalls = 0`; while `InFallback` after a `Retry`, the first progress that is `> 0` returns `Recovered`; in live mode, two consecutive *advances* (readings greater than an earlier real reading; the first reading after a reset, from −1, doesn't count) reset `Recoveries` to 0. A reading `<= last` (or −1) is a stall; at `StallsPerStep` stalls: `stalls = 0`, `last = -1`, and `Recoveries++` → 1 `Reload`, 2 `Recreate`, ≥3 `Fallback` (sets `InFallback`, starts the countdown). While in fallback with no retry pending, each tick counts down; at 0 → `Retry` (sets `Recoveries = 2`, `last = -1`, `stalls = 0`), so a failed retry returns `Fallback` at once. `Crashed()` = a stall that completes the step immediately (`stalls = StallsPerStep - 1` then a stall).

`SaverRegistryTests`:
- `RunUsesTheRealKey` — `KeyFor("run") == @"Control Panel\Desktop"`, `PolicyKeyFor("run") == @"Software\Policies\Microsoft\Windows\Control Panel\Desktop"`.
- `OtherFlavorsNeverTouchTheRealKey` — for `"test"`, `"dev"`: `KeyFor` is `@"Software\Wallpapers-test\Control Panel\Desktop"` (resp. `-dev`), never equal (ignoring case) to `DesktopKey`, and `PolicyKeyFor("test") == @"Software\Wallpapers-test\Policies\Control Panel\Desktop"`.
- `IsOurs_ComparesLongPathsIgnoringCase` — `longPath` maps `C:\Data\ABCDEF~1\Local\Programs\Wallpapers\WALLPA~1.SCR` → `C:\Data\abc def\Local\Programs\Wallpapers\Wallpapers.scr` (identity otherwise): true for that short path, for the long path in upper case, false for `C:\Windows\System32\Ribbons.scr`, false for `null` and `""`.
- `Restore_PutsBackTheOldSaver` — `For(new(@"C:\Windows\System32\Ribbons.scr", "1"), ours, id)` → `(Ribbons, "1")`.
- `Restore_NoOldSaverClearsOurs` — `For(null, ours, id)` → `(null, "0")`; `For(new(null, "1"), …)` → `(null, "1")`; `For(new("", null), …)` → `(null, "0")`.
- `Restore_OldValueThatWasOursClears` — before.Exe is our own path (selected twice) → `(null, "0")`.

`SaverLeaseTests`: `t0 = 2026-11-05 12:00:00Z`.
- `NotActiveUntilPinged`; `ActiveWithinTenSeconds` — `Ping(t0)`, `Active(t0 + 9.9 s)` true; `LapsesAfterTen` — `Active(t0 + 10.1 s)` false; `EndStopsIt` — `Ping(t0)`, `End()`, `Active(t0 + 1 s)` false; `APingAfterEndStartsAgain`.

- [ ] **Step 2: Run to verify they fail** — `make win-unit`; expected: build errors.

- [ ] **Step 3: Implement** the three files to the semantics above. `KeyFor(flavor)`: `"run"` → `DesktopKey`, else `$@"Software\Wallpapers-{flavor}\Control Panel\Desktop"`; `PolicyKeyFor`: `"run"` → `PolicyKey`, else `$@"Software\Wallpapers-{flavor}\Policies\Control Panel\Desktop"`. `IsOurs`: both through `longPath`, then `Path.GetFullPath`-free comparison (Core runs on Linux: compare the strings with `TrimEnd('\\')`, `OrdinalIgnoreCase`). `SaverRestore.For`: an old `Exe` that is non-empty and not ours → `(Exe, Active ?? "1")`; otherwise `(null, before?.Active is { Length: > 0 } a ? a : "0")` — except when the old exe was ours, `(null, "0")`.

- [ ] **Step 4: Verify** — `make win-unit`: all pass.

- [ ] **Step 5: Commit** — `git commit -m "Windows W5: Core watchdog, saver registry and restore, the saver lease"`

---

### Task 3: The saver runs (`/s`), the desktop pauses for it, self-test 9a

**Files:**
- Create: `windows/Wallpapers/Saver/SaverMain.cs`, `Saver/SaverSession.cs`, `Saver/SaverWindow.cs`
- Modify: `windows/Wallpapers/Program.cs`, `AppPaths.cs`, `Log.cs`, `Power.cs`, `App.cs`, `Native.cs`, `SelfTest.cs`

**Interfaces:**
- Consumes: Task 1 and 2 types; `Surface` (`StartAsync(env, paths, bing, url)`, `EvalAsync`, `ApplyPowerAsync(visible, json)`, `Navigate`, `Reload`, `Dispose`, `Lost`, `Loaded`); `WebFactory.CreateAsync(paths)`; `Layout.Plan(N.Monitors())` (`SurfacePlan.Key/Bounds/Scale`); `CatalogInfo.Script/Parse`; `PowerJson.For`; `SingleInstance.Send(flavor, command)`.
- Produces:
  - `static class SaverMain { public static int Run(AppPaths paths, SaverArgs saver, string[] args); }` — the one entry Program calls for every saver mode (`Preview` and `Configure` return 0 with a log line until Task 5).
  - `AppPaths.SaverLogFile` (`saver-log.txt` in `Root`), `AppPaths.SaverStateFile` (`saver-state.json` in `Root`); `Log.Init(AppPaths paths, bool saver = false)`.
  - Pipe commands the app understands: `saver-on`, `saver-off` (and Task 5's `saver-options`).
  - `Power.SaverPing()`, `Power.SaverEnded()`.
  - Saver window class/caption: each saver form's `Text` is `"WallpapersSaver"` (the self-test finds them by pid + caption).
  - Test-only arguments, honoured only when `paths.Flavor == "test"`: `--saver-window L,T,W,H[;L,T,W,H…]` (harness windows instead of monitors), `--saver-stall` (the watchdog reads −1 always), `--saver-change-ms <n>` (rotation interval). In the test flavour the watchdog ticks every **1000 ms** and the retry is **3** ticks.
  - The state file (written in the test flavour or with `WP_DEBUG=1`, after every watchdog tick, on every step and at exit), JSON camelCase:
    `{ "pid": 123, "mode": "run", "ended": null|"key"|"click"|"move"|"deactivate"|"close"|"error", "windows": [ { "key": "harness-1", "url": "...", "wallpaper": "snow"|null, "frames": 240, "recoveries": 0, "fallback": false, "steps": ["reload","recreate","fallback","retry","recovered"], "rotations": 0 } ] }`

- [ ] **Step 1: Dispatch in `Program.Main`**

Right after the `UninstallStage2` line and **before** `AppPaths.Resolve`'s self-test block:
```csharp
var saver = SaverArgs.Parse(args, Path.GetExtension(Environment.ProcessPath ?? "").Equals(".scr", StringComparison.OrdinalIgnoreCase));
if (saver.Mode != SaverMode.None) return SaverMain.Run(AppPaths.Resolve(args), saver, args);
```
(`--selftest` among the args makes it the test flavour without the self-test's mutex or wipe.) Update the modes comment at the top of `Program`.

- [ ] **Step 2: `SaverMain.Run` for `Run`**

`Log.Init(paths, saver: true)` (writes `saver-log.txt`; the app keeps `log.txt`: two processes never roll one file). A named mutex `Local\Wallpapers-{flavor}-saver`: a second `/s` exits 0 at once. `ApplicationConfiguration.Initialize()`, a `WindowsFormsSynchronizationContext`, `Application.ThreadException` and `AppDomain.UnhandledException` → log, mark `ended = "error"`, exit the process with code 1 (a saver must never linger). `Application.Run(new SaverSession(...))`. Returns 0.

- [ ] **Step 3: `SaverSession` (an `ApplicationContext`)**

- Monitors: `Layout.Plan(N.Monitors())` → one `SaverWindow` per plan at `plan.Bounds`, scale `plan.Scale`, key `plan.Key`, topmost. Harness (`--saver-window`, test flavour): one window per rect, key `harness-<n>`, scale 1.0, **not** topmost, no cursor hiding, deactivation ignored.
- Settings: `AppSettings.Load(paths.SettingsFile)`; `Saver.Normalized()`.
- What each window loads (`PageUrl.Saver`): `Same` → no `w`, `display = plan.Key` when `settings.Monitors == Different` (harness: never); `One` → `w = Wallpaper`; `Different` → `w = "blank"` first, then once the page answers `CatalogInfo.Script` (poll every 500 ms, up to 15 s) `WP.player.show(<id>)` with `SaverPicker.Pick(Pool(catalog), <ids the other windows show>, Random.Shared)`, and every `ChangeMinutes` (test: `--saver-change-ms`) a new pick the same way (`rotations++`). `clock` = `Saver.Clock`. (The page crossfades from black; `show` without `persist` never saves, so the desktop's choice is untouched.)
- One `WebFactory.CreateAsync(paths)` environment for all windows; a `BingJson` as `Desktop` has. No environment (no runtime) or `paths.CheckWebRoot() != null` → every window goes straight to the fallback clock and logs why.
- Cursor: `Cursor.Hide()` once the first window shows (real run only); the first window is `Activate()`d.
- Power: a `Power` instance (`Start()`); on `Changed` and once at start each window gets `ApplyPowerAsync(visible: !hidden, PowerJson.For(state, hidden))` with `hidden = Locked || (DisplayOff && !Remote) || Asleep || Disconnected` (not `HiddenEverywhere`: our own saver sets `SaverRunning`). While hidden the watchdog doesn't tick.
- Pings: every 4 s (and at once at start) `Task.Run(() => SingleInstance.Send(paths.Flavor, "saver-on"))`; at exit `saver-off`, waited at most 1.5 s.
- Exit (`End(string why)`, idempotent): write the state file with `ended = why`, send `saver-off`, dispose windows (their `Surface`s), `Power.Dispose()`, `Cursor.Show()`, `ExitThread()`.

- [ ] **Step 4: `SaverWindow` (a `Form`)**

Borderless, `ShowInTaskbar = false`, `StartPosition = Manual`, `Bounds` = the rect (physical px), `BackColor = Black`, `DoubleBuffered`, `TopMost` per Step 3, `Text = "WallpapersSaver"`. After `Show()` (handle exists): `new Surface(plan, new HostPlacement(rect, scale), Handle)` and `StartAsync(env, paths, bing, url)`.
- Input → `session.End(...)`, in `WndProc`: `WM_KEYDOWN`/`WM_SYSKEYDOWN` → `"key"`; `WM_LBUTTONDOWN`, `WM_RBUTTONDOWN`, `WM_MBUTTONDOWN`, `WM_XBUTTONDOWN`, `WM_MOUSEWHEEL`, `WM_MOUSEHWHEEL` → `"click"`; `WM_MOUSEMOVE` → client point (signed `GET_X/Y_LPARAM`) + the window's screen origin, `"move"` when `SaverInput.Moved(start, that)` where `start` is `GetCursorPos` taken once when the session starts; `WM_ACTIVATEAPP` with `wParam == 0` → `"deactivate"` (real run only); `WM_CLOSE` → `"close"`; `WM_SYSCOMMAND` with `SC_SCREENSAVE` (0xF140) is swallowed (return 0), so Windows can't start a second saver over us.
- Watchdog: a `System.Windows.Forms.Timer` at `SaverWatchdog.Every` (test: 1000 ms), retry ticks `RetryAfter / Every` (= 15; test 3). Each tick evaluates, **with a 2 s timeout** (a hung renderer never answers; timeout = −1), the lazily-installed top-level counter:
  `(() => { if (window.__wpSaverRaf == null) { window.__wpSaverRaf = 0; (function t() { window.__wpSaverRaf++; requestAnimationFrame(t); })(); } return window.__wpSaverRaf; })()`
  (top-level, not the stage's `WP.host.frames`: a still wallpaper idles its stage legitimately). `--saver-stall` → always −1. Steps: `Reload` → `surface.Reload()`; `Recreate` → dispose the `Surface`, make a new one at the same URL; `Fallback` → dispose the `Surface` and paint the clock; `Retry` → a new `Surface` (the clock stays painted under it until `Recovered`); `Recovered` → stop painting the clock. `Surface.Lost` → `watchdog.Crashed()` and act on its step. Each step is logged and appended to `steps`.
- The fallback clock: `OnPaint` on black, the local time (`DateTime.Now.ToString("t", CultureInfo.CurrentCulture)`), white, a `Segoe UI Light` font about 1/6 of the window height, at a spot that moves to a new random place inside the window every minute (no burn-in); a 1 s timer invalidates only while in fallback.

- [ ] **Step 5: The app side**

`App.OnCommand`: `"saver-on"` → `Power.SaverPing()`; `"saver-off"` → `Power.SaverEnded()`. `Power` keeps a `SaverLease`: `SaverPing` pings it and sets `SaverRunning = true` at once; `SaverEnded` ends it and re-polls; `Polled()` sets `SaverRunning = spiRunning || lease.Active(DateTime.UtcNow)`. (The desktop already hides on `SaverRunning`.) `Native.cs`: add only the messages and calls you use (`GetCursorPos`, the `WM_*` constants above, `SC_SCREENSAVE`, `WM_ACTIVATEAPP`).

- [ ] **Step 6: Self-test 9a (in `SelfTest.RunAsync`, after `CrashAsync(first)`, before `// 10. Cleanup`)**

A helper `StartSaver(string extraArgs)` → `Process.Start(Environment.ProcessPath!, $"/s --selftest --saver-window {rects} {extraArgs}")` with harness rects inside the primary work area's top-left (`480×270` at work.Left+40, work.Top+40, and a second one `480×270` to its right when two are needed); `ReadState()` parses `saver-state.json` (missing or mid-write → null). Find the child's windows: `N.EnumWindows` for `PidOf(h) == child.Id && TextOf(h) == "WallpapersSaver"`. Raise `TimeoutSeconds` from 150 to 240. Each check kills the child in `finally` if it is still running. Checks (one line each):
- `saver run` — `SaverSettings` set (via `app.SaveSettings(app.Settings with { Saver = new(SaverShow.Different, null, 5, true) })`) before starting; two harness windows; within 20 s both windows' `frames` advance by > 20 over 2 s, each `url` contains `host=windows-saver` and `clock=drift`, both `wallpaper`s are set, different, and not in `SaverPicker.Never`.
- `saver hides the desktop` — while it runs, `app.Power.State.SaverRunning` and `first.Web` not visible (`!first.Visible`) within 6 s; after it ends, both back within 6 s.
- `saver input (move)` — `PostMessage(WM_MOUSEMOVE)` at the cursor's own point (from `GetCursorPos`, converted to that window's client coordinates) → still running 1 s later; then one 200 px away → exits within 3 s, exit code 0, `ended == "move"`.
- `saver rotation` — started with `--saver-change-ms 2000` (reuse the run above if simpler): `rotations >= 1` within 8 s, the two windows still differ.
- `saver input (key)` — a new run, `PostMessage(WM_KEYDOWN, VK_SPACE)` → exits ≤ 3 s, `ended == "key"`.
- `saver input (click)` — a new run, `WM_LBUTTONDOWN` → exits ≤ 3 s, `ended == "click"`.
- `saver watchdog` — a new run with `--saver-stall`: `steps` reaches `reload`, `recreate`, `fallback`, `retry` in that order within 25 s, and the window is in `fallback` at some reading; then end it with a key.
Restore `app.Settings.Saver` to what it was afterwards.

- [ ] **Step 7: Verify**

Run: `make win-unit` → PASS. Then (owner's normal app quit first, per Global Constraints) `BUILD=1 make win-test` → every existing check as before, and the seven `saver …` lines PASS. Run it twice; a flake is a bug to fix, not to retry past.

- [ ] **Step 8: Commit** — `git commit -m "Windows W5: the screen saver runs (/s): a page per monitor, input ends it, watchdog, the desktop pauses"`

---

### Task 4: Selection, install and uninstall

**Files:**
- Create: `windows/Wallpapers/SaverSelection.cs`
- Modify: `windows/Wallpapers/Install.cs`, `Native.cs`, `SelfTest.cs`

**Interfaces:**
- Consumes: `SaverRegistry`, `SaverRestore`, `PreviousSaver`, `InstallLayout.Saver` (already `<root>\Wallpapers.scr`).
- Produces:
  - `sealed class SaverSelection(string flavor, Action<string> log)` with
    `string? PolicyReason()` (null when no policy sets `SCRNSAVE.EXE` or `ScreenSaveActive` under `PolicyKeyFor(flavor)` in HKCU, or — `run` only — the same path in HKLM; else `"Your organization's policy sets the screen saver"`),
    `bool IsSelected(string saverPath)`,
    `PreviousSaver Select(string saverPath)` (returns what was there; writes `SCRNSAVE.EXE` = `GetShortPathName(saverPath)` when it gives one, else the long path, and `ScreenSaveActive = "1"`; `run` only: then `SystemParametersInfo(SPI_SETSCREENSAVEACTIVE, 1, 0, SPIF_UPDATEINIFILE | SPIF_SENDCHANGE)`),
    `void RestoreIfOurs(PreviousSaver? before, string saverPath)` (only when `IsSelected`: writes `SaverRestore.For(...)`, deleting `SCRNSAVE.EXE` when `Exe` is null; `run`: `SPI_SETSCREENSAVEACTIVE` with the restored active flag),
    `int? TimeoutMinutes()` / `void SetTimeoutMinutes(int minutes)` (`run`: `SPI_GETSCREENSAVETIMEOUT` / `SPI_SETSCREENSAVETIMEOUT` seconds with `SPIF_UPDATEINIFILE | SPIF_SENDCHANGE`; other flavours: the `ScreenSaveTimeOut` string value in `KeyFor(flavor)`),
    `static string LongPath(string path)` (`GetLongPathName`, the input when it fails).
  - `Install` copies `Wallpapers.scr` with the exe; `RestoreSaver()` becomes `RestoreSaver(InstallLayout)` and is real.

- [ ] **Step 1: `SaverSelection`** to the interface above. A guard at the top of every SPI call: `if (flavor != "run") return;`. Registry under `Registry.CurrentUser.CreateSubKey(SaverRegistry.KeyFor(flavor))`. Values are `REG_SZ` (Windows writes them as strings).

- [ ] **Step 2: `.scr` in `Install.CopyAndSwap`**

Stage `layout.Saver + ".new"` from the source exe beside `Wallpapers.exe.new`; swap order: exe, then `.scr`, then `web`; roll back the `.scr` with the others; tidy `.scr.new`/`.scr.old`. A locked `.scr` (the saver is running) fails the swap like a locked exe, with the reason `"Wallpapers.scr is in use (the screen saver may be running); try again when it has stopped"`. When the copy is skipped (`--install` run from the install folder), make the `.scr` if it is missing or its length differs from the exe's (a W4 install has none), logged, failure logged and not fatal.

- [ ] **Step 3: Uninstall restores the saver**

`RestoreSaver(layout)`: `AppSettings.Load(Path.Combine(layout.DataFolder, "settings.json")).Saver.Before` → `new SaverSelection(layout.Flavor, log).RestoreIfOurs(before, layout.Saver)`; errors (IO, unauthorized, security) are logged and named in `left` as `"screen saver"`, and the rest still runs. It already runs first in `RemovePlan`.

- [ ] **Step 4: Self-test (extend `InstallChecks`, and a new check before it)**

- `install`: add `File.Exists(layout.Saver) && new FileInfo(layout.Saver).Length == new FileInfo(layout.Exe).Length`.
- `update`: before it, write `"old"` over `layout.Saver`; after it, the `.scr`'s length equals the exe's again.
- `saver selection` (test flavour key only — assert `SaverRegistry.KeyFor(app.Paths.Flavor) != SaverRegistry.DesktopKey` first, else FAIL and touch nothing): seed `KeyFor("test")` with `SCRNSAVE.EXE = C:\Windows\System32\Ribbons.scr`, `ScreenSaveActive = 1`; `Select(layout.Saver)` (the install is in place at that point: run it between `install` and `update`) returns `before.Exe == Ribbons`, the value now resolves to `layout.Saver` (`IsSelected`), `ScreenSaveActive == "1"`; set `SCRNSAVE.EXE` under `PolicyKeyFor("test")` → `PolicyReason() != null`; delete it → null; `SetTimeoutMinutes(10)` → `TimeoutMinutes() == 10`.
- `uninstall restores the saver`: save `app.Settings with { Saver = … Before = <what Select returned> }` (the uninstall reads the data folder's settings.json), then the existing `Remove(keepSettings: true)` → the test key's `SCRNSAVE.EXE` is `Ribbons.scr` again and `ScreenSaveActive` `"1"`. Add it to the `uninstall` line or as its own line.
- `finally`: delete the whole `Software\Wallpapers-test` key tree.

- [ ] **Step 5: Verify** — `make win-unit`, then `BUILD=1 make win-test` (owner's app quit first): all PASS, `install`/`update`/`uninstall` lines mention the `.scr`.

- [ ] **Step 6: Commit** — `git commit -m "Windows W5: install Wallpapers.scr with the exe, select it as the saver, uninstall puts the old one back"`

---

### Task 5: The tray's Screen Saver menu, the options window (`/c`), the preview (`/p`), self-test 9b

**Files:**
- Create: `windows/Wallpapers/SaverControl.cs`, `SaverOptionsWindow.cs`, `Saver/SaverPreview.cs`
- Modify: `windows/Wallpapers/Saver/SaverMain.cs`, `App.cs`, `Program.cs`, `Tray.cs`, `Native.cs`, `SelfTest.cs`

**Interfaces:**
- Consumes: `SaverSelection` (Task 4), `SaverSettings`/`SaverChoices` (Task 1), `Tray` catalog, `App.SaveSettings`.
- Produces:
  - `sealed class SaverControl(App app)`: `string? WhyNot()` (null when it can be selected; `"Install Wallpapers first"` when `app.Installer` is null or `!File.Exists(app.Layout!.Saver)`; else `PolicyReason()`), `bool Selected`, `void ToggleUse()` (selecting asks first; unselecting doesn't), `int? StartAfter`, `void SetStartAfter(int minutes)`, `SaverSettings Settings`, `void Set(SaverSettings s)` (`app.SaveSettings(app.Settings with { Saver = s.Normalized() })`), `void PreviewNow()`, `void OpenWindowsSettings()`.
  - `App.Saver` (`SaverControl`), `App.OpenSaverOptions()`; the pipe command `saver-options`; the `--saver-options` argument.
  - `Tray.Catalog` (`CatalogInfo?`, monitor 1's, for the One Wallpaper list).
  - Preview child caption `"WallpapersSaverPreview"`.

- [ ] **Step 1: `SaverControl`**

- `ToggleUse`, when selecting: a `TaskDialog` — Caption `Wallpapers`, Heading `Use Wallpapers as your screen saver?`, Text `It starts after {N} minutes without input{, showing …}. Windows' Screen Saver Settings can change it back, and uninstalling Wallpapers puts your old one back.`, buttons `Use Wallpapers` (default) and Cancel, `AllowCancel = true`. On yes: `before = selection.Select(layout.Saver)`; store `Before = before` only if nothing ours is stored yet or the stored one isn't ours (`SaverRegistry.IsOurs`), then save. A Windows timeout of 0 or none → `SetStartAfter(5)` first.
- Unselecting: `RestoreIfOurs(Settings.Before, layout.Saver)`, then `Before = null`.
- `PreviewNow`: `Process.Start(Environment.ProcessPath!, "/s")` (plus ` --selftest` in the test flavour); `OpenWindowsSettings`: `control.exe desk.cpl,,@screensaver` from `Environment.SystemDirectory`.
- Every failure (registry, process start) → `Log.Warn` and a warning `TaskDialog` saying what didn't happen; nothing throws into the tray.

- [ ] **Step 2: The tray menu**, inserted after `settings` (§10.25.10 order):
```
Screen Saver                          ▸
  Use Wallpapers as the Screen Saver…   ✓ when Selected; disabled with WhyNot() as its ToolTipText
  Start After                         ▸ 1 min · 3 min · 5 min · 10 min · 15 min · 30 min   (radio; StartAfter)
  Show                                ▸ Same as the Desktop · A Different One Each Time · One Wallpaper ▸ (radio)
                                          One Wallpaper ▸ = Tray.Catalog's non-pseudo entries, icon + name, current ticked
  Change Every                        ▸ 1 · 5 · 15 · 30 min (radio; enabled only for Different)
  Show a Clock                          ✓
  ───
  Preview Now
  Open Windows Screen Saver Settings…
```
Read `Selected`, `StartAfter` and `WhyNot()` when the menu opens (as `SyncInstall` does), not per `Sync`. Every row goes through `Item(...)`/`Run(...)` (exceptions logged, never thrown).

- [ ] **Step 3: `SaverOptionsWindow` (`/c`)**

One small fixed dialog (`FormBorderStyle.FixedDialog`, no maximize/minimize, `AutoScaleMode.Dpi`, `Icon = Tray.LoadIcon()`, centered on the screen, `TopMost` while it opens then `Activate()`): a check box *Use Wallpapers as the screen saver* (disabled with a grey line saying `WhyNot()` when not null), *Start after* combo (the six values), *Show* three radio buttons with a wallpaper combo beside *One wallpaper* (from `Tray.Catalog`; "Loading…" until known), *Change every* combo (enabled for Different), *Show a clock* check box, and buttons *Preview*, *Windows Screen Saver Settings…*, *Close* (Accept and Cancel button). Each control applies at once through `SaverControl`; reopening focuses the one window. `App.OpenSaverOptions()` makes or focuses it; `Cleanup` closes it.

- [ ] **Step 4: `/c` and `--saver-options`**

`SaverMain.Run` for `Configure`: `Log.Init(paths, saver: true)`; `N.AllowSetForegroundWindow(N.ASFW_ANY)`; if `SingleInstance.Send(paths.Flavor, "saver-options")` → 0. Else start `Path.Combine(AppContext.BaseDirectory, "Wallpapers.exe")` (if missing and `ProcessPath` is an `.exe`, `ProcessPath`) with `--saver-options` (plus `--selftest` only if the flavour is test), 0. `App.OnCommand("saver-options")` → `OpenSaverOptions()`. `Program`: `--saver-options` opens it after startup like `--settings`; on the second-instance path send `saver-options` instead of `settings` when that argument is present.

- [ ] **Step 5: `/p <hwnd>` (`SaverPreview`)**

`SaverMain.Run` for `Preview`: if `!N.IsWindow(hwnd)` → 0. A `Control` subclass created as a child of the foreign window (`CreateParams`: `Parent = hwnd`, `Style = WS_CHILD | WS_VISIBLE | WS_CLIPCHILDREN`, size = the parent's client rect via `GetClientRect`), `Text = "WallpapersSaverPreview"`, black. A `Surface` in it at `RasterizationScale = 0.5` (the page lays out at twice the little monitor's size, then is drawn into it; 0.5 is WebView2's floor), the same URL choice as a saver window without the clock. If the environment or page can't start, paint the app icon centered on black. A 500 ms timer: `!N.IsWindow(hwnd)` → exit; `WM_DESTROY` of the control → exit. No watchdog, no pings, no cursor hiding, no input handling (the dialog's own). Writes the state file with `"mode": "preview"`.

- [ ] **Step 6: Self-test 9b** (after Task 3's saver checks)
- `saver preview` — a `Form` of client size 152×112 at the work area's top-left + (40, 360), `ShowInTaskbar = false`; start `/p {form.Handle} --selftest`; within 15 s a child window of that form with caption `WallpapersSaverPreview` exists and the state file shows `mode == "preview"` with frames advancing by > 10 over 2 s; close the form → the child process exits within 3 s.
- `saver options (/c)` — start `/c --selftest`; within 5 s `App.SaverOptionsOpen` (an `internal bool` on `App`) is true; close it via the window's `Close()`.
- `saver menu` — open nothing visually: read the tray's Screen Saver submenu items (an `internal` accessor) and check the rows and their order match Step 2's, and `Change Every` is disabled while `Show` is Same.

- [ ] **Step 7: Verify** — `make win-unit`, `BUILD=1 make win-test` (owner's app quit first): everything PASS, twice.

- [ ] **Step 8: Commit** — `git commit -m "Windows W5: Screen Saver menu and options window (/c), the preview (/p)"`

---

### Task 6: Make targets, run.sh, docs, CI

**Files:**
- Modify: `Makefile`, `windows/run.sh`, `README.md`, `SPEC.md`, `docs/superpowers/specs/…` (no), `.github/workflows/ci.yml` (only if a change is needed; the `win` job already runs `make win-test-zip`).

- [ ] **Step 1: `make win-saver`** — `## Run the built Windows screen saver full screen (/s) until you press a key or move the mouse, then show its log` → `BUILD=1 windows/run.sh saver`. `run.sh saver`: copy as `run` does into `Wallpapers-build\run`, start `Wallpapers.exe /s` (normal flavour: the owner's settings, read-only), wait for it to exit, then `tail -n 40` of `%LOCALAPPDATA%\Wallpapers\saver-log.txt`. `run.sh log saver` shows the saver log. Add `win-saver` to `.PHONY` and README's Development section.

- [ ] **Step 2: README** — a *Screen saver* subsection under the Windows section: install first; tray → Screen Saver → *Use Wallpapers as the Screen Saver…*; Start After, Show (Same, Different, One), Change Every, Show a Clock, Preview Now; Windows' own dialog lists it and its *Settings…* opens our options; uninstall puts the old saver back; group policy can lock it. One line on SmartScreen/SAC applying to the `.scr` the same as the exe.

- [ ] **Step 3: SPEC** — §10.25 status line (W5 built, by-hand pending), §10.25.12 *As built* (files, dispatch order, the harness flags, the state file, `saver-log.txt`, lease, watchdog timings, what was decided below), §10.25.13 (`.scr` now created; `RestoreSaver` real), §10.25.15 (self-test lines added, `win-saver`), §10.25.16 W5 *As built* with the owner's by-hand checklist (select from the tray, Windows' dialog shows it, its Settings… opens our options, its preview shows a live page, wait for the timeout, every input ends it on both monitors, *On resume, display logon screen*, Preview Now, Different with two monitors, uninstall restores), §10.25.20 design calls made in W5, line 19/35 status.

- [ ] **Step 4: Verify** — `CHROME_PATH=… make ci` passes (lint, audit, tests, win-unit, smoke); `make win-release` builds the zip.

- [ ] **Step 5: Commit** — `git commit -m "Windows W5: win-saver, README and SPEC"`
