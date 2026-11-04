using System.Diagnostics;
using System.Drawing;
using System.Text.Json;
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
    const int TimeoutSeconds = 150;
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

    static async Task<bool> Until(int ms, Func<Task<bool>> condition)
    {
        var clock = Stopwatch.StartNew();
        while (clock.ElapsedMilliseconds < ms)
        {
            if (await condition()) return true;
            await Wait(200);
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

        if (!await Until(30000, () => Task.FromResult(desktop.Surfaces.Count > 0 || desktop.Problem != null)) || desktop.Surfaces.Count == 0)
        {
            Line("FAIL", "start", desktop.Problem ?? "no surfaces after 30 s");
            return;
        }
        var surfaces = desktop.Surfaces.ToList();

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

        // 4. Hidden stops frames outright; visible starts them again.
        await first.SetVisibleAsync(false);
        await Wait(300);
        var hidden = await FramesOver(first, 1500);
        var visibleFlag = first.Visible;
        await first.SetVisibleAsync(true);
        await Wait(500);
        var resumed = await FramesOver(first, 1500);
        Check("pause", hidden is >= 0 and <= 2 && !visibleFlag && resumed > 10, $"hidden {hidden} frames in 1.5 s (IsVisible={visibleFlag}); visible {resumed}");

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

        // 10. Cleanup leaves no host windows and none of our keepers.
        desktop.Dispose();
        await Wait(300);
        var hosts = DesktopLayer.Snapshot().Count(n => n.Class == DesktopLayer.HostClass) + N.TopLevel(DesktopLayer.HostClass).Count;
        var keepers = 0;
        var pid = Environment.ProcessId;
        N.EnumWindows((h, _) => { if (N.PidOf(h) == pid && N.TextOf(h) == "WallpapersKeeper") keepers++; return true; }, IntPtr.Zero);
        Check("cleanup", hosts == 0 && keepers == 0, $"{hosts} host window(s), {keepers} keeper(s) left");
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
