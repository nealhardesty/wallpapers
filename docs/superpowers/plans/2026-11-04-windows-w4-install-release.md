# Windows Phase W4 (Install and Release) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A person downloads `wallpapers-windows-<version>.zip`, runs `Wallpapers.exe`, and is offered *Install* (per user, no admin: `%LOCALAPPDATA%\Programs\Wallpapers`, a Start menu shortcut, an entry in Settings → Apps, *Start with Windows* ticked) or *Just Run*; a newer download offers to update the installed copy in place while it runs; *Uninstall* leaves the machine as it found it and asks about settings; CI self-tests the exact zip it ships on a Windows runner; releases work unsigned and sign themselves the day the owner adds signing secrets. The first release ships here, without the saver.

**Architecture:** Every decision is pure and lives in `Wallpapers.Core` with xUnit tests: the install layout (paths, names, a `-test` flavour that never touches the real install), version parsing and comparison, the install/update/just-run decision, the Run-key, shortcut and Uninstall-entry specs, the uninstall plan, and the command-line modes. The app gets one new file, `Install.cs`, that executes those specs (file copies, `Microsoft.Win32.Registry`, an `IShellLink` shortcut by COM, `TaskDialog`s), and `Program.cs` dispatches `--install`, `--uninstall` and the offer before the single-instance check. Uninstall runs from a copy of the exe in `%TEMP%` so it can delete the folder it came from. CI gains a `win` job that downloads the zip the `ci` job built, self-tests it on `windows-2025` and gates the release on it, non-blocking like the Mac's; `windows/sign.sh` signs the exe on Linux with Azure Trusted Signing (through jsign) only when the `WALLPAPERS_SIGN_*` secrets exist.

**Tech Stack:** as W3: .NET 10 in WSL (`EnableWindowsTargeting`), C#, WinForms (`TaskDialog`), `Microsoft.Win32.Registry` (in `net10.0-windows`), hand-written COM interop for `IShellLinkW`/`IPersistFile`, WebView2 1.0.4314.35, xUnit v3; bash, make, GitHub Actions (`windows-2025`), jsign (Java, pinned) and `osslsigncode` for the optional signing.

**Spec:** `SPEC.md` §10.25.13 (install, start, uninstall: the source of truth), §10.25.16 W4 line ("self-installer, Start with Windows, updates, uninstall, Start menu, `win-release`, CI `win` job, README sections, SPEC updates (this section's status, the intro's host list, §10.25.3's layout). The first release ships here, without the saver."), §10.25.15 (make targets, `win-release` *as built*, CI, `--selftest --no-desktop`), §10.25.4 (program modes, where things live), §10.25.10 (the *Start with Windows* row), §10.25.17–.20 and the Open questions "signing, now that Smart App Control is in play" and "one ~70 MB self-contained exe" (owner decisions), §10.25.12 only for what W5 will need from the installer. W3 as built: §10.25.16 and `docs/superpowers/plans/2026-11-04-windows-w3-interactivity.md`.

## Global Constraints

- Everything in W1–W3's Global Constraints still holds (data roots per flavour, `WebFactory.BrowserArgs = ""`, never steal focus, no console, make targets for everything with `##` descriptions and README rows, CI calls make only, `make ci` green, zero warnings, no home paths, user names, emails or 32+ hex runs in committed files, commits end with `Co-Authored-By: <the committing model, e.g. Claude Sonnet 5.5> <noreply@anthropic.com>`).
- **Per user, no admin:** everything goes under `HKCU` and the user's profile. `asInvoker` stays; no UAC prompt anywhere; no services, scheduled tasks or drivers; nothing touches another user's data.
- **Install layout** (`InstallLayout.For(flavor, localAppData, roamingAppData)`; Windows paths joined with `\` explicitly, since Core's tests run on Linux): root `%LOCALAPPDATA%\Programs\Wallpapers`, `Wallpapers.exe`, `web\`, `Wallpapers.scr` (reserved for W5: named, removed on uninstall, **not created** in W4), shortcut `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Wallpapers.lnk`, Run value `Wallpapers` under `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`, key `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\Wallpapers`, display name `Wallpapers`. The **test** flavour adds `-test` to the root, the shortcut, the Run value and the key, and shows as `Wallpapers (test)`; the **dev** flavour never installs or offers.
- **Installed** = `AppContext.BaseDirectory` is the layout's root (case-insensitive, trailing separators ignored). The installed version is `FileVersionInfo.GetVersionInfo(layout.Exe).ProductVersion` (`0.10.3+20261104093000`: `build.sh`'s `InformationalVersion`).
- **Versions** compare by `major.minor.patch` numerically, then by the `+` build stamp numerically; the display form drops the stamp.
- **The offer** (`run` flavour, not `--just-run`, not installed): not installed and not declined before → *Install* / *Just Run*; installed and this exe newer → *Update* / *Just Run*; installed and this exe the same or older → no dialog, log one line, run. *Just Run* is remembered (`settings.json` `"offerInstall": false`); an update is still offered after it.
- **Install** copies `Wallpapers.exe` and `web\` (staged as `Wallpapers.exe.new` and `web.new`, swapped last, so a failed copy leaves the old install whole), writes the Uninstall entry, the shortcut and the Run value, then starts the installed exe and exits. **Update** does the same without touching the Run value (the user's choice stands), after asking the running app to quit over the pipe and waiting up to 15 s for the mutex and the exe lock. Settings (`%LOCALAPPDATA%\Wallpapers`) are never copied or removed by install or update.
- **Uninstall** (`--uninstall`): copies the exe to `%TEMP%\Wallpapers-uninstall-<stamp>.exe` and runs that with `--uninstall-stage2 "<root>"`; stage 2 asks *Keep my settings* / *Delete my settings too* / *Cancel* unless told (`--keep-settings` / `--delete-settings`), quits the running app, removes the Run value, the Uninstall key, the shortcut and the root (and `%LOCALAPPDATA%\Wallpapers` when told), logs to `%TEMP%\Wallpapers-uninstall.log`, and deletes its own copy on the way out. The saver restore is W5's (a `RestoreSaver` step stays a no-op hook).
- **Self-test and implementers never touch the real install:** the self-test's `install`/`update`/`uninstall` checks use the `test` layout and remove everything in `finally`. A step that installs for real says so and the next step uninstalls. Implementers screenshot with PowerShell `CopyFromScreen`, never lock, sleep, change displays, restart Explorer or synthesize input; the owner is on RDP with Smart App Control on (a refused build shows over WSL as `Invalid argument`; `run.sh` rebuilds).
- **Network:** the app makes no network call for installing or updating (SPEC §10.25.13 has no online check); the only link is the project's homepage, stamped into the exe at build time from `web/manifest.json`'s `homepage_url` (never written in C#), opened in the default browser on request. No telemetry.
- **Signing:** releases work unsigned. `windows/sign.sh` signs only when every `WALLPAPERS_SIGN_*` variable is set, and `release.sh`'s last line says `signed` or `unsigned`. Unsigned consequences, stated in the README: SmartScreen's *More info → Run anyway* on a downloaded copy; a Smart App Control machine may refuse the exe by hash with no override.

## Review Focus

1. **Start with Windows runs the app before Explorer has built the desktop** (fast SSDs, sign-in). Expected: the wallpaper appears within seconds without a relaunch, through W2's 5 s watch. *(Task 8 by hand: sign out and in, read the log for the retry.)*
2. **An update while the installed app is slow to quit or its exe is locked** (a browser process still closing, a file open in a hex editor). Expected: the updater waits, then reports it couldn't and leaves the old install whole and running. *(Task 5: self-test `update (busy exe)`.)*
3. **A profile path with spaces or non-ASCII** (`D:\Profiles\Zoë Ü\…`). Expected: the Run value, the shortcut and `UninstallString` all quote the path and Settings → Apps' Uninstall still works. *(Task 2: every spec test uses such a path.)*
4. **Uninstall from Settings → Apps while the app runs from that very folder.** Expected: the app quits, the folder, shortcut and registry go, the uninstaller's own copy goes, settings stay when asked. *(Task 4 on Windows, real install then uninstall; Task 8 by hand through Settings → Apps.)*
5. **The hosted runner has no Explorer desktop, or no WebView2 runtime.** Expected: the `win` job says exactly which, not a wall of FAILs, and the release still ships with a warning rather than silently without Windows. *(Task 7: the runtime check step; `--no-desktop` only if the first run needs it; the release job's warning.)*

---

## File Structure

```
windows/Wallpapers.Core/
  InstallLayout.cs              InstallLayout (paths and names per flavour), IsInstalledAt
  AppVersion.cs                 Parse, CompareTo, Display
  InstallOffer.cs               Offer { None, Install, Update }; Decide(...)
  InstallSpecs.cs               RunKey.Spec, StartMenuShortcut.Spec (ShortcutSpec), UninstallEntry.Values, UninstallPlan.For
  InstallArgs.cs                InstallMode { None, Install, Uninstall, UninstallStage2 }; Parse
  AppSettings.cs                + OfferInstall
windows/Wallpapers/
  Install.cs                    the executor: Apply, Remove, StartWithWindows get/set, the offer and uninstall dialogs, stage 1 → 2
  ShellLink.cs                  IShellLinkW / IPersistFile COM interop: Create(ShortcutSpec), TargetOf(path)
  Program.cs                    --install, --uninstall, --uninstall-stage2, --just-run, the offer, before the single-instance check
  Tray.cs                       Start with Windows ✓ (installed) or Install… (not), a separator before it; About → TaskDialog with Uninstall… and Project Page
  App.cs                        Homepage (assembly metadata), Layout
  SelfTest.cs                   + install, update, update (busy exe), uninstall; --no-desktop (only if Task 7 needs it)
  Wallpapers.csproj             AssemblyMetadata Homepage from -p:Homepage
windows/build.sh                -p:Homepage=<manifest homepage_url>
windows/sign.sh                 optional Azure Trusted Signing through jsign; "unsigned" otherwise
windows/release.sh              calls sign.sh; verifies a signature when there is one; prints signed/unsigned
windows/run.sh                  install / uninstall modes; --just-run for run and dev; DIST=; Git Bash (CI) paths
windows/Wallpapers.Tests/       InstallLayoutTests, AppVersionTests, InstallOfferTests, InstallSpecsTests, InstallArgsTests, AppSettingsTests
Makefile                        win-install, win-uninstall, win-sign, win-test-zip
.github/workflows/ci.yml        the win job; release needs it (non-blocking); signing env on tags
README.md, SPEC.md              install, update, uninstall, Start with Windows, releasing and signing; §10.25 status, intro, layout, W4 as built
```

---

### Task 1: Core: the install layout, versions and the offer

**Files:**
- Create: `windows/Wallpapers.Core/InstallLayout.cs`, `AppVersion.cs`, `InstallOffer.cs`; Test: `windows/Wallpapers.Tests/InstallLayoutTests.cs`, `AppVersionTests.cs`, `InstallOfferTests.cs`

**Interfaces:**
- `sealed record InstallLayout(string Flavor, string Root, string Exe, string Web, string Saver, string Shortcut, string RunValueName, string UninstallKey, string DisplayName, string DataFolder)`; `static InstallLayout For(string flavor, string localAppData, string roamingAppData)` (`run` and `test` only; `dev` throws `ArgumentException`); `bool IsInstalledAt(string baseDirectory)`. (The Run key's path is Task 2's `RunKey.Path`.)
- `sealed record AppVersion(int Major, int Minor, int Patch, long Stamp) : IComparable<AppVersion>`; `static AppVersion? Parse(string? text)`; `string Display`.
- `enum Offer { None, Install, Update }`; `static Offer InstallOffer.Decide(AppVersion running, bool installedHere, AppVersion? installed, bool declined, bool justRun)`.

- [ ] **Step 1: Write the failing tests**, with `L = @"D:\Profiles\Zoë Ü\AppData\Local"` and `R = @"D:\Profiles\Zoë Ü\AppData\Roaming"`:
  - `Run_flavor_installs_under_Programs`: `For("run", L, R)` → `Root == L + @"\Programs\Wallpapers"`, `Exe == Root + @"\Wallpapers.exe"`, `Web == Root + @"\web"`, `Saver == Root + @"\Wallpapers.scr"`, `Shortcut == R + @"\Microsoft\Windows\Start Menu\Programs\Wallpapers.lnk"`, `RunValueName == "Wallpapers"`, `UninstallKey == @"Software\Microsoft\Windows\CurrentVersion\Uninstall\Wallpapers"`, `DisplayName == "Wallpapers"`, `DataFolder == L + @"\Wallpapers"`.
  - `Test_flavor_keeps_its_own_names`: `For("test", L, R)` → `Root` ends `\Programs\Wallpapers-test`, `Shortcut` ends `\Wallpapers-test.lnk`, `RunValueName == "Wallpapers-test"`, `UninstallKey` ends `\Wallpapers-test`, `DisplayName == "Wallpapers (test)"`, `DataFolder == L + @"\Wallpapers-test"`.
  - `Dev_never_installs`: `For("dev", L, R)` throws `ArgumentException`.
  - `Installed_at_ignores_case_and_trailing_separators`: `IsInstalledAt(@"d:\profiles\zoë ü\appdata\local\programs\wallpapers\")` true; `IsInstalledAt(L + @"\Wallpapers-build\run")` false.
  - `Parses_version_and_build_stamp`: `Parse("0.10.3+20261104093000")` → `(0, 10, 3, 20261104093000)`; `Parse("0.10.3")` → stamp `0`; `Parse("?")`, `Parse("")`, `Parse(null)`, `Parse("1.2")` → `null`.
  - `Compares_numerically_then_by_stamp`: `Parse("0.11.0") > Parse("0.9.9")`; `Parse("1.0.0") > Parse("0.99.99")`; `Parse("0.10.3+2") > Parse("0.10.3+1")`; `Parse("0.10.3+1").CompareTo(Parse("0.10.3+1")) == 0`.
  - `Display_drops_the_stamp`: `Parse("0.10.3+20261104093000").Display == "0.10.3"`.
  - `Not_installed_offers_install`: `Decide(v("0.11.0"), false, null, false, false) == Offer.Install`.
  - `Declined_once_is_not_asked_again`: `Decide(v("0.11.0"), false, null, true, false) == Offer.None`.
  - `A_newer_exe_offers_an_update_even_after_a_decline`: `Decide(v("0.11.0"), false, v("0.10.3"), true, false) == Offer.Update`.
  - `The_same_or_an_older_exe_just_runs`: installed `0.11.0`, running `0.11.0` → `None`; running `0.10.3` → `None`.
  - `Running_from_the_install_folder_never_offers`: `Decide(v("0.12.0"), true, v("0.11.0"), false, false) == Offer.None`.
  - `Just_run_offers_nothing`: `Decide(v("0.12.0"), false, v("0.11.0"), false, true) == Offer.None`.
- [ ] **Step 2: Run `make win-unit`.** Expected: FAIL (missing types).
- [ ] **Step 3: Implement** the three files as in Interfaces. Join paths with a local `Join(a, b) => a.TrimEnd('\\') + '\\' + b` (not `Path.Combine`: the tests run on Linux).
- [ ] **Step 4: Run `make win-unit`.** Expected: PASS (all W1–W3 tests too).
- [ ] **Step 5: Commit** `Windows W4: Core install layout, versions and the install offer`.

---

### Task 2: Core: the Run key, the shortcut, the Uninstall entry, the uninstall plan, the modes

**Files:**
- Create: `windows/Wallpapers.Core/InstallSpecs.cs`, `InstallArgs.cs`; Modify: `AppSettings.cs`; Test: `InstallSpecsTests.cs`, `InstallArgsTests.cs`, `AppSettingsTests.cs`

**Interfaces:**
- `static class RunKey { const string Path = @"Software\Microsoft\Windows\CurrentVersion\Run"; static (string Name, string Data) Spec(InstallLayout l); }` — `Data` is `"\"<Exe>\""`.
- `sealed record ShortcutSpec(string Path, string Target, string WorkingDirectory, string Description, string IconPath, int IconIndex)`; `static ShortcutSpec StartMenuShortcut.Spec(InstallLayout l)`: description `Live wallpapers behind your desktop icons`.
- `static IReadOnlyDictionary<string, object> UninstallEntry.Values(InstallLayout l, AppVersion v, int sizeKb, string installDate, string? homepage)` (`int` values are `REG_DWORD`, strings `REG_SZ`).
- `sealed record UninstallPlan(IReadOnlyList<string> Folders, IReadOnlyList<string> Files, (string Key, string Name) RunValue, string UninstallKey)`; `static UninstallPlan For(InstallLayout l, bool keepSettings)`.
- `enum InstallMode { None, Install, Uninstall, UninstallStage2 }`; `sealed record InstallArgs(InstallMode Mode, bool? KeepSettings, bool JustRun, string? Root)`; `static InstallArgs Parse(string[] args)`.
- `AppSettings` gains `bool OfferInstall = true`.

- [ ] **Step 1: Write the failing tests** (layout `L = InstallLayout.For("run", @"D:\Profiles\Zoë Ü\AppData\Local", @"D:\Profiles\Zoë Ü\AppData\Roaming")`):
  - `Run_value_quotes_the_installed_exe`: `RunKey.Spec(L) == ("Wallpapers", "\"D:\\Profiles\\Zoë Ü\\AppData\\Local\\Programs\\Wallpapers\\Wallpapers.exe\"")`.
  - `Shortcut_points_at_the_installed_exe`: `Path == L.Shortcut`, `Target == L.Exe`, `WorkingDirectory == L.Root`, `IconPath == L.Exe`, `IconIndex == 0`.
  - `Uninstall_entry_lists_what_settings_apps_shows`: `Values(L, Parse("0.11.0+20261104093000"), 72000, "20261104", "https://example.invalid/wallpapers")` equals exactly: `DisplayName "Wallpapers"`, `DisplayVersion "0.11.0"`, `Publisher "Wallpapers"`, `DisplayIcon "<Exe>,0"`, `InstallLocation <Root>`, `InstallDate "20261104"`, `UninstallString "\"<Exe>\" --uninstall"`, `QuietUninstallString "\"<Exe>\" --uninstall --keep-settings"`, `NoModify 1`, `NoRepair 1`, `EstimatedSize 72000`, `URLInfoAbout "https://example.invalid/wallpapers"`; with `homepage: null` there is no `URLInfoAbout`.
  - `Uninstall_removes_only_what_install_made`: `For(L, keepSettings: true)` → `Folders == [L.Root]`, `Files == [L.Shortcut]`, `RunValue == (RunKey.Path, "Wallpapers")`, `UninstallKey == L.UninstallKey`; `For(L, false)` → `Folders == [L.Root, L.DataFolder]`.
  - `Plain_start_is_no_mode`: `Parse([])` → `Mode None, KeepSettings null, JustRun false, Root null`; `Parse(["--just-run"]).JustRun`.
  - `Install_is_a_mode`: `Parse(["--install"]).Mode == Install`.
  - `Uninstall_asks_unless_told`: `Parse(["--uninstall"]).KeepSettings == null`; `["--uninstall", "--keep-settings"]` → `true`; `["--uninstall", "--delete-settings"]` → `false`.
  - `Stage2_carries_the_root`: `Parse(["--uninstall-stage2", @"C:\p\Wallpapers", "--keep-settings"])` → `Mode UninstallStage2, Root @"C:\p\Wallpapers", KeepSettings true`; without a root → `Mode None`.
  - `AppSettingsTests.Just_run_is_remembered`: `new AppSettings(OfferInstall: false)` saves `"offerInstall": false` and loads equal; `Old_files_offer_install`: the W2 fixture string loads with `OfferInstall == true`.
- [ ] **Step 2: Run `make win-unit`.** Expected: FAIL.
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run `make win-unit`.** Expected: PASS.
- [ ] **Step 5: Commit** `Windows W4: Core install specs (Run key, shortcut, Uninstall entry, uninstall plan) and the install modes`.

---

### Task 3: Install, update and Start with Windows

**Files:**
- Create: `windows/Wallpapers/Install.cs`, `ShellLink.cs`; Modify: `Program.cs`, `App.cs`, `Tray.cs`, `Wallpapers.csproj`, `windows/build.sh`

**Interfaces:**
- Consumes: Task 1 and 2's types; `SingleInstance.Send(flavor, "quit")`; `App.Version`.
- `App.Homepage` (`string?`): the `Homepage` assembly metadata, null when empty. `Wallpapers.csproj`: `<AssemblyMetadata Include="Homepage" Value="$(Homepage)" />`; `build.sh` passes `-p:Homepage="$(node -p "require('./web/manifest.json').homepage_url")"`. `App.Layout` (`InstallLayout?`): `For(paths.Flavor, …)` for `run` and `test`, null for `dev`.
- `static class ShellLink { void Create(ShortcutSpec spec); string? TargetOf(string lnkPath); }` by COM (`CLSID_ShellLink 00021401-0000-0000-C000-000000000046`, `IShellLinkW 000214F9-0000-0000-C000-000000000046`, `IPersistFile 0000010b-0000-0000-C000-000000000046`), on the STA thread.
- `sealed class Install(InstallLayout layout, Action<string> log)`:
  - `AppVersion? InstalledVersion()`; `bool InstalledHere` (`layout.IsInstalledAt(AppContext.BaseDirectory)`).
  - `string? Apply(string sourceDir, bool fresh)`: the copy (staged, swapped last), the Uninstall entry (size from the copied files, date `yyyyMMdd`, `App.Homepage`), the shortcut; `fresh` also sets the Run value. Returns why it failed, or null. If a `run`-flavour app is running, first `Send("quit")`, then wait ≤ 15 s for the mutex `Local\Wallpapers-<flavor>` to be free and `layout.Exe` to open with `FileShare.None`; failing that, return `"Wallpapers is still running; quit it from the tray and try again"` and change nothing.
  - `bool StartsWithWindows()`, `void SetStartWithWindows(bool on)`: the Run value present / written / deleted.
  - `Offer OfferToShow(AppSettings settings, bool justRun)`; `bool ShowOffer(Offer offer, AppSettings settings)` → a `TaskDialog` titled `Wallpapers`, heading `Install Wallpapers <Display>?` or `Update Wallpapers <installed> → <Display>?`, text naming `layout.Root` and "It starts with Windows and shows in Settings → Apps." / "Your settings stay as they are.", buttons `Install` or `Update`, and `Just Run`. Returns true when install/update ran and the installed exe was started (the caller exits).
  - `void Start()`: `Process.Start(layout.Exe)` with working directory `layout.Root`.
- `Program.Main` order: `--cover-for-test` → `InstallArgs.Parse`, and **`UninstallStage2` first of all** (Task 4; it has its own log and may delete the data folder) → paths → (test setup) → `Log.Init` → `--quit`, `--reload`, `--dump-displays` → **`Uninstall` (Task 4) and `Install` (quiet: `Apply(AppContext.BaseDirectory, fresh: true)`, start, exit 0; exit 1 with the reason logged on failure), `run` flavour only (`dev` logs `install: ignored (dev)` and runs)** → `ApplicationConfiguration.Initialize()` → **the offer, before the single-instance check** (run flavour only, not `--just-run`, not the self-test; `Just Run` saves `OfferInstall = false`; this way a newer download offers *Update* even while the installed app runs, and Install/Update quits whichever run-flavour app holds the mutex) → single-instance check → the app.
- Tray: after `settings` a `ToolStripSeparator`, then `startWithWindows` (`Start with Windows`, checked from `StartsWithWindows()`, shown when `InstalledHere`) or `install` (`Install…`, shown otherwise for the `run` flavour; runs `ShowOffer(Offer.Install …)` and, on install, `app.Quit()`), then `troubleshooting`, `about`, `quit`.

- [ ] **Step 1: Implement** `ShellLink`, `Install`, the csproj/build.sh stamping, `Program.Main` and the tray row. Log lines: `install: <Root> (fresh|update) <version>`, `install: start with windows on|off`, `install: offer <Install|Update|None> (<reason>)`, `install: declined (just run)`.
- [ ] **Step 2: Run `make win-build`.** Expected: zero warnings; `strings -el dist/win/Wallpapers.exe | grep -c github` is at least 1 (the homepage is stamped, not in the source: `grep -r "github" windows/*/*.cs` finds nothing).
- [ ] **Step 3: Run on Windows (implementer, installs for real; Step 4 removes it):** `make win-run` (run.sh now passes `--just-run`: no dialog, log `install: offer None (--just-run)`). Then start the built exe by hand without the flag: `powershell Start-Process <Wallpapers-build\run\Wallpapers.exe>` → the Install dialog shows (screenshot). Click *Install* **as the owner, or with `WScript.Shell` only after `AppActivate` confirms the dialog's title is ours**. Expected: `%LOCALAPPDATA%\Programs\Wallpapers\Wallpapers.exe` and `web\index.html` exist; `Get-ItemProperty HKCU:\Software\Microsoft\Windows\CurrentVersion\Run` has `Wallpapers` = the quoted path; `Get-ItemProperty HKCU:\…\Uninstall\Wallpapers` shows `DisplayName`, `DisplayVersion 0.10.3`, `UninstallString`; `Wallpapers.lnk` exists in the Start menu folder; the installed app is running (log `Wallpapers 0.10.3+… (run) data=… web=…\Programs\Wallpapers\web`) and the tray shows `Start with Windows ✓`; untick it: the Run value is gone; tick it back. Run the build-folder exe again: a dialog is not shown (`offer None (same version)`), and the running app opens Settings (the second-instance path).
- [ ] **Step 4: Remove it** by hand for now (Task 4 brings `--uninstall`): quit from the tray, delete the Run value, the Uninstall key, the `.lnk` and the folder with PowerShell. Expected: `Test-Path` false for all four. Record the folder's size for the README (`EstimatedSize`).
- [ ] **Step 5: Commit** `Windows W4: install and update offers, --install, Start with Windows, the Start menu shortcut, the Uninstall entry`.

---

### Task 4: Uninstall, the About dialog, `win-install` / `win-uninstall`

**Files:**
- Modify: `windows/Wallpapers/Install.cs`, `Program.cs`, `Tray.cs`, `windows/run.sh`, `Makefile`, `README.md` (Development rows)

**Interfaces:**
- `Install.StartUninstall(bool? keepSettings)` (stage 1): copy `AppContext.BaseDirectory\Wallpapers.exe` to `%TEMP%\Wallpapers-uninstall-<yyyyMMddHHmmss>.exe`, start it with `--uninstall-stage2 "<layout.Root>"` plus `--keep-settings` / `--delete-settings` when `keepSettings` is known, and exit 0. Stale `Wallpapers-uninstall-*.exe` in `%TEMP%` are deleted first (best effort).
- `static int Install.Stage2(InstallArgs args)`: `keep = args.KeepSettings ?? Ask()` (`TaskDialog`: heading `Uninstall Wallpapers?`, text naming the data folder, buttons `Keep My Settings`, `Delete My Settings Too`, `Cancel` → exit 2); `Send(flavor, "quit")` and wait ≤ 15 s as `Apply` does; `RestoreSaver()` (empty, W5); then `UninstallPlan.For(layout, keep)`: delete the Run value, the key, the shortcut, the folders; log each line to `%TEMP%\Wallpapers-uninstall.log`; last, start `cmd.exe /c ping -n 3 localhost >nul & del "<own path>"` hidden, exit 0. A folder that won't delete (a file in use) is reported in the log and the dialog's result text, and the rest still runs.
- `Install.Remove(bool keepSettings)` (in-process, for the self-test's `test` layout: the running exe isn't in that root) runs the same plan without a stage 2.
- Tray About → `TaskDialog`: the current text (version, runtime, data folder, wallpapers folder) plus "Installed in <Root>" or "Running from <BaseDirectory> (not installed)"; buttons `Close`, `Uninstall…` (installed only: `StartUninstall(null)`), `Project Page` (`App.Homepage != null`: `Shell.Open`).
- `run.sh`: `install` mode (copy `dist/win` to `Wallpapers-build\install`, run `./Wallpapers.exe --install`, print `installed <root>`); `uninstall` mode (`"$LOCAL/Programs/Wallpapers/Wallpapers.exe" --uninstall --keep-settings`; `DELETE_SETTINGS=1` → `--delete-settings`; prints what it asked); `run` and `dev` pass `--just-run` before `$WIN_ARGS`.
- Makefile: `win-install: ## Build the Windows app and install it for this Windows user (%LOCALAPPDATA%\Programs\Wallpapers, Start menu, Settings → Apps, Start with Windows); quits a running copy first` → `BUILD=1 windows/run.sh install`; `win-uninstall: ## Remove the installed Windows app and its Start menu, Run and Apps entries; settings stay (DELETE_SETTINGS=1 removes them too)` → `windows/run.sh uninstall`. Both join `.PHONY`.

- [ ] **Step 1: Implement** stage 1, stage 2, `Remove`, the About dialog, `run.sh` and the targets.
- [ ] **Step 2: Run on Windows (implementer; installs for real, Step 3 removes it):** `make win-install`. Expected: prints `installed …\Programs\Wallpapers`; the installed app runs; `make win-run`'s earlier copy is gone from the mutex (`--quit` was sent). Open About from the tray (screenshot): `Installed in …`, three buttons.
- [ ] **Step 3: Run on Windows:** `make win-uninstall`. Expected within ~5 s: the app is gone (no `Wallpapers.exe` process), `%TEMP%\Wallpapers-uninstall.log` lists `run value removed`, `uninstall key removed`, `shortcut removed`, `folder removed …\Programs\Wallpapers`, `settings kept`; `Test-Path` false for the Run value, the key, the `.lnk`, the folder; `%LOCALAPPDATA%\Wallpapers\settings.json` still there; no `Wallpapers-uninstall-*.exe` left in `%TEMP%` after 10 s. Then `make win-run` to leave the owner's desktop as it was.
- [ ] **Step 4: README Development rows** for `win-install` and `win-uninstall`; the `win-run` row gains "(a running installed copy quits first; it comes back at the next sign-in)".
- [ ] **Step 5: Commit** `Windows W4: --uninstall (from Settings → Apps and About), make win-install / win-uninstall`.

---

### Task 5: Self-test: install, update, update (busy exe), uninstall

**Files:**
- Modify: `windows/Wallpapers/SelfTest.cs`, `README.md` (the `win-test` row)

**Interfaces:**
- Consumes: `Install.Apply`, `Install.Remove`, `Install.SetStartWithWindows`, `UninstallEntry`, `ShellLink.TargetOf`, `App.Layout` (the `test` layout: root `…\Programs\Wallpapers-test`, value `Wallpapers-test`, key `…\Uninstall\Wallpapers-test`, `Wallpapers-test.lnk`).
- New checks, after `cleanup`'s predecessors and inside one `try … finally { Remove(keepSettings: true) }` so nothing of the test layout outlives the run, even on FAIL:
  - `install`: `Apply(AppContext.BaseDirectory, fresh: true)` returns null; `Exe` and `Web\index.html` exist; the Run value equals `RunKey.Spec(layout).Data`; the Uninstall key has `DisplayName == "Wallpapers (test)"`, `DisplayVersion == App.Version.Split('+')[0]`, `UninstallString` as the spec; `ShellLink.TargetOf(layout.Shortcut) == layout.Exe`.
  - `update`: `SetStartWithWindows(false)`; write `marker.txt` into `Web`; `Apply(…, fresh: false)` returns null; `marker.txt` is gone (web replaced whole), `Exe` exists, the Run value is still absent, `InstallDate` and `DisplayVersion` present.
  - `update (busy exe)`: open `layout.Exe` with `FileShare.None`, `Apply(…, fresh: false)` returns a non-null reason within 16 s mentioning `still running` or `in use`, and `layout.Exe`'s length is unchanged; close the handle.
  - `uninstall`: `Remove(keepSettings: true)`; `Root`, `Shortcut`, the Run value and the key are all gone; `layout.DataFolder` (the test data root, where this very report lives) still exists.
- [ ] **Step 1: Write `update (busy exe)` against a broken path first:** make `Apply` copy straight over `layout.Exe` instead of staging; run `make win-test`: the check must FAIL (the old exe is damaged or the reason is missing). Note the failing line in the commit message. Put the staging back.
- [ ] **Step 2: Implement the four checks.**
- [ ] **Step 3: Run `make win-test`** (quit the normal app first, restart it after). Expected: all PASS over RDP, ~55 s; afterwards `Test-Path` is false for `…\Programs\Wallpapers-test`, `Wallpapers-test.lnk`, the `Wallpapers-test` Run value and Uninstall key.
- [ ] **Step 4: README** `win-test` row: add "install, update and uninstall into a throwaway `Wallpapers-test` install (never your real one)".
- [ ] **Step 5: Commit** `Windows W4: self-test install, update, update (busy exe), uninstall`.

---

### Task 6: Release: optional signing, `win-release` records it

**Files:**
- Create: `windows/sign.sh`; Modify: `windows/release.sh`, `Makefile` (`win-sign`), `README.md` (Releasing)

**Interfaces:**
- `windows/sign.sh <exe>`: with all of `WALLPAPERS_SIGN_ENDPOINT`, `WALLPAPERS_SIGN_ACCOUNT`, `WALLPAPERS_SIGN_PROFILE`, `WALLPAPERS_SIGN_TENANT`, `WALLPAPERS_SIGN_CLIENT_ID`, `WALLPAPERS_SIGN_CLIENT_SECRET` set: fetch jsign (pinned version and sha256, verified; `java` must be present), get an access token by client credentials for scope `https://codesigning.azure.net/.default`, sign in place (`--storetype TRUSTEDSIGNING`, SHA-256, a timestamp server), print `signed <exe>`; with none set, print `unsigned (no WALLPAPERS_SIGN_* variables)` and exit 0; with some set, exit 1 naming the missing ones. Any partial set is a mistake, never a silent unsigned release.
- `release.sh`: after the build and before the checks, `windows/sign.sh "$EXE"`; when it printed `signed`, `osslsigncode verify "$EXE"` must pass; the last line becomes `built <zip> (<size>), <sha256>, signed|unsigned`.
- Makefile: `win-sign: ## Sign dist/win/Wallpapers.exe with Azure Trusted Signing (needs the WALLPAPERS_SIGN_* variables; prints "unsigned" without them)`.

- [ ] **Step 1: Write the check first:** run `make win-release` with only `WALLPAPERS_SIGN_ENDPOINT=x` set. Expected after implementing: exit 1, `sign.sh: missing WALLPAPERS_SIGN_ACCOUNT, …`.
- [ ] **Step 2: Implement** `sign.sh`, the `release.sh` call and the target. `make lint` must accept the new script.
- [ ] **Step 3: Run `make win-release`** with no variables. Expected: `…, unsigned`; the zip and `.sha256` as before.
- [ ] **Step 4: README Releasing:** a Windows item: unsigned by default and what that means (SmartScreen *Run anyway*; Smart App Control may refuse it by hash, no override); to sign, create an Azure Trusted Signing account and certificate profile, then `gh secret set` the six `WALLPAPERS_SIGN_*` names; CI then signs tagged releases and the release notes say so. Never any value in the repo.
- [ ] **Step 5: Commit** `Windows W4: optional Azure Trusted Signing in win-release (unsigned by default)`.

---

### Task 7: CI: the `win` job tests the zip that ships

**Files:**
- Modify: `.github/workflows/ci.yml`, `windows/run.sh`, `Makefile` (`win-test-zip`), `README.md` (Releasing item 5), `windows/Wallpapers/SelfTest.cs` and `Program.cs` (only if Step 4 needs `--no-desktop`)

**Interfaces:**
- *Changed from the design* (§10.25.15 had the `win` job run `win-release` again): the `ci` job keeps building and uploading the zip (Linux, as today); the `win` job tests **that zip**, so what is tested is what ships and `build.sh`/`release.sh` need no second toolchain. It runs on `windows-2025`, `needs: ci`, `if: github.event_name != 'schedule'`, `timeout-minutes: 15`: `actions/download-artifact` (`wallpapers-windows` → `dist`), `choco install make -y --no-progress` (drop it if `make --version` already works on the image), a step that installs the WebView2 Evergreen runtime when `HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}` is missing, then `make win-test-zip`, and `actions/upload-artifact` of `selftest.txt` and the log (`wallpapers-windows-selftest`, `if: always()`).
- `win-test-zip: ## Self-test the app inside dist/wallpapers-windows-<version>.zip (the zip CI ships; needs Windows: Git Bash or WSL)` → unzip into `dist/win-zip/` (`unzip -q`, or PowerShell `Expand-Archive` when `unzip` is missing), then `DIST=dist/win-zip/Wallpapers windows/run.sh test`.
- `run.sh`: `DIST` (default `dist/win`); on Git Bash, `LOCALAPPDATA` comes from the environment and `cygpath -u`/`-w` replace `wslpath`; `cmd.exe` and `powershell.exe` are found on `PATH` when `/mnt/c` is absent; `BUILD` is ignored when `DIST` is set.
- `release`: `needs: [ci, android, mac, win]`; its `if` unchanged (it needs `ci` and `android`); the Windows zip is attached only when `needs.win.result == 'success'`, otherwise `::warning::the Windows self-test ${{ needs.win.result }}; releasing without the Windows app` (non-blocking like the Mac's).
- **Only if Step 4 shows the runner has no desktop layer** (`FAIL layer`): `--selftest --no-desktop` runs the checks with `Desktop.UseFakeDisplaysForTest(N.Monitors())` (the real monitors as a fake layout, surfaces in ordinary windows); `layer` and `shell restart (simulated)` print `SKIP … no desktop`; `coverage` and `pointer classify` already SKIP there. The job then passes `WIN_ARGS=--no-desktop`.

- [ ] **Step 1: Implement** the `run.sh` portability, the target and the workflow.
- [ ] **Step 2: Run `make win-test-zip` from WSL** (after `make win-release`). Expected: the same report as `make win-test`, all PASS, from `dist/win-zip/Wallpapers/Wallpapers.exe` (the log's `web=` line says so).
- [ ] **Step 3: Run `make ci`.** Expected: green (`lint` covers the workflow's YAML and the scripts).
- [ ] **Step 4: Run the workflow on the branch:** `gh workflow run ci.yml --ref windows` and `gh run watch`. Expected: the `win` job's report, all PASS or SKIP, under 10 minutes; the `wallpapers-windows-selftest` artifact holds `selftest.txt`. If `layer` FAILs: implement `--no-desktop` as in Interfaces, run again. If WebView2 is missing: the runtime step installed it (the log says so). Record the runner's session facts (desktop or not, runtime version, time) for the SPEC.
- [ ] **Step 5: README Releasing item 5:** CI now also runs the Windows self-test against the zip on a Windows runner; a release that fails it goes out without the Windows app and says so.
- [ ] **Step 6: Commit** `Windows W4: CI win job self-tests the shipped zip on windows-2025; release attaches it when it passed`.

---

### Task 8: Docs, the by-hand list and the first release

**Files:**
- Modify: `README.md` (Install, Update, Uninstall and Start with Windows in the Windows section), `SPEC.md` (§10.25 status line; the intro's host list item 5; §10.25.4's file layout, which the W4 roadmap line calls §10.25.3; §10.25.13 *As built*; §10.25.15 `win-release` row and CI paragraph; §10.25.16 W4 *As built*; §10.25.20 design calls), `docs/superpowers/handoffs/2026-11-02-windows-handoff.md`, memory

- [ ] **Step 1: README Windows section.** Replace "(Windows 11, early: no installer yet)" with: download, check the `.sha256`, unzip, run `Wallpapers.exe`, choose **Install** (where it goes, Start menu, Settings → Apps, starts with Windows) or **Just Run**; **Update:** run a newer download, it offers to update in place; **Start with Windows** in the tray; **Uninstall** from Settings → Apps or About (asks about settings; `%LOCALAPPDATA%\Wallpapers` holds them); the signing paragraph from Task 6 (unsigned: SmartScreen, Smart App Control); the Windows app never checks for updates itself (the About dialog's *Project Page* opens the releases). Keep the menu list in SPEC §10.25.10's order.
- [ ] **Step 2: SPEC.** Status: "W0 passed; W1–W3 built; **W4 built** (date); W5 next"; intro item 5: "built; first release vX.Y.Z"; the layout gains `Install.cs`, `ShellLink.cs`, `Core/Install*.cs`, `sign.sh`; §10.25.13 *As built*: the offer and its memory, staged copies, stage 2 from `%TEMP%`, `Wallpapers.scr` not created until W5 (an `.scr` that doesn't handle `/s` would start the app from Windows' dialog), the uninstall saver hook, no online update check; §10.25.15: the `win` job as built (tests the zip; runner facts from Task 7), `win-install`/`win-uninstall`/`win-sign`/`win-test-zip`; §10.25.20: "the `win` job tests the Linux-built zip rather than building again; a failed Windows self-test drops the Windows zip from a release with a warning".
- [ ] **Step 3: Run `make ci`, `make win-unit`, `make win-test`, `make win-release`.** Expected: all green; `win-unit` reports the new tests (about 25 more than W3's 166).
- [ ] **Step 4: Still to check by hand (owner, at the console, then over RDP).** Write the results into §10.25.16's W4 *As built*.
  1. *Download path.* Copy `dist/wallpapers-windows-<version>.zip` to Downloads in Windows, unzip, run `Wallpapers.exe`: SmartScreen (or Smart App Control) says what the README says; the Install dialog; *Install*: the app runs installed, the Start menu has *Wallpapers*, Settings → Apps lists *Wallpapers <version>* with the icon and the size.
  2. *Start with Windows.* Sign out and in (or restart): the wallpaper is back within ~10 s of the desktop; `make win-log` shows the start and, if Explorer was late, the layer retry. Untick it in the tray, sign out and in: it doesn't start; tick it back.
  3. *Start menu while running.* Click *Wallpapers* in the Start menu: Settings opens, no second app.
  4. *Update.* Bump `version` in `web/manifest.json` locally, `make win-release`, unzip elsewhere, run it: the Update dialog names both versions; *Update*: the app comes back with the new version in About, settings and the current wallpaper intact, *Start with Windows* as it was. Run the older unzipped exe: no dialog, Settings opens. Put the manifest version back.
  5. *Just Run.* `make win-uninstall`, run the unzipped exe, *Just Run*: it runs from Downloads; start it again: no dialog; tray shows *Install…*; install from there.
  6. *Uninstall from Settings → Apps* while the app runs: the dialog, *Keep My Settings*: everything goes, settings stay; reinstall and uninstall with *Delete My Settings Too*: `%LOCALAPPDATA%\Wallpapers` is gone too. `%TEMP%` has no `Wallpapers-uninstall-*.exe` left.
  7. *Smart App Control.* Note whether the unsigned release exe runs on this PC (the hash is new) and keep the Code Integrity event id if it is refused, for the signing decision.
  8. *The first release.* Bump `version` (0.11.0), commit, `git tag v0.11.0 && git push --tags`; CI's `win` job passes; the release carries `wallpapers-windows-0.11.0.zip` and `.sha256`; download it on the console PC and repeat item 1 from the real release.
- [ ] **Step 5: Commit** `Windows W4: docs and the by-hand checklist`, and push when the owner says so.

---

## Order and checkpoints

Task 1 → 2 (Core, no Windows needed) → 3 (**owner checkpoint:** the Install dialog and a real install, removed again) → 4 → 5 → 6 → 7 (**owner checkpoint:** the first `win` job run on the branch) → 8 (owner by-hand pass, then the release). Tasks 6 and 7 don't depend on 3–5 and can run earlier. Every task ends green on `make win-unit`; 3–5 and 7 on `make win-test` too.

## Decision for the owner

1. **Signing (SPEC Open questions; §10.25.17).** The plan works unsigned and signs by itself once six `WALLPAPERS_SIGN_*` secrets exist.
   - **Recommended: ship v0.11.0 unsigned now, set up Azure Trusted Signing before telling anyone else about it.** Unsigned: SmartScreen's *Run anyway* on every other PC, and a Smart App Control PC (the owner's) can refuse the release exe by hash with no override; `make win-install` builds carry a fresh hash each time, so the owner's own machine is served by rebuilding. Signed (about USD 10 a month, an Azure account and an identity validation): SAC and SmartScreen both pass, and `winget` becomes possible later.
   - **Alternative:** turn Smart App Control off on the owner's PC (irreversible without a reset) and stay unsigned.
2. **An online update check.** SPEC §10.25.13 has none: an update is a newer download run by hand, which this plan builds. *Recommended:* keep it so (no network, no telemetry) and let the About dialog's *Project Page* button open the releases page in the browser; a weekly check of GitHub's releases API would be a new declared network use and a W6+ item if wanted.
3. **A failed Windows self-test on the hosted runner drops the Windows zip from that release**, with a warning, as a failed Mac build drops the Mac app. The alternative is to ship the zip regardless and treat the `win` job as advice. *Recommended:* gate, since the first release is the point of W4; if the runner turns out flaky, switch to advice in the workflow (one `if`).
