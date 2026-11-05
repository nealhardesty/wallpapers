using System.Diagnostics;
using System.Windows.Forms;
using Microsoft.Win32;

namespace Wallpapers;

/// The per-user install (SPEC §10.25.13): copy into the layout's root, the Uninstall entry, the Start menu
/// shortcut, Start with Windows; and the offer to install or update. The names and values come from Core.
sealed class Install(InstallLayout layout, Action<string> log)
{
    static readonly TimeSpan QuitWait = TimeSpan.FromSeconds(15);
    const string StillRunning = "Wallpapers is still running; quit it from the tray and try again";

    public InstallLayout Layout => layout;

    /// The installed exe's version (its ProductVersion, build.sh's InformationalVersion), or null when none is installed.
    public AppVersion? InstalledVersion() => VersionOf(layout.Exe);

    static AppVersion? VersionOf(string exe) =>
        File.Exists(exe) ? AppVersion.Parse(FileVersionInfo.GetVersionInfo(exe).ProductVersion) : null;

    /// This process runs from the install folder.
    public bool InstalledHere => layout.IsInstalledAt(Path.GetFullPath(AppContext.BaseDirectory));

    /// Copies this exe (as Wallpapers.exe, whatever the download was renamed to) and sourceDir's web\ into the
    /// root: staged beside the old ones and swapped last, the old ones moved back on any failure, so a failed
    /// Apply leaves the old install whole. Then the Uninstall entry and the shortcut; `fresh` also turns on
    /// Start with Windows (an update leaves the person's choice). Returns why it failed, or null; never throws.
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
        if (layout.IsInstalledAt(Path.GetFullPath(sourceDir))) log("install: already in place, copy skipped");
        else
        {
            // The running copy holds the exe: a run-flavor app that isn't us is asked to quit first (the test
            // layout's exe is never the one running, so only the lock matters there).
            var deadline = DateTime.UtcNow + QuitWait;
            if (layout.Flavor == "run" && !SingleInstance.Holds && SingleInstance.IsRunning("run"))
            {
                quitTheRunningApp = true;
                log($"install: asking the running app to quit ({(SingleInstance.Send("run", "quit") ? "sent" : "it didn't answer")})");
                while (SingleInstance.IsRunning("run"))
                {
                    if (DateTime.UtcNow > deadline) return StillRunning;
                    Thread.Sleep(200);
                }
            }
            while (!CanOpenAlone(layout.Exe))
            {
                if (DateTime.UtcNow > deadline) return StillRunning;
                Thread.Sleep(200);
            }
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

    /// Stages exe.new and web.new, moves the old ones to .old, the new ones in; on any failure puts the old ones
    /// back. Returns why it failed, or null.
    string? CopyAndSwap(string sourceExe, string sourceWeb)
    {
        string newExe = layout.Exe + ".new", oldExe = layout.Exe + ".old", newWeb = layout.Web + ".new", oldWeb = layout.Web + ".old";
        try
        {
            Directory.CreateDirectory(layout.Root);
            foreach (var stale in new[] { newExe, oldExe, newWeb, oldWeb }) Delete(stale);
            File.Copy(sourceExe, newExe);
            CopyFolder(sourceWeb, newWeb);
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            Tidy(newExe, newWeb);
            return $"couldn't copy: {e.Message}";
        }

        bool exeAside = false, webAside = false, exeIn = false;
        try
        {
            if (File.Exists(layout.Exe)) { File.Move(layout.Exe, oldExe); exeAside = true; }
            if (Directory.Exists(layout.Web)) { Directory.Move(layout.Web, oldWeb); webAside = true; }
            File.Move(newExe, layout.Exe);
            exeIn = true;
            Directory.Move(newWeb, layout.Web);
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            log($"install: swap failed ({e.Message}); putting the old install back");
            Undo("the new exe", () => { if (exeIn) File.Delete(layout.Exe); });
            Undo("the old exe", () => { if (exeAside) File.Move(oldExe, layout.Exe); });
            Undo("the old web folder", () => { if (webAside) Directory.Move(oldWeb, layout.Web); });
            Tidy(newExe, newWeb);
            return $"couldn't replace the installed files: {e.Message}";
        }
        Tidy(oldExe, oldWeb);
        return null;
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

    /// The Install or Update dialog. Returns true when it installed and started the installed exe (the caller
    /// exits; with `start: false` the caller starts it, after its own cleanup); false to carry on running from here.
    /// Just Run is remembered through `save` (by default settings.json in the data folder).
    public bool ShowOffer(Offer offer, AppSettings settings, Action<AppSettings>? save = null, bool start = true)
    {
        var running = AppVersion.Parse(App.Version)?.Display ?? App.Version;
        var update = offer == Offer.Update;
        var go = new TaskDialogButton(update ? "&Update" : "&Install");
        var justRun = new TaskDialogButton("&Just Run");
        var page = new TaskDialogPage
        {
            Caption = layout.DisplayName,
            Heading = update ? $"Update {layout.DisplayName} {InstalledVersion()?.Display} → {running}?" : $"Install {layout.DisplayName} {running}?",
            Text = update
                ? $"Replaces the copy in {layout.Root} and restarts it. Your settings stay as they are."
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
        var why = Apply(AppContext.BaseDirectory, fresh: !update);
        Cursor.Current = Cursors.Default;
        if (why != null)
        {
            log($"install: failed: {why}");
            TaskDialog.ShowDialog(new TaskDialogPage
            {
                Caption = layout.DisplayName,
                Heading = update ? "Couldn't update" : "Couldn't install",
                Text = $"{why}.\n\n{(RestartedOld ? $"The installed copy in {layout.Root} is running again." : "Wallpapers runs from here this time.")}",
                Icon = TaskDialogIcon.Warning,
            }, TaskDialogStartupLocation.CenterScreen);
            return false;
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
}
