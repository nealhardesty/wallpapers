using System.Diagnostics;
using System.Windows.Forms;
using Microsoft.Win32;

namespace Wallpapers;

/// The per-user install (SPEC §10.25.13): copy into the layout's root, the Uninstall entry, the Start menu
/// shortcut, Start with Windows; and the offer to install or update. The names and values come from Core.
sealed class Install(InstallLayout layout, Action<string> log)
{
    static readonly TimeSpan QuitWait = TimeSpan.FromSeconds(15);
    const string StillRunning = "Wallpapers is still running, or something has Wallpapers.exe open; quit it and try again";

    public InstallLayout Layout => layout;

    /// The installed exe's version (its ProductVersion, build.sh's InformationalVersion), or null when none is installed.
    public AppVersion? InstalledVersion() => VersionOf(layout.Exe);

    static AppVersion? VersionOf(string exe) =>
        File.Exists(exe) ? AppVersion.Parse(FileVersionInfo.GetVersionInfo(exe).ProductVersion) : null;

    /// This process runs from the install folder.
    public bool InstalledHere => layout.IsInstalledAt(Path.GetFullPath(AppContext.BaseDirectory));

    /// Copies this exe (as Wallpapers.exe, whatever the download was renamed to, and again as Wallpapers.scr)
    /// and sourceDir's web\ into the root: staged beside the old ones and swapped last, the old ones moved back
    /// on any failure, so a failed Apply leaves the old install whole. Then the Uninstall entry and the shortcut;
    /// `fresh` also turns on Start with Windows (an update leaves the person's choice). Returns why it failed, or null; never throws.
    /// A failure after it quit the running app starts the old installed copy again (RestartedOld).
    public string? Apply(string sourceDir, bool fresh)
    {
        quitTheRunningApp = false;
        RestartedOld = false;
        string? why;
        try { why = ApplyOrThrow(sourceDir, fresh); }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or COMException or System.Security.SecurityException)
        {
            log($"install: {e.GetType().Name}: {e.Message}");
            why = $"couldn't finish installing: {e.Message}";
        }
        if (why != null && quitTheRunningApp && File.Exists(layout.Exe))
            try
            {
                Process.Start(new ProcessStartInfo(layout.Exe) { WorkingDirectory = layout.Root, UseShellExecute = false });
                RestartedOld = true;
                log("install: restarted the old copy");
            }
            catch (Exception e) when (e is System.ComponentModel.Win32Exception or IOException) { log($"install: couldn't restart the old copy: {e.Message}"); }
        return why;
    }

    bool quitTheRunningApp;

    /// The last Apply failed after quitting the running app, and started the old installed copy again.
    public bool RestartedOld { get; private set; }

    string? ApplyOrThrow(string sourceDir, bool fresh)
    {
        var sourceExe = Environment.ProcessPath ?? Path.Combine(sourceDir, "Wallpapers.exe");
        var sourceWeb = Path.Combine(sourceDir, "web");
        if (!Directory.Exists(sourceWeb)) return $"there is no web folder beside {sourceExe}";
        var versionText = FileVersionInfo.GetVersionInfo(sourceExe).ProductVersion;
        if (AppVersion.Parse(versionText) is not { } version) return $"can't read the version of {sourceExe}";

        // Run from the install folder itself (--install from the installed exe): nothing to copy, and its own
        // image is the lock, so no waiting either.
        if (layout.IsInstalledAt(Path.GetFullPath(sourceDir)))
        {
            log("install: already in place, copy skipped");
            EnsureSaver();
        }
        else
        {
            // Still running at the deadline: it never quit, so there's nothing to start again. Quit, but the exe
            // stayed locked: the failure starts the old copy again, as after any other failure past this point.
            var free = QuitAndWait("install", out var asked);
            quitTheRunningApp = asked && !SingleInstance.IsRunning("run");
            if (!free) return StillRunning;
            if (CopyAndSwap(sourceExe, sourceWeb) is { } why) return why;
        }

        var sizeKb = (int)(new DirectoryInfo(layout.Root).EnumerateFiles("*", SearchOption.AllDirectories).Sum(f => f.Length) / 1024);
        using (var key = Registry.CurrentUser.CreateSubKey(layout.UninstallKey))
            foreach (var (name, value) in UninstallEntry.Values(layout, version, sizeKb, DateTime.Now.ToString("yyyyMMdd"), App.Homepage))
                key.SetValue(name, value, value is int ? RegistryValueKind.DWord : RegistryValueKind.String);
        ShellLink.Create(StartMenuShortcut.Spec(layout));
        if (fresh) SetStartWithWindows(true);
        log($"install: {layout.Root} ({(fresh ? "fresh" : "update")}) {versionText} ({sizeKb / 1024} MB)");
        return null;
    }

    /// The running copy holds the exe: a run-flavor app that isn't this process is asked to quit, then we wait
    /// for its mutex and for layout.Exe to come free, up to 15 s in all (the test layout's exe is never the one
    /// running, so only the lock matters there). False when it's still running at the deadline; `asked` says
    /// whether a running app was asked to quit. Install and uninstall's stage 2 both wait here.
    bool QuitAndWait(string what, out bool asked)
    {
        asked = false;
        var deadline = DateTime.UtcNow + QuitWait;
        if (layout.Flavor == "run" && !SingleInstance.Holds && SingleInstance.IsRunning("run"))
        {
            asked = true;
            log($"{what}: asking the running app to quit ({(SingleInstance.Send("run", "quit") ? "sent" : "it didn't answer")})");
            while (SingleInstance.IsRunning("run"))
            {
                if (DateTime.UtcNow > deadline) return false;
                Thread.Sleep(200);
            }
        }
        while (!CanOpenAlone(layout.Exe))
        {
            if (DateTime.UtcNow > deadline) return false;
            Thread.Sleep(200);
        }
        return true;
    }

    /// Stages exe.new, scr.new (the same exe again, as the screen saver) and web.new, moves the old ones to .old
    /// (exe, then .scr, then web), the new ones in; on any failure puts the old ones back. Returns why it
    /// failed, or null.
    string? CopyAndSwap(string sourceExe, string sourceWeb)
    {
        string newExe = layout.Exe + ".new", oldExe = layout.Exe + ".old", newScr = layout.Saver + ".new", oldScr = layout.Saver + ".old",
            newWeb = layout.Web + ".new", oldWeb = layout.Web + ".old";
        // A running saver can be renamed but not replaced cleanly: it would keep running from .old.
        if (!CanOpenAlone(layout.Saver)) return ScrInUse;
        try
        {
            Directory.CreateDirectory(layout.Root);
            foreach (var stale in new[] { newExe, oldExe, newScr, oldScr, newWeb, oldWeb }) Delete(stale);
            File.Copy(sourceExe, newExe);
            File.Copy(sourceExe, newScr);
            CopyFolder(sourceWeb, newWeb);
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            Tidy(newExe, newScr, newWeb);
            return $"couldn't copy: {e.Message}";
        }

        bool exeAside = false, scrAside = false, webAside = false, exeIn = false, scrIn = false;
        try
        {
            if (File.Exists(layout.Exe)) { File.Move(layout.Exe, oldExe); exeAside = true; }
            if (File.Exists(layout.Saver)) { File.Move(layout.Saver, oldScr); scrAside = true; }
            if (Directory.Exists(layout.Web)) { Directory.Move(layout.Web, oldWeb); webAside = true; }
            File.Move(newExe, layout.Exe);
            exeIn = true;
            File.Move(newScr, layout.Saver);
            scrIn = true;
            Directory.Move(newWeb, layout.Web);
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            log($"install: swap failed ({e.Message}); putting the old install back");
            Undo("the new exe", () => { if (exeIn) File.Delete(layout.Exe); });
            Undo("the new screen saver", () => { if (scrIn) File.Delete(layout.Saver); });
            Undo("the old exe", () => { if (exeAside) File.Move(oldExe, layout.Exe); });
            Undo("the old screen saver", () => { if (scrAside) File.Move(oldScr, layout.Saver); });
            Undo("the old web folder", () => { if (webAside) Directory.Move(oldWeb, layout.Web); });
            Tidy(newExe, newScr, newWeb);
            return $"couldn't replace the installed files: {e.Message}";
        }
        Tidy(oldExe, oldScr, oldWeb);
        return null;
    }

    const string ScrInUse = "Wallpapers.scr is in use (the screen saver may be running); try again when it has stopped";

    /// --install from the install folder skips the copy; a W4 install has no .scr, so make it from the exe here.
    /// Best effort: a failure is logged, and the install stands.
    void EnsureSaver()
    {
        try
        {
            if (File.Exists(layout.Saver) && new FileInfo(layout.Saver).Length == new FileInfo(layout.Exe).Length) return;
            File.Copy(layout.Exe, layout.Saver, overwrite: true);
            log($"install: made {layout.Saver}");
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException) { log($"install: couldn't make {layout.Saver}: {e.Message}"); }
    }

    static void Delete(string path)
    {
        if (File.Exists(path)) File.Delete(path);
        else if (Directory.Exists(path)) Directory.Delete(path, true);
    }

    /// Best effort: what's left is logged, and the next Apply deletes it first.
    void Tidy(params string[] paths)
    {
        foreach (var path in paths)
            try { Delete(path); }
            catch (Exception e) when (e is IOException or UnauthorizedAccessException) { log($"install: left {path}: {e.Message}"); }
    }

    void Undo(string what, Action step)
    {
        try { step(); }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException) { log($"install: couldn't put back {what}: {e.Message}"); }
    }

    /// No file there, or nobody else has it open (a running exe can't be opened for writing).
    static bool CanOpenAlone(string path)
    {
        if (!File.Exists(path)) return true;
        try { using var _ = new FileStream(path, FileMode.Open, FileAccess.ReadWrite, FileShare.None); return true; }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException) { return false; }
    }

    static void CopyFolder(string from, string to)
    {
        Directory.CreateDirectory(to);
        foreach (var dir in Directory.EnumerateDirectories(from, "*", SearchOption.AllDirectories))
            Directory.CreateDirectory(Path.Combine(to, Path.GetRelativePath(from, dir)));
        foreach (var file in Directory.EnumerateFiles(from, "*", SearchOption.AllDirectories))
            File.Copy(file, Path.Combine(to, Path.GetRelativePath(from, file)));
    }

    public bool StartsWithWindows()
    {
        using var key = Registry.CurrentUser.OpenSubKey(RunKey.Path);
        return key?.GetValue(layout.RunValueName) != null;
    }

    public void SetStartWithWindows(bool on)
    {
        using var key = Registry.CurrentUser.CreateSubKey(RunKey.Path);
        var (name, data) = RunKey.Spec(layout);
        if (on) key.SetValue(name, data, RegistryValueKind.String);
        else key.DeleteValue(name, throwOnMissingValue: false);
        log($"install: start with windows {(on ? "on" : "off")}");
    }

    /// Whether to ask, logged with the reason either way.
    public Offer OfferToShow(AppSettings settings, bool justRun)
    {
        if (AppVersion.Parse(App.Version) is not { } running)
        {
            log("install: offer None (unknown version)");
            return Offer.None;
        }
        var here = InstalledHere;
        var installed = InstalledVersion();
        var declined = !settings.OfferInstall;
        var offer = InstallOffer.Decide(running, here, installed, declined, justRun);
        var reason = offer switch
        {
            Offer.Install => "not installed",
            Offer.Update => $"installed {installed!.Display}+{installed.Stamp} is older",
            _ when justRun => "--just-run",
            _ when here => "running from the install folder",
            _ when installed == null => "declined before",
            _ when installed.CompareTo(running) == 0 => "same version",
            _ => $"installed {installed.Display}+{installed.Stamp} is newer",
        };
        log($"install: offer {offer} ({reason})");
        return offer;
    }

    /// Run from a zip without unzipping (Explorer's zip view copies only the exe to %TEMP%): no web\ beside it, so
    /// there's nothing to install or run. Says so; the caller exits without offering anything or saving settings.
    public static bool ShowUnzipFirst(Action<string> log)
    {
        if (Directory.Exists(Path.Combine(AppContext.BaseDirectory, "web"))) return false;
        log($"install: no web folder beside {AppContext.BaseDirectory.TrimEnd('\\')}; asked to unzip first");
        TaskDialog.ShowDialog(new TaskDialogPage
        {
            Caption = "Wallpapers",
            Heading = "Unzip the whole download first",
            Text = "Wallpapers.exe needs the web folder beside it. Unzip the whole download, then run Wallpapers.exe from the unzipped folder.",
            AllowCancel = true,
            Icon = TaskDialogIcon.Warning,
        }, TaskDialogStartupLocation.CenterScreen);
        return true;
    }

    /// The Install or Update dialog (Install over an installed copy, from the tray, is Replace). Returns true when
    /// the caller should exit: it installed and started the installed exe (with `start: false` the caller starts
    /// it, after its own cleanup), or it failed and the running copy keeps running (it was never quit, or it was
    /// started again). False to carry on running from here. Just Run is remembered through `save` (by default
    /// settings.json in the data folder).
    public bool ShowOffer(Offer offer, AppSettings settings, Action<AppSettings>? save = null, bool start = true)
    {
        var running = AppVersion.Parse(App.Version)?.Display ?? App.Version;
        var update = offer == Offer.Update;
        var installed = InstalledVersion();
        var replace = !update && installed != null;
        var go = new TaskDialogButton(update ? "&Update" : replace ? "&Replace" : "&Install");
        var justRun = new TaskDialogButton("&Just Run");
        var page = new TaskDialogPage
        {
            Caption = layout.DisplayName,
            Heading = update ? $"Update {layout.DisplayName} {installed?.Display} → {running}?"
                : replace ? $"Replace {layout.DisplayName} {installed!.Display} with {running}?"
                : $"Install {layout.DisplayName} {running}?",
            Text = update ? $"Replaces the copy in {layout.Root} and restarts it. Your settings stay as they are."
                : replace ? $"Replaces the copy in {layout.Root}. Your settings stay as they are."
                : $"Copies it to {layout.Root}. It starts with Windows and shows in Settings → Apps.",
            Buttons = { go, justRun },
            DefaultButton = go,
            AllowCancel = true,
            Icon = TaskDialogIcon.Information,
        };
        var answer = TaskDialog.ShowDialog(page, TaskDialogStartupLocation.CenterScreen);
        if (answer == justRun)
        {
            log("install: declined (just run)");
            var declined = settings with { OfferInstall = false };
            if (save != null) save(declined);
            else
                try { declined.Save(Path.Combine(layout.DataFolder, "settings.json")); }
                catch (Exception e) when (e is IOException or UnauthorizedAccessException) { log($"install: couldn't save the choice: {e.Message}"); }
            return false;
        }
        if (answer != go) { log("install: offer closed (asked again next time)"); return false; }

        Cursor.Current = Cursors.WaitCursor;
        var why = Apply(AppContext.BaseDirectory, fresh: !update && !replace);
        Cursor.Current = Cursors.Default;
        if (why != null)
        {
            // Another copy holds the mutex (it never quit), or the old one was started again: this one bows out
            // rather than race it for the mutex.
            var keepsRunning = RestartedOld || (!SingleInstance.Holds && SingleInstance.IsRunning("run"));
            log($"install: failed: {why}{(keepsRunning ? "; the installed copy keeps running" : "")}");
            TaskDialog.ShowDialog(new TaskDialogPage
            {
                Caption = layout.DisplayName,
                Heading = update ? "Couldn't update" : "Couldn't install",
                Text = $"{why}.\n\n{(keepsRunning ? $"The installed copy in {layout.Root} keeps running." : "Wallpapers runs from here this time.")}",
                Icon = TaskDialogIcon.Warning,
            }, TaskDialogStartupLocation.CenterScreen);
            return keepsRunning;
        }
        return !start || Start();
    }

    /// Starts the installed exe from its own folder. A process holding the single-instance mutex lets go
    /// first, so the installed app becomes the first one rather than a second launch. False when it couldn't.
    public bool Start()
    {
        SingleInstance.Release();
        try { Process.Start(new ProcessStartInfo(layout.Exe) { WorkingDirectory = layout.Root, UseShellExecute = false }); }
        catch (Exception e) when (e is System.ComponentModel.Win32Exception or IOException)
        {
            log($"install: couldn't start {layout.Exe}: {e.Message}");
            return false;
        }
        log($"install: started {layout.Exe}");
        return true;
    }

    // Uninstall (--uninstall): stage 1 copies this exe to %TEMP% and starts the copy as stage 2, which can delete
    // the install folder because it doesn't run from there, and deletes itself on the way out.
    const string StageTwoPrefix = "Wallpapers-uninstall-";
    static string UninstallLog => Path.Combine(Path.GetTempPath(), "Wallpapers-uninstall.log");

    /// Stage 1: starts a %TEMP% copy of this exe with --uninstall-stage2 "<root>" (and the settings choice when
    /// it's known; otherwise stage 2 asks). The caller exits, or carries on until stage 2 asks it to quit.
    /// Returns why it couldn't start, or null.
    public string? StartUninstall(bool? keepSettings)
    {
        var temp = Path.GetTempPath();
        foreach (var stale in Directory.EnumerateFiles(temp, StageTwoPrefix + "*.exe"))
            try { File.Delete(stale); }
            catch (Exception e) when (e is IOException or UnauthorizedAccessException) { }   // one still running: the next time
        var copy = Path.Combine(temp, $"{StageTwoPrefix}{DateTime.Now:yyyyMMddHHmmss}.exe");
        // Quoted, and never with a trailing backslash: \" would escape the closing quote.
        var args = $"--uninstall-stage2 \"{layout.Root.TrimEnd('\\')}\"" + keepSettings switch { true => " --keep-settings", false => " --delete-settings", null => "" };
        try
        {
            File.Copy(Environment.ProcessPath ?? Path.Combine(AppContext.BaseDirectory, "Wallpapers.exe"), copy, overwrite: true);
            N.AllowSetForegroundWindow(N.ASFW_ANY);   // its question comes up in front, as ours would
            Process.Start(new ProcessStartInfo(copy, args) { WorkingDirectory = temp, UseShellExecute = false });
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or System.ComponentModel.Win32Exception)
        {
            log($"uninstall: couldn't start {copy}: {e.Message}");
            return $"couldn't start the uninstaller: {e.Message}";
        }
        log($"uninstall: started {copy} {args}");
        return null;
    }

    /// Stage 2, from %TEMP%: never takes the app's mutex or writes its log (it may delete that folder). Asks
    /// unless told, quits the running app, removes the install, logs to %TEMP%\Wallpapers-uninstall.log, and
    /// deletes its own copy. 0 done, 1 not an install folder, 2 cancelled.
    public static int Stage2(InstallArgs args)
    {
        static void Say(string line)
        {
            try { File.AppendAllText(UninstallLog, $"{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff} {line}\r\n"); }
            catch (Exception e) when (e is IOException or UnauthorizedAccessException) { }
        }
        Say($"uninstall: Wallpapers {App.Version} for {args.Root}");
        // Only a folder we install to: never an arbitrary path from the command line.
        var layout = new[] { "run", "test" }.Select(App.LayoutFor).FirstOrDefault(l => l != null && args.Root != null && l.IsInstalledAt(args.Root));
        if (layout == null)
        {
            Say("uninstall: that isn't an install folder; nothing removed");
            DeleteSelf(Say);
            return 1;
        }
        ApplicationConfiguration.Initialize();
        var keep = args.KeepSettings ?? Ask(layout);
        if (keep == null)
        {
            Say("uninstall: cancelled");
            DeleteSelf(Say);
            return 2;
        }
        var installer = new Install(layout, Say);
        if (!installer.QuitAndWait("uninstall", out _)) Say("uninstall: the app is still running after 15 s; removing what can be removed");
        var left = installer.RemovePlan(keep.Value);
        if (args.KeepSettings == null) ShowResult(layout, keep.Value, left);
        DeleteSelf(Say);
        return 0;
    }

    /// In-process removal, for the self-test's test layout (the running exe isn't in that root): the same plan,
    /// no stage 2. Returns what couldn't be removed.
    public IReadOnlyList<string> Remove(bool keepSettings) => RemovePlan(keepSettings);

    static bool? Ask(InstallLayout layout)
    {
        var keep = new TaskDialogButton("&Keep My Settings");
        var delete = new TaskDialogButton("&Delete My Settings Too");
        var answer = TaskDialog.ShowDialog(new TaskDialogPage
        {
            Caption = layout.DisplayName,
            Heading = $"Uninstall {layout.DisplayName}?",
            Text = $"Removes {layout.Root}, its Start menu shortcut and Start with Windows.\n\nYour settings are in {layout.DataFolder}: keep them for next time, or delete them too.",
            Buttons = { keep, delete, TaskDialogButton.Cancel },
            DefaultButton = keep,
            AllowCancel = true,
            Icon = TaskDialogIcon.Information,
        }, TaskDialogStartupLocation.CenterScreen);
        return answer == keep ? true : answer == delete ? false : null;
    }

    static void ShowResult(InstallLayout layout, bool keep, IReadOnlyList<string> left) =>
        TaskDialog.ShowDialog(new TaskDialogPage
        {
            Caption = layout.DisplayName,
            Heading = left.Count == 0 ? $"{layout.DisplayName} is uninstalled" : $"{layout.DisplayName} is uninstalled, except for:",
            Text = left.Count == 0
                ? keep ? $"Your settings stay in {layout.DataFolder} for next time." : "Your settings are gone too."
                : $"{string.Join("\n", left)}\n\nSomething still had them open. Delete them by hand; the details are in {UninstallLog}.",
            AllowCancel = true,
            Icon = left.Count == 0 ? TaskDialogIcon.Information : TaskDialogIcon.Warning,
        }, TaskDialogStartupLocation.CenterScreen);

    /// UninstallPlan's removals, each logged; one that fails is logged and returned, and the rest still run.
    List<string> RemovePlan(bool keepSettings)
    {
        var plan = UninstallPlan.For(layout, keepSettings);
        var left = new List<string>();
        RestoreSaver(left);
        Step(left, "run value", null, () =>
        {
            using var key = Registry.CurrentUser.OpenSubKey(plan.RunValue.Key, writable: true);
            if (key?.GetValue(plan.RunValue.Name) == null) return false;
            key.DeleteValue(plan.RunValue.Name);
            return true;
        });
        Step(left, "uninstall key", null, () =>
        {
            using (var key = Registry.CurrentUser.OpenSubKey(plan.UninstallKey)) if (key == null) return false;
            Registry.CurrentUser.DeleteSubKeyTree(plan.UninstallKey);
            return true;
        });
        foreach (var file in plan.Files)
            Step(left, file == layout.Shortcut ? "shortcut" : "file", file == layout.Shortcut ? null : file, () =>
            {
                if (!File.Exists(file)) return false;
                File.Delete(file);
                return true;
            });
        foreach (var folder in plan.Folders)
            Step(left, "folder", folder, () =>
            {
                if (!Directory.Exists(folder)) return false;
                DeleteFolder(folder);
                return true;
            });
        if (keepSettings) log($"uninstall: settings kept in {layout.DataFolder}");
        return left;
    }

    void Step(List<string> left, string what, string? path, Func<bool> remove)
    {
        var detail = path == null ? "" : " " + path;
        try { log($"uninstall: {what} {(remove() ? "removed" : "not there")}{detail}"); }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or System.Security.SecurityException)
        {
            log($"uninstall: {what} not removed{detail}: {e.Message}");
            left.Add(path ?? what);
        }
    }

    /// A process that just quit (the app's web view helpers, with the data folder) can hold files for a moment.
    static void DeleteFolder(string folder)
    {
        for (var attempt = 1; ; attempt++)
            try { Directory.Delete(folder, true); return; }
            catch (Exception e) when (attempt < 10 && e is IOException or UnauthorizedAccessException) { Thread.Sleep(300); }
    }

    /// Selecting our screen saver remembered the one before (settings.json's saver.before); while ours is still
    /// selected, uninstall puts that back. A failure is logged and named in `left`; the rest still runs.
    void RestoreSaver(List<string> left)
    {
        try
        {
            var before = (AppSettings.Load(Path.Combine(layout.DataFolder, "settings.json")).Saver ?? new()).Before;
            new SaverSelection(layout.Flavor, log).RestoreIfOurs(before, layout.Saver);
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or System.Security.SecurityException)
        {
            log($"uninstall: screen saver not restored: {e.Message}");
            left.Add("screen saver");
        }
    }

    /// Stage 2's last step: a hidden cmd deletes this copy once it has exited. Only a copy stage 1 made.
    static void DeleteSelf(Action<string> say)
    {
        var self = Environment.ProcessPath;
        if (self == null || !Path.GetFileName(self).StartsWith(StageTwoPrefix, StringComparison.OrdinalIgnoreCase)) return;
        try
        {
            Process.Start(new ProcessStartInfo(Path.Combine(Environment.SystemDirectory, "cmd.exe"), $"/c ping -n 3 localhost >nul & del \"{self}\"")
                { CreateNoWindow = true, UseShellExecute = false, WorkingDirectory = Path.GetTempPath() });
            say($"uninstall: done; {Path.GetFileName(self)} deletes itself");
        }
        catch (System.ComponentModel.Win32Exception e) { say($"uninstall: couldn't delete {self}: {e.Message}"); }
    }
}
