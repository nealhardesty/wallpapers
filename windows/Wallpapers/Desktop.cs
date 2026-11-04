using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;

namespace Wallpapers;

/// The wallpaper on every monitor (SPEC §10.25.6, Same mode): one Surface per monitor, rebuilt when
/// the displays change, re-bound when Explorer restarts, watched every 5 s, cleaned up on the way out.
sealed class Desktop : IDisposable
{
    readonly AppPaths paths;
    readonly DesktopLayer layer;
    readonly BingJson bing = new();
    readonly List<Surface> surfaces = [];
    readonly System.Windows.Forms.Timer watch = new() { Interval = 5000 };
    readonly System.Windows.Forms.Timer debounce = new() { Interval = 500 };
    CoreWebView2Environment? env;
    bool building, rebuildAgain, restarting, disposed;

    public IReadOnlyList<Surface> Surfaces => surfaces;
    public CoreWebView2Environment? Environment => env;
    public BingJson Bing => bing;
    public bool Paused { get; private set; }
    /// Why the desktop can't be drawn (no WebView2 runtime, no layer), for the tray to say.
    public string? Problem { get; private set; }
    public event Action? Changed;

    public Desktop(AppPaths paths, DesktopLayer layer)
    {
        this.paths = paths;
        this.layer = layer;
        watch.Tick += (_, _) => Watch();
        debounce.Tick += async (_, _) => { debounce.Stop(); await RebuildAsync("displays changed"); };
        layer.DisplayChanged += ScheduleRebuild;
        layer.ShellRestarted += () => _ = OnShellRestartedAsync();
    }

    public async Task StartAsync()
    {
        try { env = await WebFactory.CreateAsync(paths); }
        catch (WebView2RuntimeNotFoundException)
        {
            Fail("The Microsoft Edge WebView2 Runtime isn't installed. It comes with Windows 11; get it from Microsoft's WebView2 page.");
            return;
        }
        Log.Info($"webview2 runtime {env.BrowserVersionString}");
        // At login Explorer may not be ready: retry with backoff for a minute, then wait for TaskbarCreated (§10.25.5).
        foreach (var delay in new[] { 0, 1, 2, 4, 8, 15, 30 })
        {
            if (disposed) return;
            if (delay > 0) await Task.Delay(TimeSpan.FromSeconds(delay));
            if (layer.Prepare()) { await BuildAsync(); watch.Start(); return; }
            if (layer.Shape.Kind == ShapeKind.NotSplit)
            {
                Fail("This version of Windows has no desktop layer behind the icons. Troubleshooting → Draw Above Icons draws over them instead.");
                return;
            }
        }
        Log.Warn("layer: Explorer's desktop isn't there after a minute; waiting for it to start");
        watch.Start();
    }

    void Fail(string problem)
    {
        Problem = problem;
        Log.Error(problem);
        Changed?.Invoke();
    }

    async Task BuildAsync()
    {
        if (env == null) return;
        if (building) { rebuildAgain = true; return; }
        building = true;
        try
        {
            do
            {
                rebuildAgain = false;
                foreach (var plan in Layout.Plan(N.Monitors()))
                {
                    var surface = new Surface(plan, layer.CreateHost(plan));
                    surface.Lost += s => { Log.Warn($"surface {s.Plan.Device}: browser process lost; rebuilding"); ScheduleRebuild(); };
                    surfaces.Add(surface);
                    await surface.StartAsync(env, paths, bing);
                    if (Paused) await surface.SetVisibleAsync(false);
                }
                FixOverlay();
            } while (rebuildAgain && !disposed && await TearDown());
            Problem = null;
            Changed?.Invoke();
        }
        catch (Exception e) when (e is COMException or InvalidOperationException or ArgumentException)
        {
            Log.Error($"desktop: couldn't build the surfaces: {e}");
        }
        finally { building = false; }
    }

    /// Displays, DPI or the taskbar changed: rebuild once things settle (500 ms).
    public void ScheduleRebuild()
    {
        debounce.Stop();
        debounce.Start();
    }

    public async Task RebuildAsync(string why)
    {
        if (disposed || env == null) return;
        if (building) { rebuildAgain = true; return; }
        Log.Info($"desktop: rebuilding ({why})");
        await TearDown();
        if (layer.Prepare()) await BuildAsync();
    }

    async Task<bool> TearDown()
    {
        foreach (var s in surfaces) { s.Dispose(); layer.DestroyHost(s.Host); }
        surfaces.Clear();
        await Task.Yield();
        return true;
    }

    /// Explorer started again: our hosts died with it. Find the new layer, give every surface a new
    /// host and re-bind its visual; the pages keep running (§10.25.5).
    public async Task OnShellRestartedAsync()
    {
        if (restarting || disposed || env == null) return;
        restarting = true;
        try
        {
            for (var i = 0; i < 20 && !layer.Prepare(); i++) await Task.Delay(500);
            if (DesktopShape.AttachTarget(layer.Shape).Parent == 0 && !layer.DrawAboveIcons) { Log.Warn("shell restart: no layer yet"); return; }
            if (surfaces.Count == 0) { await BuildAsync(); watch.Start(); return; }
            foreach (var s in surfaces)
            {
                layer.DestroyHost(s.Host);   // normally already gone with Explorer
                s.Rebind(layer.CreateHost(s.Plan));
            }
            FixOverlay();
        }
        finally { restarting = false; }
    }

    void Watch()
    {
        if (surfaces.Count == 0) return;
        if (!layer.ParentAlive) { Log.Warn("watch: the layer's parent is gone"); _ = OnShellRestartedAsync(); return; }
        foreach (var s in surfaces) layer.CheckAndRepair(s.Host);
        FixOverlay();
    }

    /// WebView2's visual hosting makes a full-screen, alpha-0 top-level input window over the desktop;
    /// it must be click-through or it can swallow clicks meant for the icons (W0.2, W0.4; §10.25.8).
    public void FixOverlay()
    {
        if (env == null) return;
        var pids = env.GetProcessInfos().Select(p => p.ProcessId).ToHashSet();
        N.EnumWindows((h, _) =>
        {
            if (N.IsWindowVisible(h) && pids.Contains(N.PidOf(h)) && N.ClassOf(h) == "Chrome_WidgetWin_1")
            {
                var ex = N.ExStyle(h);
                if ((ex & N.WS_EX_LAYERED) != 0 && (ex & N.WS_EX_TRANSPARENT) == 0)
                {
                    N.SetWindowLongPtr(h, N.GWL_EXSTYLE, (IntPtr)(ex | N.WS_EX_TRANSPARENT));
                    Log.Info($"overlay: made {h:X} click-through");
                }
            }
            return true;
        }, IntPtr.Zero);
    }

    public async Task SetPausedAsync(bool paused)
    {
        Paused = paused;
        foreach (var s in surfaces) await s.SetVisibleAsync(!paused);
        Log.Info(paused ? "paused" : "resumed");
        Changed?.Invoke();
    }

    public async Task RunEverywhereAsync(string js)
    {
        foreach (var s in surfaces) await s.EvalAsync(js);
    }

    public async Task<string?> EvalFirstAsync(string js) => surfaces.Count == 0 ? null : await surfaces[0].EvalAsync(js);

    public void ReloadAll()
    {
        Log.Info("reloading every surface");
        foreach (var s in surfaces) s.Reload();
    }

    /// For the self-test: what Explorer's death does to our hosts, without touching Explorer.
    internal void DestroyHostsForTest()
    {
        foreach (var s in surfaces) layer.DestroyHost(s.Host);
    }

    public void Dispose()
    {
        if (disposed) return;
        disposed = true;
        watch.Stop();
        debounce.Stop();
        foreach (var s in surfaces) { s.Dispose(); layer.DestroyHost(s.Host); }
        surfaces.Clear();
        Shell.Repaint();
    }
}
