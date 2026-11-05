using System.Diagnostics;
using System.Drawing;
using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;

namespace Wallpapers;

/// `Wallpapers.exe --selftest` (make win-test; SPEC §10.25.15): the real app against a throwaway data
/// folder (%LOCALAPPDATA%\Wallpapers-test, wiped first), checking what it promises. One line per
/// check, `PASS|FAIL|SKIP  <name>  <detail>`, to selftest.txt and the log; exit code 0 when nothing
/// failed. It shows a wallpaper behind your icons for about half a minute and never touches your
/// settings, Explorer or your own picture (which is repainted at the end).
sealed class SelfTest
{
    /// What --selftest exits with: set when the run ends.
    public static int ExitCode { get; private set; } = 1;
    const int TimeoutSeconds = 240;
    const string TestWallpaper = "snow";   // always animating (some wallpapers idle when still), and cheap

    readonly App app;
    readonly string report;
    int failed;
    bool finished;

    SelfTest(App app)
    {
        this.app = app;
        report = Path.Combine(app.Paths.Root, "selftest.txt");
        File.WriteAllText(report, "");
    }

    /// The test data folder, emptied before anything opens it. A browser process left over from an
    /// interrupted run may still hold files; those are logged and left.
    public static void Wipe(string root)
    {
        if (!Directory.Exists(root)) return;
        foreach (var entry in new DirectoryInfo(root).EnumerateFileSystemInfos())
        {
            try { if (entry is DirectoryInfo d) d.Delete(recursive: true); else entry.Delete(); }
            catch (Exception e) when (e is IOException or UnauthorizedAccessException) { Debug.WriteLine($"selftest wipe: {entry.Name}: {e.Message}"); }
        }
    }

    public static void Start(App app, bool badWebRoot)
    {
        var test = new SelfTest(app);
        // A hung check must still end the run with a report.
        var watchdog = new System.Windows.Forms.Timer { Interval = TimeoutSeconds * 1000 };
        watchdog.Tick += (_, _) => { watchdog.Stop(); test.Line("FAIL", "timeout", $"the self-test didn't finish in {TimeoutSeconds} s"); test.Finish(); };
        watchdog.Start();
        _ = test.RunGuardedAsync(badWebRoot);
    }

    async Task RunGuardedAsync(bool badWebRoot)
    {
        try { await (badWebRoot ? BadWebRootAsync() : RunAsync()); }
        catch (Exception e) { Line("FAIL", "self-test", $"threw {e.GetType().Name}: {e.Message}"); }
        Finish();
    }

    void Line(string result, string name, string detail = "")
    {
        if (finished) return;
        if (result == "FAIL") failed++;
        var line = $"{result,-4}  {name}{(detail.Length > 0 ? $"  {detail}" : "")}";
        File.AppendAllText(report, line + "\r\n");
        (result == "FAIL" ? (Action<string>)Log.Error : Log.Info)($"selftest: {line}");
    }

    void Check(string name, bool ok, string detail = "") => Line(ok ? "PASS" : "FAIL", name, detail);

    void Finish()
    {
        if (finished) return;
        File.AppendAllText(report, $"{(failed == 0 ? "all passed" : $"{failed} failed")}\r\n");
        finished = true;
        ExitCode = failed == 0 ? 0 : 1;
        app.Quit();
    }

    static Task Wait(int ms) => Task.Delay(ms);

    static async Task<bool> Until(int ms, Func<Task<bool>> condition, int everyMs = 200)
    {
        var clock = Stopwatch.StartNew();
        while (clock.ElapsedMilliseconds < ms)
        {
            if (await condition()) return true;
            await Wait(everyMs);
        }
        return await condition();
    }

    static async Task<T?> Js<T>(Surface s, string js)
    {
        try { return JsonSerializer.Deserialize<T>(await s.EvalAsync(js)); }
        catch (Exception e) when (e is JsonException or InvalidOperationException or COMException) { return default; }
    }

    // The stage is the newest iframe.stage (the player prepends each new one), same origin as the page.
    const string Stage = "document.querySelector('iframe.stage')?.contentWindow";
    static Task<int> FrameCount(Surface s) => Js<int>(s, $"(() => {{ const w = {Stage}; return w && w.WP && w.WP.host ? w.WP.host.frames.count : -1; }})()");
    static Task<bool> Ready(Surface s) => Js<bool>(s, "!!(window.WP && WP.player && WP.player.stage && WP.player.stage.ready)");

    static async Task<int> FramesOver(Surface s, int ms)
    {
        var before = await FrameCount(s);
        await Wait(ms);
        var after = await FrameCount(s);
        return before < 0 || after < 0 ? -1 : after - before;
    }

    async Task RunAsync()
    {
        var desktop = app.Desktop;
        var layer = app.Layer;
        Line("INFO", "self-test", $"Wallpapers {App.Version}, data {app.Paths.Root}");

        // Every monitor's surface, not just the first one made (found on two monitors).
        if (!await Until(30000, () => Task.FromResult((desktop.Surfaces.Count > 0 && !desktop.Building) || desktop.Problem != null)) || desktop.Surfaces.Count == 0)
        {
            Line("FAIL", "start", desktop.Problem ?? "no surfaces after 30 s");
            return;
        }
        var surfaces = desktop.Surfaces.ToList();
        // Coverage (§10.25.9) is right to hide a monitor under a maximized terminal, but the checks
        // below count frames: off from here on (the coverage check turns it on for itself), saying what
        // it saw. It last read before these surfaces were made: read now, and wait out a pending hide.
        desktop.ReadCoverageForTest();
        await Wait(CoverageGate.PauseAfterMs + 150);
        var covered = await desktop.CoverageOffForTest();
        Line("INFO", "coverage", covered.Count == 0 ? "no monitor covered; off except for the coverage check" : $"covered: {string.Join(", ", covered)}; off except for the coverage check");

        // 1. The layer, and every host in it, right under the icons; one surface per monitor.
        var shape = layer.Shape;
        var (parent, _) = DesktopShape.AttachTarget(shape);
        var hostsOk = surfaces.All(s => (long)N.GetParent(s.Host) == parent
            && DesktopShape.ZOk(shape, N.Children((IntPtr)parent).Select(h => (long)h).ToList(), (long)s.Host));
        var monitors = N.Monitors().Count;
        Check("layer", shape.Kind is ShapeKind.Raised or ShapeKind.Classic && hostsOk && surfaces.Count == monitors,
            $"{shape.Kind}; {surfaces.Count} surface(s) for {monitors} monitor(s); parent and z {(hostsOk ? "right" : "WRONG")}");

        // 2. Every page starts (with the fresh profile's default, Seasonal), then shows one that always
        // moves and animates. A pick sent before the page is up would be lost, so it waits first.
        foreach (var s in surfaces)
            if (!await Until(20000, () => Ready(s))) Line("FAIL", $"starts {s.Plan.Device}", "the first wallpaper never said ready");
        await desktop.ShowAsync(TestWallpaper);
        foreach (var s in surfaces)
        {
            var ready = await Until(20000, async () => await Ready(s) && await Js<string>(s, "WP.player.stage.id") == TestWallpaper);
            var frames = ready ? await FramesOver(s, 2000) : -1;
            Check($"animates {s.Plan.Device}", ready && frames > 20, ready ? $"{frames} frames in 2 s" : "the stage never said ready");
            await ListenAsync(s);
        }
        var first = surfaces[0];

        // 5 (W1). The taskbar's insets reached the page.
        foreach (var s in surfaces)
        {
            var insets = await Js<JsonElement>(s, $"(() => {{ const w = {Stage}; return w && w.WP && w.WP.host ? w.WP.host.insets : null; }})()");
            var got = insets.ValueKind == JsonValueKind.Object
                ? $"{insets.GetProperty("top")},{insets.GetProperty("right")},{insets.GetProperty("bottom")},{insets.GetProperty("left")}" : "none";
            Check($"insets {s.Plan.Device}", got == s.Plan.Insets.ToParam(), $"page {got}, plan {s.Plan.Insets.ToParam()}");
        }

        // 6 (W1). WebView2's input overlay can't swallow clicks meant for the icons.
        desktop.FixOverlay();
        var blocking = Overlays().Where(h => (N.ExStyle(h) & N.WS_EX_TRANSPARENT) == 0).ToList();
        Check("overlay", blocking.Count == 0, blocking.Count == 0 ? $"{Overlays().Count} overlay window(s), all click-through" : $"{blocking.Count} not click-through");

        // 3. A write in a second web view on the same environment arrives as a storage event: the
        // path every change from the settings window takes.
        await StorageAsync(first);

        // Every WP.power call from here on is kept where the power check can read it.
        foreach (var s in surfaces)
            await s.EvalAsync("window.__selftestPower = null; WP.power = (tell => json => { window.__selftestPower = json; return tell(json); })(WP.power)");

        // 4. Pause, through the path every power signal takes: hidden stops frames outright and the
        // page hears it; visible starts them again.
        await desktop.SetPausedAsync(true);
        await Wait(300);
        var hidden = await FramesOver(first, 1500);
        var visibleFlag = first.Visible;
        var pageHeard = await Js<bool>(first, "WP.player.policy.pause");
        await desktop.SetPausedAsync(false);
        await Wait(500);
        var resumed = await FramesOver(first, 1500);
        Check("pause", hidden is >= 0 and <= 2 && !visibleFlag && pageHeard && resumed > 10,
            $"hidden {hidden} frames in 1.5 s (IsVisible={visibleFlag}, page {(pageHeard ? "paused" : "NOT told")}); visible {resumed}");

        // 6 (W3). The pointer, fed to the forwarder (never real input), and the classifier on the real desktop.
        await PointerAsync(first);
        await PointerTogglesAsync(first);
        await ClassifyAsync(first);

        // 5 (W2). Coverage: another window over monitor 1 hides that surface only, and closing it shows it again.
        await CoverageAsync(surfaces);

        // 4b. The power state reached every page as sent, and its policy follows: over Remote Desktop
        // its ceiling is Low (§10.25.7).
        await PowerAsync(surfaces);

        // 7 (W2). Different mode, then a resize and an unplug that keep the page, in a fake
        // two-monitor layout; then back to the real monitors, whose surfaces are new.
        surfaces = await MonitorsAsync();
        if (surfaces.Count == 0) { Line("FAIL", "real monitors again", "no surfaces"); return; }
        first = surfaces[0];

        // 4c. The tray's Performance rows are real clicks; the pick reaches the page's store and the
        // status line follows the stage's own report. Auto is put back at the end.
        await PerformanceAsync(first);

        // 7 (W1). bing.json is answered by the app.
        await BingAsync(first);

        // 8. What Explorer's death does to our hosts, without touching Explorer: they're destroyed,
        // then the ShellRestarted path re-creates them and re-binds the visuals. No reload.
        var origin = await Js<double>(first, "performance.timeOrigin");
        desktop.DestroyHostsForTest();
        await desktop.OnShellRestartedAsync();
        await Wait(500);
        shape = layer.Shape;
        (parent, _) = DesktopShape.AttachTarget(shape);
        var rebound = surfaces.All(s => N.IsWindow(s.Host) && (long)N.GetParent(s.Host) == parent
            && DesktopShape.ZOk(shape, N.Children((IntPtr)parent).Select(h => (long)h).ToList(), (long)s.Host));
        var after = await FramesOver(first, 1500);
        var sameOrigin = await Js<double>(first, "performance.timeOrigin") == origin;
        Check("shell restart (simulated)", rebound && after > 10 && sameOrigin,
            $"hosts {(rebound ? "re-created and attached" : "NOT re-attached")}; {after} frames in 1.5 s; {(sameOrigin ? "no reload" : "the page RELOADED")}");

        // 9 (W1). A crashed renderer is reloaded and animates again.
        await CrashAsync(first);

        // 9a (W5). The screen saver, in harness windows of its own process: it draws, the desktop stands
        // aside, input ends it, Different rotates, and the watchdog's steps.
        await SaverAsync(first);

        // 10. Cleanup leaves no host windows and none of our keepers.
        desktop.Dispose();
        await Wait(300);
        var hosts = DesktopLayer.Snapshot().Count(n => n.Class == DesktopLayer.HostClass) + N.TopLevel(DesktopLayer.HostClass).Count;
        var keepers = 0;
        var pid = Environment.ProcessId;
        N.EnumWindows((h, _) => { if (N.PidOf(h) == pid && N.TextOf(h) == "WallpapersKeeper") keepers++; return true; }, IntPtr.Zero);
        Check("cleanup", hosts == 0 && keepers == 0, $"{hosts} host window(s), {keepers} keeper(s) left");

        // 11. Install, update and uninstall, in the throwaway test layout.
        InstallChecks();
    }

    /// install, saver selection, update, update (busy exe / .scr / web), uninstall against the `test` layout and
    /// the test flavour's own saver key only (§10.25.12, §10.25.13), removed first and in `finally` (settings
    /// kept: the data root holds this very report).
    void InstallChecks()
    {
        var layout = app.Layout;
        var installer = app.Installer;
        if (layout == null || installer == null || layout.Flavor != "test" || !layout.Root.EndsWith("Wallpapers-test", StringComparison.OrdinalIgnoreCase)
            || layout.RunValueName != "Wallpapers-test" || !layout.UninstallKey.EndsWith("Wallpapers-test", StringComparison.OrdinalIgnoreCase))
        {
            Line("FAIL", "install", $"not the test layout ({layout?.Flavor ?? "none"}); refusing to touch an install");
            return;
        }
        // Uninstall restores the saver under KeyFor(layout.Flavor): never the real one from here.
        if (SaverRegistry.KeyFor(app.Paths.Flavor) == SaverRegistry.DesktopKey || SaverRegistry.KeyFor(layout.Flavor) == SaverRegistry.DesktopKey)
        {
            Line("FAIL", "install", $"the saver key for {app.Paths.Flavor} is the real one; refusing to touch it");
            return;
        }
        const string TestRoot = @"Software\Wallpapers-test", Ribbons = @"C:\Windows\System32\Ribbons.scr";
        var saverKey = SaverRegistry.KeyFor("test");
        string? Run() { using var k = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(RunKey.Path); return k?.GetValue(layout.RunValueName) as string; }
        string? Entry(string name) { using var k = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(layout.UninstallKey); return k?.GetValue(name)?.ToString(); }
        string? SaverValue(string name) { using var k = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(saverKey); return k?.GetValue(name) as string; }
        long Length(string path) => File.Exists(path) ? new FileInfo(path).Length : -1;
        bool ScrMatches() => Length(layout.Saver) > 0 && Length(layout.Saver) == Length(layout.Exe);
        string Scr() => ScrMatches() ? ".scr ok" : $".scr {(File.Exists(layout.Saver) ? $"{Length(layout.Saver)} bytes, exe {Length(layout.Exe)}" : "MISSING")}";
        List<string> Leftovers() => new[] { layout.Exe, layout.Saver, layout.Web }.SelectMany(p => new[] { p + ".new", p + ".old" })
            .Where(p => File.Exists(p) || Directory.Exists(p)).Select(Path.GetFileName).OfType<string>().ToList();
        var settingsBefore = app.Settings.Saver;
        try
        {
            installer.Remove(keepSettings: true);   // what a self-test killed mid-way left behind
            Microsoft.Win32.Registry.CurrentUser.DeleteSubKeyTree(TestRoot, throwOnMissingSubKey: false);
            var why = installer.Apply(AppContext.BaseDirectory, fresh: true);
            var (_, runData) = RunKey.Spec(layout);
            var target = File.Exists(layout.Shortcut) ? ShellLink.TargetOf(layout.Shortcut) : null;
            Check("install", why == null && File.Exists(layout.Exe) && ScrMatches() && File.Exists(Path.Combine(layout.Web, "index.html"))
                && Run() == runData && Entry("DisplayName") == "Wallpapers (test)" && Entry("DisplayVersion") == App.Version.Split('+')[0]
                && Entry("UninstallString") == $"\"{layout.Exe}\" --uninstall"
                && string.Equals(target, layout.Exe, StringComparison.OrdinalIgnoreCase),
                why ?? $"{Scr()}, run {(Run() == runData ? "ok" : "WRONG")}, entry {Entry("DisplayName")} {Entry("DisplayVersion")}, shortcut {target ?? "missing"}");

            // The test flavour's private key, seeded with another saver: Select takes over and remembers it.
            using (var k = Microsoft.Win32.Registry.CurrentUser.CreateSubKey(saverKey))
            {
                k.SetValue(SaverRegistry.ExeValue, Ribbons, Microsoft.Win32.RegistryValueKind.String);
                k.SetValue(SaverRegistry.ActiveValue, "1", Microsoft.Win32.RegistryValueKind.String);
            }
            var selection = new SaverSelection("test", Log.Info);
            var selected = selection.Select(layout.Saver);
            var isSelected = selection.IsSelected(layout.Saver);
            var value = SaverValue(SaverRegistry.ExeValue);
            var active = SaverValue(SaverRegistry.ActiveValue);
            using (var k = Microsoft.Win32.Registry.CurrentUser.CreateSubKey(SaverRegistry.PolicyKeyFor("test")))
                k.SetValue(SaverRegistry.ExeValue, Ribbons, Microsoft.Win32.RegistryValueKind.String);
            var policy = selection.PolicyReason();
            using (var k = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(SaverRegistry.PolicyKeyFor("test"), writable: true))
                k?.DeleteValue(SaverRegistry.ExeValue, throwOnMissingValue: false);
            var noPolicy = selection.PolicyReason();
            selection.SetTimeoutMinutes(10);
            var minutes = selection.TimeoutMinutes();
            Check("saver selection", selected.Exe == Ribbons && isSelected && active == "1" && policy != null && noPolicy == null && minutes == 10,
                $"was {selected.Exe ?? "none"}; now {value} ({(isSelected ? "ours" : "NOT ours")}), active {active ?? "unset"}; "
                + $"policy {(policy != null ? "seen" : "MISSED")}, then {(noPolicy == null ? "clear" : "STILL SEEN")}; start after {minutes?.ToString(CultureInfo.InvariantCulture) ?? "unset"} min");

            installer.SetStartWithWindows(false);
            var marker = Path.Combine(layout.Web, "marker.txt");
            File.WriteAllText(marker, "old");
            File.WriteAllText(layout.Saver, "old");
            why = installer.Apply(AppContext.BaseDirectory, fresh: false);
            Check("update", why == null && !File.Exists(marker) && File.Exists(layout.Exe) && ScrMatches() && Run() == null
                && Entry("InstallDate") != null && Entry("DisplayVersion") != null && Leftovers().Count == 0,
                why ?? $"marker {(File.Exists(marker) ? "STILL THERE" : "gone")}, {Scr()}, run value {(Run() == null ? "absent" : "PRESENT")}"
                    + (Leftovers() is { Count: > 0 } l ? $", LEFT {string.Join(", ", l)}" : ""));

            long before = new FileInfo(layout.Exe).Length;
            var clock = Stopwatch.StartNew();
            using (new FileStream(layout.Exe, FileMode.Open, FileAccess.Read, FileShare.None))
                why = installer.Apply(AppContext.BaseDirectory, fresh: false);
            var seconds = clock.Elapsed.TotalSeconds;
            Check("update (busy exe)", why != null && (why.Contains("still running") || why.Contains("in use")) && seconds < 20
                && new FileInfo(layout.Exe).Length == before,
                $"{seconds:0.0} s, {(why == null ? "NO REASON given" : $"\"{why}\"")}, exe {(new FileInfo(layout.Exe).Length == before ? "unchanged" : "CHANGED")}");

            // A running saver holds the .scr: the update refuses before touching anything.
            File.WriteAllText(layout.Saver, "old");
            using (new FileStream(layout.Saver, FileMode.Open, FileAccess.Read, FileShare.None))
                why = installer.Apply(AppContext.BaseDirectory, fresh: false);
            var scrKept = File.ReadAllText(layout.Saver) == "old";
            Check("update (busy .scr)", why != null && why.Contains("Wallpapers.scr is in use") && scrKept
                && new FileInfo(layout.Exe).Length == before && Leftovers().Count == 0,
                $"{(why == null ? "NO REASON given" : $"\"{why}\"")}, .scr {(scrKept ? "unchanged" : "CHANGED")}, exe {(new FileInfo(layout.Exe).Length == before ? "unchanged" : "CHANGED")}"
                    + (Leftovers() is { Count: > 0 } l2 ? $", LEFT {string.Join(", ", l2)}" : ""));

            // The last move fails (a file open in web\ blocks the folder's rename) after the exe and the .scr
            // went aside: all three come back as they were.
            File.WriteAllText(layout.Exe, "old exe");
            File.WriteAllText(layout.Saver, "old scr");
            using (new FileStream(Path.Combine(layout.Web, "index.html"), FileMode.Open, FileAccess.Read, FileShare.Read))
                why = installer.Apply(AppContext.BaseDirectory, fresh: false);
            bool exeBack = File.ReadAllText(layout.Exe) == "old exe", scrBack = File.ReadAllText(layout.Saver) == "old scr",
                webBack = File.Exists(Path.Combine(layout.Web, "index.html"));
            Check("update (rolled back)", why != null && exeBack && scrBack && webBack && Leftovers().Count == 0,
                $"{(why == null ? "NO REASON given" : $"\"{why}\"")}; exe {(exeBack ? "back" : "NOT back")}, .scr {(scrBack ? "back" : "NOT back")}, web {(webBack ? "back" : "MISSING")}"
                    + (Leftovers() is { Count: > 0 } l3 ? $", LEFT {string.Join(", ", l3)}" : ""));

            // Uninstall reads the data folder's settings.json for the saver it put aside.
            app.SaveSettings(app.Settings with { Saver = (app.Settings.Saver ?? new()) with { Before = selected } });
            var left = installer.Remove(keepSettings: true);
            Check("uninstall", left.Count == 0 && !Directory.Exists(layout.Root) && !File.Exists(layout.Shortcut) && Run() == null
                && Entry("DisplayName") == null && Directory.Exists(layout.DataFolder),
                left.Count == 0 ? "root (exe, .scr, web), shortcut, run value and key gone; the data folder kept" : $"left: {string.Join(", ", left)}");
            var restored = SaverValue(SaverRegistry.ExeValue);
            var restoredActive = SaverValue(SaverRegistry.ActiveValue);
            Check("uninstall restores the saver", restored == Ribbons && restoredActive == "1",
                $"{restored ?? "none"}, active {restoredActive ?? "unset"}");
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or InvalidOperationException or System.Security.SecurityException
            or System.Runtime.InteropServices.COMException)
        {
            Line("FAIL", "install", $"threw {e.GetType().Name}: {e.Message}");
        }
        finally
        {
            installer.Remove(keepSettings: true);
            Microsoft.Win32.Registry.CurrentUser.DeleteSubKeyTree(TestRoot, throwOnMissingSubKey: false);
            app.SaveSettings(app.Settings with { Saver = settingsBefore });
        }
    }

    /// WebView2's visible top-level windows in our environment's processes that are layered: the
    /// full-screen input overlay visual hosting makes (W0.2).
    List<IntPtr> Overlays()
    {
        var env = app.Desktop.Environment;
        if (env == null) return [];
        var pids = env.GetProcessInfos().Select(p => p.ProcessId).ToHashSet();
        var found = new List<IntPtr>();
        N.EnumWindows((h, _) =>
        {
            if (N.IsWindowVisible(h) && pids.Contains(N.PidOf(h)) && N.ClassOf(h) == "Chrome_WidgetWin_1" && (N.ExStyle(h) & N.WS_EX_LAYERED) != 0) found.Add(h);
            return true;
        }, IntPtr.Zero);
        return found;
    }

    async Task PerformanceAsync(Surface first)
    {
        const string Stored = "JSON.stringify(WP.store.get('wp:performance') || {})";
        foreach (var mode in new[] { "low", "medium", "high", "auto" })
        {
            app.Tray.ClickPerformanceForTest(mode);
            // Auto is stored as no mode at all.
            var picked = await Until(3000, async () => await Js<string>(first, Stored) is { } stored
                && (mode == "auto" ? !stored.Contains("\"mode\"") : stored.Contains($"\"mode\":\"{mode}\"")));
            // The stage reports once a second; the tray's line is what it last asked.
            await Wait(1300);
            var label = await Js<string>(first, "WP.player.stats && WP.player.stats.label") ?? "?";
            // A pinned mode is capped by the page's power ceiling (perf.js: on battery High shows Medium).
            var ceiling = await Js<string>(first, "WP.player.policy.ceiling") ?? "?";
            var expected = mode == "auto" ? null : Stricter(mode, ceiling);
            Check($"performance {mode}", picked && (expected == null || label.Equals(expected, StringComparison.OrdinalIgnoreCase)),
                $"store {await Js<string>(first, Stored)}; stage says {label}{(expected == null ? "" : $" (expected {expected}, ceiling {ceiling})")}; tray line \"{app.Tray.PerformanceStatusForTest}\"");
        }
        var before = await Js<bool>(first, "(WP.store.get('wp:performance') || {}).batteryAware !== false");
        app.Tray.ClickPerformanceForTest(null);
        var flipped = await Until(3000, async () => await Js<bool>(first, "(WP.store.get('wp:performance') || {}).batteryAware !== false") != before);
        app.Tray.ClickPerformanceForTest(null);
        var restored = await Until(3000, async () => await Js<bool>(first, "(WP.store.get('wp:performance') || {}).batteryAware !== false") == before);
        Check("performance battery toggle", flipped && restored, $"was {before}, flipped {flipped}, restored {restored}");
    }

    // ---- The pointer (§10.25.8) ---------------------------------------------------------------

    /// What a stage heard since its probe was last emptied: real moves (SendMouseInput), presses
    /// (pointerdown: only ever by script), host.gestures taps and the last dblclick, in CSS px. A press
    /// is the proof that a click got through: the real cursor's moves (Follow on) can turn a tap into a drag.
    sealed record Heard(int Moves, double[]? Last, int Downs, double[][] Taps, double[]? Dbl)
    {
        public override string ToString() =>
            $"moves {Moves} last {At(Last)}, downs {Downs}, taps [{string.Join(" ", Taps.Select(At))}], dblclick {At(Dbl)}";
    }

    static string At(double[]? p) => p is [var x, var y] ? $"({x:0.#},{y:0.#})" : "none";
    static readonly JsonSerializerOptions AnyCase = new() { PropertyNameCaseInsensitive = true };

    /// The stage probe (installed once per stage), emptied. False when there's no stage to listen in.
    static Task<bool> ListenAsync(Surface s) => Js<bool>(s, $$"""
        (() => {
          const w = {{Stage}};
          if (!w || !w.WP || !w.WP.host) return false;
          const fresh = !w.__pt;
          w.__pt = { moves: 0, last: null, downs: 0, taps: [], dbl: null };
          if (fresh) {
            w.WP.host.gestures({ tap: (x, y) => w.__pt.taps.push([x, y]) });
            w.document.addEventListener('pointermove', e => { w.__pt.moves++; w.__pt.last = [e.clientX, e.clientY]; });
            w.document.addEventListener('dblclick', e => w.__pt.dbl = [e.clientX, e.clientY]);
            w.document.addEventListener('pointerdown', () => w.__pt.downs++);
          }
          return true;
        })()
        """);

    static async Task<Heard?> HeardAsync(Surface s)
    {
        try { return JsonSerializer.Deserialize<Heard>(await s.EvalAsync($"{Stage}?.__pt ?? null"), AnyCase); }
        catch (Exception e) when (e is JsonException or InvalidOperationException or COMException) { return null; }
    }

    /// Where CSS (400, 300) is on a surface, in physical px: its own placement, so a fit factor is in it.
    static (int X, int Y) TestPoint(Surface s) =>
        (s.Placement.Screen.Left + (int)Math.Round(400 * s.Placement.RasterizationScale),
         s.Placement.Screen.Top + (int)Math.Round(300 * s.Placement.RasterizationScale));

    static bool Near(double[]? p) => p is [var x, var y] && Math.Abs(x - 400) <= 1 && Math.Abs(y - 300) <= 1;

    /// A left press and its release 50 ms later, at a physical point, through the forwarder.
    async Task TapAsync(int x, int y, HitKind kind = HitKind.Bare)
    {
        app.Desktop.Pointer.FeedForTest(true, x, y, kind);
        await Wait(50);
        app.Desktop.Pointer.FeedForTest(false, x, y, kind);
    }

    /// A move, a tap and a double-click reach monitor 1's stage at the right CSS px without moving the
    /// foreground; an icon press reaches nothing; a hidden surface gets nothing and the pointer is off.
    async Task PointerAsync(Surface first)
    {
        var desktop = app.Desktop;
        var pointer = desktop.Pointer;
        var (x, y) = TestPoint(first);
        if (!await ListenAsync(first)) { Line("FAIL", "pointer", "no stage to listen in"); return; }
        Heard? h = null;

        pointer.FeedForTest(null, x, y);
        var moved = await Until(1000, async () => (h = await HeardAsync(first)) is { Moves: >= 1 } && Near(h.Last), 20);
        Check("pointer move", moved, $"physical ({x},{y}) → {h}");

        await ListenAsync(first);
        var foreground = N.GetForegroundWindow();
        await TapAsync(x, y);
        var up = Stopwatch.StartNew();
        await Until(1000, async () => (h = await HeardAsync(first)) is { Taps.Length: >= 1 }, 20);
        var kept = N.GetForegroundWindow() == foreground;
        Check("pointer tap", h is { Taps: [var tap], Dbl: null } && Near(tap) && kept,
            $"physical ({x},{y}) → {h}; focus {(kept ? "kept" : "MOVED")}");

        // The second press 200 ms after the first one's release: inside the double-click time.
        await Wait(Math.Max(0, 200 - (int)up.ElapsedMilliseconds));
        await TapAsync(x, y);
        await Until(1000, async () => (h = await HeardAsync(first)) is { Taps.Length: >= 2, Dbl: not null }, 20);
        Check("pointer double click", h is { Taps.Length: 2 } && Near(h.Dbl), $"{h}");

        await TapAsync(x, y, HitKind.Icon);
        await Wait(500);
        h = await HeardAsync(first);
        Check("pointer icon", h is { Taps.Length: 2 }, $"a press on an icon: {h}");

        await desktop.SetPausedAsync(true);
        try
        {
            var off = !pointer.Active;
            var before = await HeardAsync(first);
            pointer.FeedForTest(null, x + 2, y);
            await TapAsync(x, y);
            await Wait(500);
            h = await HeardAsync(first);
            var nothing = before != null && h != null && h.Moves == before.Moves && h.Downs == before.Downs && h.Taps.Length == before.Taps.Length;
            await desktop.SetPausedAsync(false);
            var on = pointer.Active;
            Check("pointer hidden", off && nothing && on,
                $"paused: pointer {(off ? "off" : "STILL ON")}, a move and a tap {(nothing ? "reached nothing" : $"REACHED the page ({before} → {h})")}; visible: pointer {(on ? "on" : "STILL OFF")}");
        }
        finally { if (desktop.Paused) await desktop.SetPausedAsync(false); }
    }

    /// The tray's two mouse rows: each stops what it says, saves to settings.json, and both off turns
    /// the pointer off. Both end where they began.
    async Task PointerTogglesAsync(Surface first)
    {
        var pointer = app.Desktop.Pointer;
        var (x, y) = TestPoint(first);
        bool Saved(Func<AppSettings, bool> pick) => pick(AppSettings.Load(app.Paths.SettingsFile));
        var (f, c) = (app.Settings.FollowMouse, app.Settings.DesktopClicks);
        Heard? h = null;
        var notes = new List<string>();
        try
        {
            if (!f || !c) { Line("FAIL", "pointer toggles", $"they didn't start on (follow {f}, clicks {c})"); return; }

            await ListenAsync(first);
            app.Tray.ClickPointerForTest("clicks");
            var clicksOff = !pointer.Clicks && !app.Settings.DesktopClicks && !Saved(st => st.DesktopClicks);
            await TapAsync(x, y);
            await Wait(500);
            var blocked = (h = await HeardAsync(first)) is { Downs: 0, Taps.Length: 0 };
            notes.Add($"clicks off {(clicksOff ? "saved" : "NOT saved")}, a tap {(blocked ? "not delivered" : $"DELIVERED ({h})")}");
            app.Tray.ClickPointerForTest("clicks");
            var clicksOn = pointer.Clicks && app.Settings.DesktopClicks && Saved(st => st.DesktopClicks);
            await TapAsync(x, y);
            var delivered = await Until(1000, async () => (h = await HeardAsync(first)) is { Taps.Length: 1 }, 20);
            notes.Add($"on {(clicksOn ? "saved" : "NOT saved")}, {(delivered ? "delivered" : $"NOT delivered ({h})")}");

            // Moves to a new spot each time: a move to where the last one was may not reach the page.
            await ListenAsync(first);
            app.Tray.ClickPointerForTest("follow");
            var followOff = !pointer.Follow && !app.Settings.FollowMouse && !Saved(st => st.FollowMouse);
            pointer.FeedForTest(null, x + 2, y);
            await Wait(500);
            var still = (h = await HeardAsync(first)) is { Moves: 0 };
            notes.Add($"follow off {(followOff ? "saved" : "NOT saved")}, a move {(still ? "not delivered" : $"DELIVERED ({h})")}");
            app.Tray.ClickPointerForTest("follow");
            var followOn = pointer.Follow && app.Settings.FollowMouse && Saved(st => st.FollowMouse);
            pointer.FeedForTest(null, x + 4, y);
            var movedAgain = await Until(1000, async () => (h = await HeardAsync(first)) is { Moves: >= 1 }, 20);
            notes.Add($"on {(followOn ? "saved" : "NOT saved")}, {(movedAgain ? "delivered" : $"NOT delivered ({h})")}");

            app.Tray.ClickPointerForTest("follow");
            app.Tray.ClickPointerForTest("clicks");
            var bothOff = !pointer.Active;
            app.Tray.ClickPointerForTest("follow");
            app.Tray.ClickPointerForTest("clicks");
            var back = pointer.Active;
            notes.Add($"both off: pointer {(bothOff ? "off" : "STILL ON")}, both on: {(back ? "on" : "STILL OFF")}");
            Check("pointer toggles", clicksOff && blocked && clicksOn && delivered && followOff && still && followOn && movedAgain && bothOff && back,
                string.Join("; ", notes));
        }
        finally
        {
            if (app.Settings.FollowMouse != f) app.Tray.ClickPointerForTest("follow");
            if (app.Settings.DesktopClicks != c) app.Tray.ClickPointerForTest("clicks");
        }
    }

    /// The real classifier (nothing is clicked) on monitor 1's real desktop: each icon UI Automation
    /// lists is an icon, and a grid of points away from them is bare. Points under another window (the
    /// terminal this runs from) are left out.
    async Task ClassifyAsync(Surface first)
    {
        const string Name = "pointer classify";
        if (app.Desktop.Fake) { Line("SKIP", Name, "fake monitors"); return; }
        var work = first.Plan.Work;
        static bool OnDesktop(int x, int y) =>
            N.ClassOf(N.GetAncestor(N.WindowFromPoint(new N.POINT { X = x, Y = y }), N.GA_ROOT)) is "Progman" or "WorkerW";

        var listView = N.Children((IntPtr)app.Layer.Shape.DefView).FirstOrDefault(h => N.ClassOf(h) == "SysListView32");
        List<Rect> icons;
        try { icons = listView != IntPtr.Zero && N.IsWindowVisible(listView) ? await Task.Run(() => IconRects(listView)) : []; }
        catch (COMException e) { Line("FAIL", Name, $"UI Automation couldn't list the icons ({e.Message})"); return; }
        var allIcons = icons.Count;
        if (allIcons == 0) { Line("SKIP", Name, "no desktop icons"); return; }
        var points = new List<(int X, int Y, HitKind Want)>();
        foreach (var r in icons)
        {
            var (cx, cy) = ((r.Left + r.Right) / 2, (r.Top + r.Bottom) / 2);
            if (work.Contains(cx, cy) && OnDesktop(cx, cy)) points.Add((cx, cy, HitKind.Icon));
        }
        for (var i = 0; i < 5; i++)
            for (var j = 0; j < 4; j++)
            {
                int x = work.Left + (2 * i + 1) * work.Width / 10, y = work.Top + (2 * j + 1) * work.Height / 8;
                if (icons.Any(r => x >= r.Left - 8 && x < r.Right + 8 && y >= r.Top - 8 && y < r.Bottom + 8) || !OnDesktop(x, y)) continue;
                points.Add((x, y, HitKind.Bare));
            }
        var iconPoints = points.Count(p => p.Want == HitKind.Icon);
        var barePoints = points.Count - iconPoints;
        var where = $"{iconPoints} of {allIcons} icon(s) and {barePoints} of 20 grid points uncovered on monitor 1";
        if (points.Count == 0) { Line("SKIP", Name, $"no icons, no bare points: the desktop is covered ({where})"); return; }

        var wrong = new List<string>();
        var times = new List<double>();
        foreach (var (x, y, want) in points)
        {
            try
            {
                var (kind, ms) = await app.Desktop.Pointer.ClassifyForTest(x, y);
                times.Add(ms);
                if (kind != want) wrong.Add($"({x},{y}) {kind} (want {want})");
            }
            catch (TimeoutException) { wrong.Add($"({x},{y}) no verdict in 3 s"); }
        }
        times.Sort();
        double Pct(double q) => times.Count == 0 ? 0 : times[Math.Min(times.Count - 1, (int)Math.Ceiling(q * times.Count) - 1)];
        // Both kinds are needed to prove anything (a classifier that always said Icon would pass on icons alone).
        if (wrong.Count == 0 && (iconPoints == 0 || barePoints == 0))
        {
            Line("SKIP", Name, $"{points.Count} of {points.Count} right, but no {(iconPoints == 0 ? "icon" : "bare desktop")} in view ({where})");
            return;
        }
        Check(Name, wrong.Count == 0,
            $"{points.Count - wrong.Count} of {points.Count} right; uia median {Pct(0.5):0.#} ms, p95 {Pct(0.95):0.#} ms; {where}"
            + (wrong.Count > 0 ? $"; wrong: {string.Join(", ", wrong)}" : ""));
    }

    /// The icons of the desktop's list view, as UI Automation sees them (physical px). On an MTA thread.
    static List<Rect> IconRects(IntPtr listView)
    {
        var uia = (N.IUIAutomation)Activator.CreateInstance(Type.GetTypeFromCLSID(N.CLSID_CUIAutomation, throwOnError: true)!)!;
        try
        {
            var items = uia.ElementFromHandle(listView).FindAll(N.TreeScope_Children, uia.CreateTrueCondition());
            var found = new List<Rect>();
            for (var i = 0; i < items.get_Length(); i++)
                if (items.GetElement(i) is var item && item.get_CurrentControlType() == N.UIA_ListItemControlTypeId)
                    found.Add(item.get_CurrentBoundingRectangle().ToRect());
            return found;
        }
        finally { Marshal.FinalReleaseComObject(uia); }
    }

    /// A tap at monitor 2's test point of the fake layout lands on monitor 2 at CSS (400, 300), and
    /// nowhere on monitor 1.
    async Task FakeTapAsync(List<Surface> fake)
    {
        var (one, two) = (fake.First(s => s.Plan.Number == 1), fake.First(s => s.Plan.Number == 2));
        // At 1 the check can't see a missing factor; below 0.5 WebView2 doesn't render at the planned scale.
        var scale = two.Placement.RasterizationScale;
        if (scale is >= 0.99 or < 0.5)
        {
            Line("SKIP", "pointer (fake monitor 2)", $"the fake layout fits at {scale:0.###}, outside [0.5, 0.99): a tap there proves nothing about the fit factor");
            return;
        }
        var listening = await ListenAsync(one) & await ListenAsync(two);
        var (x, y) = TestPoint(two);
        await TapAsync(x, y);
        Heard? h2 = null;
        await Until(1000, async () => (h2 = await HeardAsync(two)) is { Taps.Length: >= 1 }, 20);
        var h1 = await HeardAsync(one);
        Check("pointer (fake monitor 2)", listening && h2 is { Taps: [var tap] } && Near(tap) && h1 is { Taps.Length: 0 },
            $"physical ({x},{y}) at scale {two.Placement.RasterizationScale:0.###}: monitor 2 {h2?.ToString() ?? "no stage"}; monitor 1 {h1?.ToString() ?? "no stage"}");
    }

    static readonly string[] Tiers = ["low", "medium", "high"];
    static string Stricter(string a, string b) => Array.IndexOf(Tiers, a) <= Array.IndexOf(Tiers, b) ? a : b;

    /// The page loaded again since `origin` (a navigate or a reload), is ready, and shows `id` if given.
    static Task<bool> LoadedAgain(Surface s, double origin, string? id = null) => Until(20000, async () =>
        await Js<double>(s, "performance.timeOrigin") is var o && o != 0 && o != origin && await Ready(s)
        && (id == null || await Js<string>(s, "WP.player.stage.id") == id));

    static Task<bool> Shows(Surface s, string id) =>
        Until(20000, async () => await Ready(s) && await Js<string>(s, "WP.player.stage.id") == id);

    static bool SameJson(string a, string b)
    {
        try { return JsonNode.DeepEquals(JsonNode.Parse(a), JsonNode.Parse(b)); }
        catch (JsonException) { return false; }
    }

    /// Coverage (§10.25.9), on for this check only: a window of another process (coverage ignores
    /// ours) over monitor 1's work area, shown without taking focus, as a maximized window would be.
    async Task CoverageAsync(IReadOnlyList<Surface> surfaces)
    {
        var desktop = app.Desktop;
        var first = surfaces[0];
        if (app.Power.State.HiddenEverywhere) { Line("SKIP", "coverage", $"every surface is hidden already ({app.Power.State.Describe()})"); return; }
        await desktop.CoverageOnForTest();
        try
        {
            await Wait(CoverageGate.PauseAfterMs + 150);   // a monitor something else covers hides first
            var before = surfaces.ToDictionary(s => s, s => s.Visible);
            var w = first.Plan.Work;
            var start = new ProcessStartInfo(Environment.ProcessPath!) { UseShellExecute = false };
            start.ArgumentList.Add("--cover-for-test");
            start.ArgumentList.Add(string.Join(",", new[] { w.Left, w.Top, w.Width, w.Height }.Select(n => n.ToString(CultureInfo.InvariantCulture))));
            using var cover = Process.Start(start)!;
            try
            {
                var window = IntPtr.Zero;
                if (!await Until(10000, () => Task.FromResult((window = VisibleWindowOf(cover.Id)) != IntPtr.Zero)))
                {
                    Line("FAIL", "coverage", "the covering window never showed");
                    return;
                }
                var clock = Stopwatch.StartNew();
                var hidden = await Until(2000, () => Task.FromResult(!first.Visible));
                var hideMs = clock.ElapsedMilliseconds;
                var others = surfaces.Skip(1).All(s => s.Visible == before[s]);
                var focus = N.GetForegroundWindow() != window;
                N.PostMessage(window, N.WM_CLOSE, IntPtr.Zero, IntPtr.Zero);
                var closed = await Until(3000, () => Task.FromResult(cover.HasExited));
                clock.Restart();
                var shown = await Until(1000, () => Task.FromResult(first.Visible));
                var detail = $"{(hidden ? $"hidden {hideMs} ms after the window showed" : "NOT hidden in 2 s")}; "
                    + $"{surfaces.Count - 1} other surface(s) {(others ? "unchanged" : "CHANGED")}; focus {(focus ? "kept" : "TAKEN by the test window")}";
                if (!before[first])
                    Line(hidden && others && focus ? "SKIP" : "FAIL", "coverage",
                        $"monitor 1 was already covered by another window, so uncovering can't be seen; {detail}");
                else
                    Check("coverage", hidden && others && focus && closed && shown,
                        $"{detail}; {(closed ? shown ? $"visible {clock.ElapsedMilliseconds} ms after it closed" : "NOT visible 1 s after it closed" : "the window didn't close")}");
            }
            finally { if (!cover.HasExited) cover.Kill(); }
        }
        finally { await desktop.CoverageOffForTest(); }
    }

    static IntPtr VisibleWindowOf(int pid)
    {
        var found = IntPtr.Zero;
        N.EnumWindows((h, _) =>
        {
            if (N.IsWindowVisible(h) && N.PidOf(h) == pid) { found = h; return false; }
            return true;
        }, IntPtr.Zero);
        return found;
    }

    /// --cover-for-test L,T,W,H (physical px): the coverage check's window, in its own process. Plain,
    /// not topmost, not in the taskbar, never activated; borderless so its frame is exactly the rect, as
    /// a maximized window's is the work area. It closes itself after 20 s whatever the test does.
    public static int Cover(string rect)
    {
        var r = rect.Split(',').Select(n => int.Parse(n, CultureInfo.InvariantCulture)).ToArray();
        ApplicationConfiguration.Initialize();
        using var form = new CoverForm(new Rectangle(r[0], r[1], r[2], r[3]));
        using var limit = new System.Windows.Forms.Timer { Interval = 20000 };
        limit.Tick += (_, _) => form.Close();
        limit.Start();
        Application.Run(form);
        return 0;
    }

    sealed class CoverForm : Form
    {
        readonly Rectangle where;

        public CoverForm(Rectangle where)
        {
            this.where = where;
            Text = "Wallpapers self-test: covering monitor 1";
            FormBorderStyle = FormBorderStyle.None;
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.Manual;
            BackColor = Color.FromArgb(40, 40, 40);
            Bounds = where;
        }

        protected override bool ShowWithoutActivation => true;

        // WinForms can rescale a form for its monitor's DPI: put it exactly there once it's up.
        protected override void OnShown(EventArgs e)
        {
            base.OnShown(e);
            N.SetWindowPos(Handle, IntPtr.Zero, where.X, where.Y, where.Width, where.Height, N.SWP_NOZORDER | N.SWP_NOACTIVATE);
        }
    }

    /// What each page last got from WP.power is what the power state says (battery included only when
    /// Windows reports one), and the page's policy follows it: in an RDP session and at the console.
    async Task PowerAsync(IReadOnlyList<Surface> surfaces)
    {
        var bad = new List<string>();
        var got = "";
        string[] reasons = [];
        foreach (var s in surfaces)
        {
            var want = "";
            var ok = await Until(2000, async () =>
            {
                var state = app.Power.State;
                want = PowerJson.For(state, hidden: !s.Visible);
                got = await Js<string>(s, "JSON.stringify(window.__selftestPower)") ?? "";
                reasons = await Js<string[]>(s, "WP.player.policy.reasons") ?? [];
                var pause = await Js<bool>(s, "WP.player.policy.pause");
                var battery = state.Battery is not { Charging: false } || reasons.Any(r => r is "on battery" or "battery low");
                return SameJson(got, want) && reasons.Contains("remote desktop") == state.Remote && pause == !s.Visible && battery;
            });
            if (!ok) bad.Add($"{s.Plan.Device} got {got} (sent {want}), reasons [{string.Join(", ", reasons)}]");
        }
        Check("power", bad.Count == 0, $"{app.Power.State.Describe()}; "
            + (bad.Count == 0 ? $"{surfaces.Count} page(s) got {got}, reasons [{string.Join(", ", reasons)}]" : string.Join("; ", bad)));
    }

    /// Two fake monitors at 100%, side by side; monitor 1 can be made 80 px taller. They must be fitted
    /// (scaled down by FakeLayout.Fit) so the pointer's CSS px have a factor in them that isn't 1, but not
    /// below 0.5, where WebView2 stops scaling (a 182 px window got a 364 px page at 0.253 on CI). So
    /// 1920×720 when its fit, plain and taller, lies in [0.5, 1) (the owner's RDP screen: 0.727); else
    /// a pair sized from the primary's work area to fit at 0.75 (CI's 1024×768: 648×360; 1920×1080:
    /// 1216×456), never smaller than 640×360 so CSS (400, 300) and the 80 px stay on monitor 1.
    static List<MonitorInfo> FakeTwo(bool taller = false)
    {
        var (w, h) = FakeSize();
        return [FakeMonitor(1, new Rect(0, 0, w, h + (taller ? 80 : 0))), FakeMonitor(2, new Rect(w, 0, 2 * w, h))];
    }

    static (int W, int H) FakeSize()
    {
        var real = N.Monitors();
        var work = (real.FirstOrDefault(m => m.Primary) ?? real[0]).Work;
        // FakeLayout.Fit's factor for the pair, plain and with monitor 1 taller.
        double Fit(int w, int h, int extra) => Math.Min(1, Math.Min(work.Width * 0.95 / (2 * w), work.Height * 0.95 / (h + extra)));
        bool Good(int w, int h) => Fit(w, h, 0) is >= 0.5 and < 1 && Fit(w, h, 80) is >= 0.5 and < 1;
        if (Good(1920, 720)) return (1920, 720);
        const double Target = 0.75;
        var fw = (int)(work.Width * 0.95 / (2 * Target));
        var fh = (int)Math.Min(fw * 3 / 8, work.Height * 0.95 / Target - 80);
        return (Math.Max(640, fw), Math.Max(360, fh));
    }

    static MonitorInfo FakeMonitor(int n, Rect r) =>
        new($@"\\.\DISPLAY{n}", r, r, 96, Primary: n == 1, Path: $"selftest-fake-{n}", Name: $"Self-test {n}");

    /// `display=` and `resize in place` in the fake layout; then back to Same and the real monitors,
    /// whatever happened. Returns the real monitors' (new) surfaces once they show the test wallpaper.
    async Task<List<Surface>> MonitorsAsync()
    {
        var desktop = app.Desktop;
        try
        {
            await desktop.UseFakeDisplaysForTest(FakeTwo());
            var fake = desktop.Surfaces.ToList();
            var ready = fake.Count == 2;
            foreach (var s in fake) ready &= await Shows(s, TestWallpaper);
            if (!ready) Line("FAIL", "display=", $"the fake layout has {fake.Count} surface(s) for 2 monitors, or one never showed {TestWallpaper}");
            else
            {
                await DisplayAsync(fake);
                await FakeTapAsync(fake);
                await ResizeInPlaceAsync(fake);
            }
        }
        finally
        {
            await desktop.SetModeAsync(MonitorMode.Same);
            await desktop.UseFakeDisplaysForTest(null);
        }
        var surfaces = desktop.Surfaces.ToList();
        foreach (var s in surfaces)
            if (!await Shows(s, TestWallpaper)) Line("FAIL", "real monitors again", $"{s.Plan.Device} never showed {TestWallpaper}");
        return surfaces;
    }

    /// Different mode (§10.25.6): each page has its own choice, kept across a reload, under its own key.
    async Task DisplayAsync(List<Surface> fake)
    {
        var desktop = app.Desktop;
        var (one, two) = (fake[0], fake[1]);
        var shared = await Js<string>(one, "WP.store.get('wp:current')");
        var origins = new List<double>();
        foreach (var s in fake) origins.Add(await Js<double>(s, "performance.timeOrigin"));
        await desktop.SetModeAsync(MonitorMode.Different);
        var loaded = true;
        for (var i = 0; i < fake.Count; i++) loaded &= await LoadedAgain(fake[i], origins[i]);
        static bool HasParam(Surface s, string param) => new Uri(s.Web?.Source ?? "about:blank").Query.TrimStart('?').Split('&').Contains(param);
        var keyed = fake.All(s => HasParam(s, $"display={s.Plan.Key}"));

        await desktop.ShowAsync("snow", one.Plan.Key);
        await desktop.ShowAsync("rain", two.Plan.Key);
        var picked = await Shows(one, "snow") && await Shows(two, "rain");
        origins.Clear();
        foreach (var s in fake) { origins.Add(await Js<double>(s, "performance.timeOrigin")); s.Reload(); }
        var kept = await LoadedAgain(one, origins[0], "snow") && await LoadedAgain(two, origins[1], "rain");

        var keys = $"[{JsonSerializer.Serialize($"wp:current@{one.Plan.Key}")}, {JsonSerializer.Serialize($"wp:current@{two.Plan.Key}")}]";
        var stored = await Js<string?[]>(one, $"{keys}.map(k => WP.store.get(k)).concat(WP.store.get('wp:current'))") ?? [];
        var storage = stored is ["snow", "rain", var now] && now == shared;

        origins.Clear();
        foreach (var s in fake) origins.Add(await Js<double>(s, "performance.timeOrigin"));
        await desktop.SetModeAsync(MonitorMode.Same);
        var same = true;
        for (var i = 0; i < fake.Count; i++) same &= await LoadedAgain(fake[i], origins[i]);
        same &= fake.All(s => !(s.Web?.Source ?? "").Contains("display="));
        await one.EvalAsync($"{keys}.forEach(k => localStorage.removeItem(k))");

        Check("display=", loaded && keyed && picked && kept && storage && same,
            $"{(keyed ? "each URL has its key" : $"URLs {string.Join(" ", fake.Select(s => s.Web?.Source))}")}; "
            + $"snow and rain {(picked ? kept ? "shown, and back after a reload" : "shown, NOT back after a reload" : "NOT shown")}; "
            + $"storage [{string.Join(", ", stored.Select(v => v ?? "null"))}] (wp:current was {shared ?? "null"}); "
            + $"Same again {(same ? "(no display=)" : "FAILED")}");
    }

    /// A monitor resized, then another unplugged, in the fake layout (§10.25.6): the page stays.
    async Task ResizeInPlaceAsync(List<Surface> fake)
    {
        var desktop = app.Desktop;
        var (one, two) = (fake.First(s => s.Plan.Number == 1), fake.First(s => s.Plan.Number == 2));
        var origin = await Js<double>(one, "performance.timeOrigin");
        var before = await Js<int>(one, "innerHeight");
        var size = $"{one.Plan.Bounds.Width}x{one.Plan.Bounds.Height}";
        await desktop.UseFakeDisplaysForTest(FakeTwo(taller: true));
        var kept = desktop.Surfaces.Contains(one);
        // The page sees the fake monitor's CSS size give or take rounding (±2 px in a scaled-down fit).
        var after = 0;
        var grew = await Until(3000, async () => (after = await Js<int>(one, "innerHeight")) - before is >= 78 and <= 82);
        var same = await Js<double>(one, "performance.timeOrigin") == origin;
        Check("resize in place", kept && grew && same,
            $"monitor 1 {size} → {one.Plan.Bounds.Width}x{one.Plan.Bounds.Height}: {(kept ? "the same surface" : "a NEW surface")}, innerHeight {before} → {after}, {(same ? "no reload" : "the page RELOADED")}");

        var host = two.Host;
        await desktop.UseFakeDisplaysForTest([FakeTwo(taller: true)[0]]);
        var gone = !N.IsWindow(host) && desktop.Surfaces.Count == 1 && desktop.Surfaces[0] == one;
        var stayed = await Js<double>(one, "performance.timeOrigin") == origin;
        Check("resize in place (monitor removed)", gone && stayed,
            $"{(gone ? "monitor 2's window is gone" : $"{desktop.Surfaces.Count} surface(s), monitor 2's window {(N.IsWindow(host) ? "STILL there" : "gone")}")}; monitor 1 {(stayed ? "didn't reload" : "RELOADED")}");
    }

    async Task StorageAsync(Surface desktopPage)
    {
        var env = app.Desktop.Environment!;
        var nonce = Guid.NewGuid().ToString("N")[..12];
        await desktopPage.EvalAsync("window.__selftestStorage = null; addEventListener('storage', e => { if (e.key === 'wp:selftest') window.__selftestStorage = e.newValue; });");
        var keeper = new NativeWindow();
        keeper.CreateHandle(new CreateParams { Caption = "WallpapersSelfTest", Style = unchecked((int)N.WS_POPUP), ExStyle = (int)(N.WS_EX_TOOLWINDOW | N.WS_EX_NOACTIVATE) });
        CoreWebView2Controller? second = null;
        try
        {
            second = await env.CreateCoreWebView2ControllerAsync(keeper.Handle);
            second.Bounds = new Rectangle(0, 0, 400, 300);
            await WebFactory.SetUpAsync(second.CoreWebView2, app.Paths, app.Desktop.Bing, desktop: false);
            var loaded = new TaskCompletionSource<bool>();
            second.CoreWebView2.NavigationCompleted += (_, e) => loaded.TrySetResult(e.IsSuccess);
            second.CoreWebView2.Navigate(PageUrl.Origin + "index.html?host=windows&w=blank");
            if (!await loaded.Task.WaitAsync(TimeSpan.FromSeconds(15))) { Line("FAIL", "storage", "the second web view didn't load"); return; }
            await second.CoreWebView2.ExecuteScriptAsync($"localStorage.setItem('wp:selftest', {JsonSerializer.Serialize(nonce)})");
            var clock = Stopwatch.StartNew();
            var arrived = await Until(2000, async () => await Js<string>(desktopPage, "window.__selftestStorage") == nonce);
            Check("storage", arrived, arrived ? $"the desktop page heard it in {clock.ElapsedMilliseconds} ms" : "no storage event on the desktop page in 2 s");
            await second.CoreWebView2.ExecuteScriptAsync("localStorage.removeItem('wp:selftest')");
        }
        catch (TimeoutException) { Line("FAIL", "storage", "the second web view didn't load in 15 s"); }
        finally
        {
            second?.Close();
            keeper.DestroyHandle();
        }
    }

    async Task BingAsync(Surface s)
    {
        var json = await s.EvaluateAsync("""
            fetch('bing.json').then(async r => JSON.stringify({ status: r.status, native: r.headers.get('X-Wallpapers-Bing'),
                images: r.ok ? ((await r.json()).images || []).length : 0 }))
            """);
        if (json == null) { Line("FAIL", "bing.json", "the fetch failed"); return; }
        using var doc = JsonDocument.Parse(json);
        var (status, native, images) = (doc.RootElement.GetProperty("status").GetInt32(),
            doc.RootElement.GetProperty("native").ValueKind == JsonValueKind.String, doc.RootElement.GetProperty("images").GetInt32());
        if (native && status == 503) Line("SKIP", "bing.json", "offline: the app answered 503");
        else Check("bing.json", native && status == 200 && images > 0, $"status {status}, {(native ? "answered by the app" : "NOT answered by the app")}, {images} images");
    }

    async Task CrashAsync(Surface s)
    {
        var web = s.Web;
        if (web == null) { Line("FAIL", "renderer crash", "no web view"); return; }
        var origin = await Js<double>(s, "performance.timeOrigin");
        var clock = Stopwatch.StartNew();
        // The renderer dies mid-call, so the answer never comes: don't wait for it.
        _ = web.CallDevToolsProtocolMethodAsync("Page.crash", "{}").ContinueWith(t => _ = t.Exception, TaskScheduler.Default);
        var back = await Until(10000, async () =>
            await Js<double>(s, "performance.timeOrigin") is var o && o != 0 && o != origin && await Ready(s) && await FrameCount(s) > 5);
        var seconds = clock.Elapsed.TotalSeconds;
        Check("renderer crash", back && seconds <= 5, back ? $"reloaded and animating again in {seconds:0.0} s" : "not animating 10 s after the crash");
        // A reloaded page is new: it must have been told the power state again.
        var reasons = await Js<string[]>(s, "WP.player.policy.reasons") ?? [];
        Check("power after reload", back && reasons.Contains("remote desktop") == app.Power.State.Remote, $"page reasons [{string.Join(", ", reasons)}]");
    }

    // ---- The screen saver (§10.25.12) ----------------------------------------------------------

    /// `/s` with `--saver-window`: harness windows inside the primary work area's top-left (two side by
    /// side when asked), never full screen. Only ever posted to once confirmed as this child's.
    Process StartSaver(int count, string extraArgs = "")
    {
        var real = N.Monitors();
        var work = (real.FirstOrDefault(m => m.Primary) ?? real[0]).Work;
        var rects = string.Join(";", Enumerable.Range(0, count).Select(i => FormattableString.Invariant($"{work.Left + 40 + i * 480},{work.Top + 40},480,270")));
        return Process.Start(Environment.ProcessPath!, $"/s --selftest --saver-window {rects} {extraArgs}".TrimEnd())!;
    }

    /// The child's own state file (one from an earlier child doesn't count).
    SaverState? ReadState(Process child) => SaverState.Read(app.Paths.SaverStateFile) is { } s && s.Pid == child.Id ? s : null;

    static List<IntPtr> SaverWindows(Process child)
    {
        var found = new List<IntPtr>();
        N.EnumWindows((h, _) => { if (N.PidOf(h) == child.Id && N.TextOf(h) == SaverWindow.Caption) found.Add(h); return true; }, IntPtr.Zero);
        return found;
    }

    static IntPtr LParam(int x, int y) => (IntPtr)((y << 16) | (x & 0xFFFF));

    /// The cursor's point in that window's client px (where a real move would land).
    static (int X, int Y) CursorIn(IntPtr window)
    {
        N.GetCursorPos(out var p);
        var r = new N.RECT { L = p.X, T = p.Y, R = p.X, B = p.Y };
        N.MapWindowPoints(IntPtr.Zero, window, ref r, 2);
        return (r.L, r.T);
    }

    static string Describe(SaverState? s) => s == null ? "no state" : $"ended {s.Ended ?? "no"}; " + string.Join("; ", s.Windows.Select(w =>
        $"{w.Key} {w.Wallpaper ?? "-"} frames {w.Frames} rotations {w.Rotations}{(w.Fallback ? " fallback" : "")} steps [{string.Join(",", w.Steps)}]"));

    async Task SaverAsync(Surface first)
    {
        var before = app.Settings.Saver;
        app.SaveSettings(app.Settings with { Saver = new(SaverShow.Different, null, 5, true) });
        try
        {
            await SaverRunAsync(first);
            await SaverInputAsync("key", w => N.PostMessage(w, N.WM_KEYDOWN, N.VK_SPACE, IntPtr.Zero));
            await SaverInputAsync("click", w => N.PostMessage(w, N.WM_LBUTTONDOWN, 1, LParam(100, 100)));
            await SaverWatchdogAsync();
        }
        finally { app.SaveSettings(app.Settings with { Saver = before }); }
    }

    /// One run: it draws in both windows, two different wallpapers that rotate, the desktop hides while it
    /// runs; a move to where the cursor is doesn't end it, one 200 px away does, and the desktop comes back.
    async Task SaverRunAsync(Surface first)
    {
        using var child = StartSaver(2, "--saver-change-ms 2000");
        try
        {
            SaverState? a = null, b = null;
            var drawing = await Until(20000, async () =>
            {
                a = ReadState(child);
                if (a is not { Windows.Count: 2 } || a.Windows.Any(w => w.Wallpaper == null || w.Frames <= 0)) return false;
                await Wait(2000);
                b = ReadState(child);
                return b is { Windows.Count: 2 } && b.Windows.Zip(a.Windows).All(p => p.First.Frames - p.Second.Frames > 20);
            }, 500);
            var wallpapers = b?.Windows.Select(w => w.Wallpaper).ToList() ?? [];
            Check("saver run", drawing && b!.Windows.All(w => w.Url.Contains("host=windows-saver") && w.Url.Contains("clock=drift"))
                && wallpapers.All(id => id != null && !SaverPicker.Never.Contains(id)) && wallpapers.Distinct().Count() == 2,
                $"{(drawing ? "both windows drawing" : "NOT drawing in 20 s")}; {Describe(b ?? a ?? ReadState(child))}");

            // Chromium's input window over the saver would take the real moves and clicks this check posts past.
            var overlays = Overlays();
            var blocking = overlays.Where(h => (N.ExStyle(h) & N.WS_EX_TRANSPARENT) == 0).ToList();
            Check("saver overlay", blocking.Count == 0, $"{overlays.Count} overlay window(s) while the saver runs, {(blocking.Count == 0 ? "all click-through" : $"{blocking.Count} NOT click-through")}");

            var hid = await Until(6000, () => Task.FromResult(app.Power.State.SaverRunning && !first.Visible));
            var hideDetail = $"while it ran: {app.Power.State.Describe()}, desktop {(first.Visible ? "VISIBLE" : "hidden")}";

            SaverState? r = null;
            var rotated = await Until(8000, () => Task.FromResult((r = ReadState(child)) is { Windows.Count: 2 } s
                && s.Windows.All(w => w.Rotations >= 1) && s.Windows[0].Wallpaper != s.Windows[1].Wallpaper));
            Check("saver rotation", rotated, Describe(r));

            var windows = SaverWindows(child);
            if (windows.Count == 0) { Line("FAIL", "saver input (move)", "no saver window of the child's"); return; }
            var (x, y) = CursorIn(windows[0]);
            N.PostMessage(windows[0], N.WM_MOUSEMOVE, IntPtr.Zero, LParam(x, y));
            await Wait(1000);
            var stayed = !child.HasExited;
            N.PostMessage(windows[0], N.WM_MOUSEMOVE, IntPtr.Zero, LParam(x + 200, y));
            var exited = await Until(3000, () => Task.FromResult(child.HasExited), 100);
            var state = ReadState(child);
            Check("saver input (move)", stayed && exited && child.ExitCode == 0 && state?.Ended == "move",
                $"a move at the cursor: {(stayed ? "still running" : "ENDED it")}; 200 px away: {(exited ? $"exit {child.ExitCode}" : "STILL running after 3 s")}, ended {state?.Ended ?? "?"}");

            var back = await Until(6000, () => Task.FromResult(!app.Power.State.SaverRunning && first.Visible));
            Check("saver hides the desktop", hid && back,
                $"{hideDetail}; after: {app.Power.State.Describe()}, desktop {(first.Visible ? "visible" : "STILL hidden")}");
        }
        finally { if (!child.HasExited) child.Kill(); }
    }

    /// A fresh run, once its page draws (so a live web view is under the input), then one input message:
    /// it exits at once, cleanly, saying why.
    async Task SaverInputAsync(string kind, Action<IntPtr> send)
    {
        var name = $"saver input ({kind})";
        using var child = StartSaver(1);
        try
        {
            var windows = new List<IntPtr>();
            if (!await Until(15000, () => Task.FromResult(ReadState(child) is { Windows: [{ Frames: > 0 }] } && (windows = SaverWindows(child)).Count > 0)))
            {
                Line("FAIL", name, $"the saver's page never drew; {Describe(ReadState(child))}");
                return;
            }
            send(windows[0]);
            var exited = await Until(3000, () => Task.FromResult(child.HasExited), 100);
            var state = ReadState(child);
            Check(name, exited && child.ExitCode == 0 && state?.Ended == kind,
                $"{(exited ? $"exit {child.ExitCode}" : "STILL running after 3 s")}, ended {state?.Ended ?? "?"}");
        }
        finally { if (!child.HasExited) child.Kill(); }
    }

    /// --saver-stall: the counter never answers, so reload, recreate, the clock and a retry come in order.
    async Task SaverWatchdogAsync()
    {
        using var child = StartSaver(1, "--saver-stall");
        try
        {
            var fallback = false;
            SaverState? s = null;
            string[] want = ["reload", "recreate", "fallback", "retry"];
            var stepped = await Until(25000, () =>
            {
                s = ReadState(child);
                fallback |= s is { Windows: [{ Fallback: true }] };
                return Task.FromResult(s is { Windows: [var w] } && w.Steps.Count >= 4 && w.Steps.Take(4).SequenceEqual(want));
            }, 250);
            foreach (var w in SaverWindows(child)) N.PostMessage(w, N.WM_KEYDOWN, N.VK_SPACE, IntPtr.Zero);
            var exited = await Until(3000, () => Task.FromResult(child.HasExited), 100);
            Check("saver watchdog", stepped && fallback && exited,
                $"{Describe(s)}; {(fallback ? "seen in fallback" : "NEVER in fallback")}; {(exited ? "a key ended it" : "a key did NOT end it")}");
        }
        finally { if (!child.HasExited) child.Kill(); }
    }

    /// --selftest --bad-web-root: the app must say what's wrong, draw nothing, and keep its tray.
    async Task BadWebRootAsync()
    {
        await Wait(3000);
        var problem = app.Problem;
        var named = problem != null && problem.Contains(app.Paths.WebRoot, StringComparison.OrdinalIgnoreCase);
        Check("web root", named && app.Desktop.Surfaces.Count == 0 && app.Tray.Visible,
            $"{problem ?? "no problem reported"}; {app.Desktop.Surfaces.Count} surface(s); tray {(app.Tray.Visible ? "shown" : "MISSING")}");
    }
}
