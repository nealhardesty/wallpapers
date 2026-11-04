using System.Text.Json;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;

namespace Wallpapers;

/// The wallpaper on every monitor (SPEC §10.25.6): one Surface per monitor, in Same or Different mode.
/// When the displays change the surfaces are reconciled (kept ones move, new monitors get one, gone
/// ones are disposed); re-bound when Explorer restarts, watched every 5 s, cleaned up on the way out.
/// With WP_FAKE_DISPLAYS the monitors come from a JSON file instead, in ordinary windows (§10.25.15).
sealed class Desktop : IDisposable
{
    readonly AppPaths paths;
    readonly DesktopLayer layer;
    readonly Power power;
    readonly Coverage coverage;
    readonly BingJson bing = new();
    readonly List<Surface> surfaces = [];
    readonly System.Windows.Forms.Timer watch = new() { Interval = 5000 };
    readonly System.Windows.Forms.Timer debounce = new() { Interval = 500 };
    readonly string? fakeFile = System.Environment.GetEnvironmentVariable("WP_FAKE_DISPLAYS") is { Length: > 0 } f ? Path.GetFullPath(f) : null;
    readonly FileSystemWatcher? fakeWatcher;
    IReadOnlyList<MonitorInfo>? testLayout, lastFakeFile;
    CoreWebView2Environment? env;
    /// The surfaces' hosts are fake windows (a switch to or from a fake layout starts them over).
    bool hostsFake;
    bool building, reconcileAgain, rebuildAgain, rebuildPending, restarting, disposed;
    /// Completes when the running pass, and any passes asked for during it, are done: a caller that
    /// arrives mid-pass awaits this, so awaiting ReconcileAsync or RebuildAsync means the layout is in place.
    TaskCompletionSource passDone = new(TaskCreationOptions.RunContinuationsAsynchronously);

    public IReadOnlyList<Surface> Surfaces => surfaces;
    public CoreWebView2Environment? Environment => env;
    readonly TaskCompletionSource<CoreWebView2Environment?> envReady = new();
    /// The environment once StartAsync has made it (null if it couldn't), for the settings window.
    public Task<CoreWebView2Environment?> EnvironmentReady => envReady.Task;
    public BingJson Bing => bing;
    public bool Paused { get; private set; }
    /// Whether a monitor (by key) is covered by other windows: Coverage's, set in the constructor (§10.25.9).
    public Func<string, bool> Covered { get; set; } = _ => false;
    public MonitorMode Mode { get; private set; }
    /// The monitors are a fake layout (WP_FAKE_DISPLAYS, or the self-test's), in ordinary windows.
    public bool Fake => testLayout != null || fakeFile != null;
    /// Surfaces are being made: the list may not have every monitor yet.
    public bool Building => building;
    /// Why the desktop can't be drawn (no WebView2 runtime, no layer), for the tray to say.
    public string? Problem { get; private set; }
    public event Action? Changed;
    /// A surface's page finished loading: the tray can ask it for the catalog.
    public event Action? PageReady;

    public Desktop(AppPaths paths, DesktopLayer layer, MonitorMode mode, Power power)
    {
        this.paths = paths;
        this.layer = layer;
        this.power = power;
        Mode = mode;
        watch.Tick += (_, _) => Watch();
        debounce.Tick += async (_, _) =>
        {
            debounce.Stop();
            if (rebuildPending) { rebuildPending = false; await RebuildAsync("surface lost or host kind changed"); }
            else await ReconcileAsync("displays changed");
        };
        layer.DisplayChanged += ScheduleReconcile;
        layer.ShellRestarted += () => _ = OnShellRestartedAsync();
        // Our WebView2 processes' windows are ours too; coverage is off for fake layouts (§10.25.9).
        coverage = new Coverage(() => env?.GetProcessInfos().Select(p => p.ProcessId) ?? []);
        Covered = coverage.IsCovered;
        coverage.Changed += () => _ = ApplyPowerAsync();
        if (fakeFile == null) coverage.Start(() => Fake ? [] : surfaces.Select(s => s.Plan).ToList());
        if (fakeFile != null)
        {
            Log.Info($"displays: fake, from {fakeFile} (WP_FAKE_DISPLAYS)");
            // An edit is a hot-plug. Editors save in place or by renaming a new file over the old one.
            var ui = SynchronizationContext.Current;
            fakeWatcher = new FileSystemWatcher(Path.GetDirectoryName(fakeFile)!, Path.GetFileName(fakeFile))
            {
                NotifyFilter = NotifyFilters.LastWrite | NotifyFilters.FileName | NotifyFilters.Size,
            };
            FileSystemEventHandler changed = (_, _) => ui?.Post(_ => ScheduleReconcile(), null);
            fakeWatcher.Changed += changed;
            fakeWatcher.Created += changed;
            fakeWatcher.Renamed += (_, _) => ui?.Post(_ => ScheduleReconcile(), null);
            fakeWatcher.EnableRaisingEvents = true;
        }
    }

    public async Task StartAsync()
    {
        try { env = await WebFactory.CreateAsync(paths); }
        catch (WebView2RuntimeNotFoundException)
        {
            envReady.TrySetResult(null);
            Fail("The Microsoft Edge WebView2 Runtime isn't installed. It comes with Windows 11; get it from Microsoft's WebView2 page.");
            return;
        }
        Log.Info($"webview2 runtime {env.BrowserVersionString}");
        envReady.TrySetResult(env);
        // At login Explorer may not be ready: retry with backoff for a minute, then wait for TaskbarCreated (§10.25.5).
        foreach (var delay in new[] { 0, 1, 2, 4, 8, 15, 30 })
        {
            if (disposed) return;
            if (delay > 0) await Task.Delay(TimeSpan.FromSeconds(delay));
            if (Fake || layer.Prepare()) { await ReconcileAsync("start"); watch.Start(); return; }
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

    /// The monitors now: the fake layout when there is one, else Windows' (with paths and names).
    public IReadOnlyList<MonitorInfo> CurrentMonitors()
    {
        if (testLayout != null) return testLayout;
        if (fakeFile == null) return N.Monitors();
        try { lastFakeFile = Displays.FromJson(File.ReadAllText(fakeFile)); }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or JsonException or FormatException)
        {
            // Mid-save, or a typo: keep what was there until the next edit.
            Log.Warn($"displays: can't read {fakeFile} ({e.Message}); keeping the last layout");
        }
        return lastFakeFile ?? [];
    }

    /// Where each surface's host goes: on its monitor, or for a fake layout, fitted to the real primary
    /// monitor's work area with the page's scale shrunk to match.
    IReadOnlyDictionary<string, HostPlacement> Placements(IReadOnlyList<SurfacePlan> plans)
    {
        if (!Fake) return plans.ToDictionary(p => p.Key, p => new HostPlacement(p.Bounds, p.Scale));
        var real = N.Monitors();
        return FakeLayout.Fit(plans, (real.FirstOrDefault(m => m.Primary) ?? real[0]).Work);
    }

    string UrlFor(SurfacePlan plan) => PageUrl.Desktop(plan.Insets, Mode == MonitorMode.Different ? plan.Key : null);

    /// Displays, DPI or the taskbar changed (or the fake file did): reconcile once things settle (500 ms).
    public void ScheduleReconcile()
    {
        debounce.Stop();
        debounce.Start();
    }

    /// The surfaces can't be kept (a browser process died, the host kind changed): rebuild once things settle.
    public void ScheduleRebuild()
    {
        rebuildPending = true;
        ScheduleReconcile();
    }

    /// Everything starts over: every host and page is made again. Only for a change of host kind
    /// (Draw Above Icons) or a lost browser; a display change reconciles instead.
    public async Task RebuildAsync(string why)
    {
        if (disposed || env == null) return;
        if (building) { rebuildAgain = true; await passDone.Task; return; }
        Log.Info($"desktop: rebuilding ({why})");
        await TearDown();
        // Also the way out of a failed start: ticking Draw Above Icons on a Windows build with no
        // layer behind the icons lands here, so the 5 s watch starts with the first surfaces.
        if (Fake || layer.Prepare()) { await ReconcileAsync(why); if (surfaces.Count > 0) watch.Start(); }
    }

    /// Brings the surfaces in line with the monitors, keeping every page that can be kept (§10.25.6):
    /// removed monitors lose theirs, kept ones move and resize in place (navigating only when the URL
    /// changes), new ones get one. A request during a pass runs another pass after it.
    public async Task ReconcileAsync(string why)
    {
        if (disposed || env == null) return;
        if (building) { reconcileAgain = true; await passDone.Task; return; }
        building = true;
        var done = passDone = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        try
        {
            do
            {
                if (rebuildAgain) { Log.Info("desktop: rebuilding (asked for during a pass)"); await TearDown(); }
                reconcileAgain = rebuildAgain = false;
                await ReconcileOnceAsync(why);
                why = "changed again during the last pass";
            } while ((reconcileAgain || rebuildAgain) && !disposed);
            Problem = null;
        }
        catch (Exception e) when (e is COMException or InvalidOperationException or ArgumentException)
        {
            Log.Error($"desktop: couldn't reconcile the surfaces: {e}");
        }
        finally
        {
            // Whatever ended the pass (even an exception the filter lets through), its waiters go on.
            building = false;
            done.TrySetResult();
            Changed?.Invoke();
        }
    }

    async Task ReconcileOnceAsync(string why)
    {
        if (surfaces.Count > 0 && hostsFake != Fake)
        {
            Log.Info($"reconcile: {(Fake ? "real → fake" : "fake → real")} monitors; starting over");
            await TearDown();
        }
        if (surfaces.Count == 0) hostsFake = Fake;
        var plans = Layout.Plan(CurrentMonitors());
        var where = Placements(plans);
        var change = Layout.Diff(surfaces.Select(s => s.Plan).ToList(), plans);
        Log.Info($"reconcile ({why}): {plans.Count} monitor(s){(Fake ? " (fake)" : "")}, {change.Kept.Count} kept, {change.Added.Count} added, {change.Removed.Count} removed");
        foreach (var gone in change.Removed)
        {
            var s = surfaces.First(x => x.Plan.Key == gone.Key);
            surfaces.Remove(s);
            s.Dispose();
            layer.DestroyHost(s.Host);
            Log.Info($"reconcile: removed {gone.Key}");
        }
        foreach (var (old, plan) in change.Kept)
        {
            var s = surfaces.First(x => x.Plan.Key == old.Key);
            var placement = where[plan.Key];
            var notes = new List<string>();
            if (Layout.Moved(old, plan) || s.Placement != placement)
            {
                layer.MoveHost(s.Host, placement.Screen);
                // A fake monitor can stay put while its window moves (the layout's fit changed).
                notes.Add(Layout.Moved(old, plan) ? $"moved {Size(old)} → {Size(plan)}"
                    : $"window to {placement.Screen.Left},{placement.Screen.Top} {placement.Screen.Width}x{placement.Screen.Height} scale {placement.RasterizationScale:0.###}");
            }
            s.Resize(plan, placement);   // also takes the new plan's number and name
            if (Layout.NeedsNavigate(old, plan))
            {
                s.Navigate(UrlFor(plan));
                notes.Add($"insets {old.Insets.ToParam()} → {plan.Insets.ToParam()}");
            }
            Log.Info($"reconcile: kept {plan.Key}{(notes.Count > 0 ? $" ({string.Join(", ", notes)})" : " (unchanged)")}");
        }
        foreach (var plan in change.Added)
        {
            var placement = where[plan.Key];
            var surface = new Surface(plan, placement, hostsFake ? layer.CreateFakeHost(plan, placement) : layer.CreateHost(plan));
            surface.Lost += s => { Log.Warn($"surface {s.Plan.Key}: browser process lost; rebuilding"); ScheduleRebuild(); };
            surface.Loaded += _ => PageReady?.Invoke();
            surfaces.Add(surface);
            Log.Info($"reconcile: added {plan.Key} (monitor {plan.Number}, {plan.Device}, {Size(plan)})");
            var url = UrlFor(plan);
            try { await surface.StartAsync(env!, paths, bing, url); }
            catch (Exception e) when (e is COMException or InvalidOperationException or ArgumentException)
            {
                // Not kept as a dead surface: the next reconcile (any display change) adds it again.
                Log.Error($"reconcile: couldn't start {plan.Key}; dropped until the next change: {e}");
                surfaces.Remove(surface);
                surface.Dispose();
                layer.DestroyHost(surface.Host);
                continue;
            }
            if (UrlFor(plan) != url) surface.Navigate(UrlFor(plan));   // the mode changed while it started
            // A page that starts while locked or paused doesn't draw. IsVisible is set now; the page is
            // told when it loads, so the pass doesn't wait on a script.
            _ = ApplyPowerAsync(surface);
        }
        // Monitor 1 first: it's the one Next and Previous step, and the tray asks.
        surfaces.Sort((a, b) => a.Plan.Number.CompareTo(b.Plan.Number));
        FixOverlay();
    }

    static string Size(SurfacePlan p) => $"{p.Bounds.Width}x{p.Bounds.Height}{(p.Scale != 1 ? $"@{p.Scale:0.##}" : "")}";

    /// Same or Different (§10.25.6): every page navigates to its URL for the new mode; no host is
    /// made again. Saving the choice to settings.json is the caller's job (the tray's).
    public Task SetModeAsync(MonitorMode mode)
    {
        if (mode == Mode) return Task.CompletedTask;
        Mode = mode;
        Log.Info($"monitors: {mode.ToString().ToLowerInvariant()}");
        foreach (var s in surfaces) s.Navigate(UrlFor(s.Plan));
        Changed?.Invoke();
        return Task.CompletedTask;
    }

    /// For the self-test: a fake layout in memory (null: back to the real monitors, or WP_FAKE_DISPLAYS),
    /// reconciled at once, without the debounce.
    internal Task UseFakeDisplaysForTest(IReadOnlyList<MonitorInfo>? layout)
    {
        testLayout = layout;
        return ReconcileAsync(layout == null ? "self-test: real monitors" : "self-test: fake layout");
    }

    /// For the self-test: coverage reads the windows now instead of at its next 2 s poll.
    internal void ReadCoverageForTest() => coverage.Read();

    /// For the self-test's coverage check: coverage decides visibility again (after CoverageOffForTest).
    internal Task CoverageOnForTest()
    {
        Covered = coverage.IsCovered;
        coverage.Read();
        return ApplyPowerAsync();
    }

    /// For the self-test: it counts frames, and the terminal it runs from may be maximized over the
    /// desktop. Returns the keys coverage had hidden.
    internal async Task<List<string>> CoverageOffForTest()
    {
        var covered = surfaces.Select(s => s.Plan.Key).Where(Covered).ToList();
        Covered = _ => false;
        await ApplyPowerAsync();
        return covered;
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
        // Fake hosts are ordinary windows: they don't die with Explorer.
        if (hostsFake && surfaces.Count > 0) { Log.Info("shell restart: the hosts are fake windows; nothing to re-bind"); return; }
        restarting = true;
        try
        {
            for (var i = 0; i < 20 && !layer.Prepare(); i++) await Task.Delay(500);
            if (DesktopShape.AttachTarget(layer.Shape).Parent == 0 && !layer.DrawAboveIcons) { Log.Warn("shell restart: no layer yet"); return; }
            if (surfaces.Count == 0) { await ReconcileAsync("shell restarted"); watch.Start(); return; }
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
        if (!hostsFake)
        {
            if (!layer.ParentAlive) { Log.Warn("watch: the layer's parent is gone"); _ = OnShellRestartedAsync(); return; }
            foreach (var s in surfaces) layer.CheckAndRepair(s.Host);
        }
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
        Log.Info(paused ? "paused" : "resumed");
        await ApplyPowerAsync();
        Changed?.Invoke();
    }

    /// Pause, power and coverage, to every page (§10.25.9): a surface is visible when not paused, not
    /// hidden everywhere and not covered; each page gets `WP.power` with the rest. Call it whenever
    /// any of them changes. Every surface's IsVisible is set before any script is awaited, so one
    /// slow or closing page can't hold the others in the wrong state.
    public Task ApplyPowerAsync() => Task.WhenAll(surfaces.ToList().Select(ApplyPowerAsync));

    Task ApplyPowerAsync(Surface s)
    {
        var state = power.State;
        var visible = !Paused && !state.HiddenEverywhere && !Covered(s.Plan.Key);
        return s.ApplyPowerAsync(visible, PowerJson.For(state, hidden: !visible));
    }

    /// A pick, saved so the next start shows it too: on one monitor (by key), or on every one (null).
    /// In Same mode a pick on one reaches the others through `wp:current`.
    public async Task ShowAsync(string id, string? key = null)
    {
        foreach (var s in surfaces.Where(s => key == null || s.Plan.Key == key)) await s.EvalAsync(ShowScript(id));
    }

    static string ShowScript(string id) =>
        $"window.WP && WP.player && WP.player.show({JsonSerializer.Serialize(id)}, {{ persist: true }})";

    /// Next or Previous, on one monitor (by key) or all (null). In Different mode each page steps its
    /// own choice. In Same mode one page steps (and says what's next in its toast) and the others are
    /// told the result: stepping each would race, as the first's save reaches the others as a storage
    /// event and a page that had already followed it would step one further.
    public async Task CycleAsync(int step, string? key = null)
    {
        var script = $"window.WP && WP.player ? (WP.player.cycle({step}), WP.player.choice) : null";
        if (Mode == MonitorMode.Different)
        {
            foreach (var s in surfaces.Where(s => key == null || s.Plan.Key == key)) await s.EvalAsync(script);
            return;
        }
        if (surfaces.FirstOrDefault(s => key == null || s.Plan.Key == key) is not { } first) return;
        var raw = await first.EvalAsync(script);
        if (JsonSerializer.Deserialize<string?>(raw) is not { } id) return;
        foreach (var s in surfaces.Where(s => s != first)) await s.EvalAsync(ShowScript(id));
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
        envReady.TrySetResult(null);   // a settings window still waiting gives up
        watch.Stop();
        debounce.Stop();
        coverage.Dispose();
        fakeWatcher?.Dispose();
        foreach (var s in surfaces) { s.Dispose(); layer.DestroyHost(s.Host); }
        surfaces.Clear();
        Shell.Repaint();
    }
}
