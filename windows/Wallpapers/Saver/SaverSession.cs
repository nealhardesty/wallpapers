using System.Globalization;
using System.Text.Json;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using PowerState = Wallpapers.Core.PowerState;   // WinForms has one too

namespace Wallpapers;

/// One /s run (SPEC §10.25.12): a window per monitor, one WebView2 environment for them all (the app's
/// user data folder, so the pages share its settings), pings that make the desktop app stand aside, and
/// one way out, End, whatever ended it. In the test flavour `--saver-window` puts it in harness windows
/// instead (not topmost, the cursor left alone, deactivation ignored).
sealed class SaverSession : ApplicationContext
{
    public AppPaths Paths { get; }
    public SaverSettings Settings { get; }
    /// A real run over the monitors (not the self-test's harness windows).
    public bool Real { get; }
    /// Test flavour: the watchdog's -1 every tick (--saver-stall).
    public bool Stall { get; }
    public CoreWebView2Environment? Environment { get; private set; }
    public BingJson Bing { get; } = new();
    /// Nothing can be seen (locked, display off, asleep, disconnected): the pages pause and the watchdog waits.
    public bool Hidden { get; private set; }
    /// What every page is told by WP.power.
    public string PowerArgument { get; private set; } = PowerJson.For(new PowerState(), hidden: false);

    readonly List<SaverWindow> windows = [];
    readonly Power power = new();
    readonly System.Windows.Forms.Timer pings = new() { Interval = 4000 }, rotation = new();
    readonly N.POINT start;
    readonly bool writeState;
    IReadOnlyList<string>? pool;
    bool ended;
    string? endedBy;
    Task sending = Task.CompletedTask;

    public SaverSession(AppPaths paths, string[] args)
    {
        Paths = paths;
        var test = paths.Flavor == "test";
        var app = AppSettings.Load(paths.SettingsFile);
        Settings = (app.Saver ?? new()).Normalized();   // a hand-edited "saver": null
        var harness = test ? Harness(args) : null;
        Real = harness == null;
        Stall = test && args.Contains("--saver-stall");
        writeState = test || Log.Verbose;
        rotation.Interval = test && Number(args, "--saver-change-ms") is { } ms ? ms : Settings.ChangeMinutes * 60_000;
        N.GetCursorPos(out start);

        var plans = harness?.Select((r, i) => new SurfacePlan($"harness-{i + 1}", "harness", $"Harness {i + 1}", i + 1, i == 0, r, r, 1.0, Insets.None)).ToList()
            ?? Layout.Plan(N.Monitors());
        foreach (var plan in plans)
        {
            var window = new SaverWindow(this, plan, UrlFor(Settings, app.Monitors, Real ? plan.Key : null, Settings.Clock))
            {
                Wallpaper = Settings.Show == SaverShow.One ? Settings.Wallpaper : null,
            };
            windows.Add(window);
            window.Show();
        }
        Log.Info($"saver: {Settings.Show} on {string.Join(", ", plans.Select(p => $"{p.Key} {p.Bounds.Width}x{p.Bounds.Height} at {p.Bounds.Left},{p.Bounds.Top}"))}"
            + $"{(Real ? "" : " (harness)")}{(Stall ? ", stalled" : "")}");
        if (Real)
        {
            Cursor.Hide();
            windows.FirstOrDefault()?.Activate();
        }

        power.Changed += ApplyPower;
        power.Start();
        ApplyPower();
        pings.Tick += (_, _) => Send("saver-on");
        pings.Start();
        Send("saver-on");
        rotation.Tick += (_, _) => Rotate();
        WriteState();
        _ = StartAsync();
    }

    async Task StartAsync()
    {
        var problem = Paths.CheckWebRoot();
        if (problem == null)
        {
            try
            {
                Environment = await WebFactory.CreateAsync(Paths);
                Log.Info($"saver: webview2 runtime {Environment.BrowserVersionString}");
            }
            catch (Exception e) when (e is WebView2RuntimeNotFoundException or COMException or ArgumentException)
            {
                problem = $"no WebView2 ({e.GetType().Name}: {e.Message})";
            }
        }
        if (ended) return;
        if (problem != null)
        {
            Log.Error($"saver: {problem}; showing the clock instead");
            foreach (var w in windows) w.ClockOnly();
            WriteState();
            return;
        }
        foreach (var w in windows) await w.StartAsync();
    }

    /// What a saver page loads (the preview's too, without the clock): Same shows the desktop's choice (its own
    /// monitor's, `display`, in Different monitor mode), One pins it, Different starts on Blank until it's told.
    public static string UrlFor(SaverSettings s, MonitorMode monitors, string? display, bool clock)
    {
        var key = s.Show == SaverShow.Same && monitors == MonitorMode.Different ? display : null;
        var wallpaper = s.Show switch { SaverShow.One => s.Wallpaper, SaverShow.Different => "blank", _ => null };
        return PageUrl.Saver(wallpaper, key, clock);
    }

    /// The mouse moved this far from where it was when the saver started (screen px).
    public bool MovedFromStart(int x, int y) => SaverInput.Moved(start.X, start.Y, x, y);

    /// A page (re)loaded. In Different mode it's told what to show once its player answers: the first
    /// time a pick that avoids the other monitors' wallpapers, after a reload the same one again.
    public async Task PageLoadedAsync(SaverWindow w)
    {
        if (Settings.Show != SaverShow.Different) return;
        string? json = null;
        for (var waited = 0; !ended && waited <= 15_000; waited += 500)
        {
            if ((json = await w.AskAsync(CatalogInfo.Script)) != null) break;
            await Task.Delay(500);
        }
        if (ended) return;
        if (json == null) { Log.Warn($"saver: {w.Plan.Key}: the page never said what it can show"); return; }
        if (pool == null)
        {
            try { pool = SaverPicker.Pool(CatalogInfo.Parse(json)); }
            catch (FormatException e) { Log.Warn($"saver: {w.Plan.Key}'s catalog: {e.Message}"); return; }
            Log.Info($"saver: {pool.Count} wallpaper(s) to pick from; a new one every {rotation.Interval / 1000.0:0.#} s");
            rotation.Start();
        }
        w.Wallpaper ??= SaverPicker.Pick(pool, windows.Where(o => o != w).Select(o => o.Wallpaper).OfType<string>().ToList(), Random.Shared);
        if (w.Wallpaper != null) await w.ShowWallpaperAsync(w.Wallpaper);
        WriteState();
    }

    /// Different mode, every Change Every: each monitor a new one, still unlike the others (and unlike its own last).
    void Rotate()
    {
        if (pool == null || ended) return;
        foreach (var w in windows)
        {
            var taken = windows.Select(o => o.Wallpaper).OfType<string>().ToList();
            w.Wallpaper = SaverPicker.Pick(pool, taken, Random.Shared);
            w.Rotations++;
            if (w.Wallpaper != null) _ = w.ShowWallpaperAsync(w.Wallpaper);
        }
        Log.Info($"saver: now {string.Join(", ", windows.Select(w => $"{w.Plan.Key} {w.Wallpaper}"))}");
        WriteState();
    }

    /// The saver's own hidden rule: not HiddenEverywhere, which counts this very saver (SaverRunning)
    /// and its full-screen windows (FullscreenApp).
    void ApplyPower()
    {
        var s = power.State;
        Hidden = s.Locked || (s.DisplayOff && !s.Remote) || s.Asleep || s.Disconnected;
        PowerArgument = PowerJson.For(s, Hidden);
        foreach (var w in windows) _ = w.ApplyPowerAsync();
    }

    /// In order, each after the last: a saver-on still on its way must not land after the saver-off.
    Task Send(string command)
    {
        var flavor = Paths.Flavor;
        return sending = sending.ContinueWith(_ => SingleInstance.Send(flavor, command), TaskScheduler.Default);
    }

    /// Idempotent: whatever ended it (input, a close), everything goes at once. The windows go just
    /// after, off the window procedure that called this.
    public void End(string why)
    {
        if (ended) return;
        ended = true;
        endedBy = why;
        Log.Info($"saver: ended by {why}");
        WriteState();
        var off = Send("saver-off");
        SynchronizationContext.Current!.Post(_ => Teardown(off), null);
    }

    void Teardown(Task off)
    {
        pings.Stop();
        rotation.Stop();
        foreach (var w in windows)
        {
            try { w.Dispose(); }
            catch (Exception e) when (e is COMException or InvalidOperationException) { Log.Warn($"saver: {w.Plan.Key}: {e.Message}"); }
        }
        power.Dispose();
        if (Real) Cursor.Show();
        // The desktop comes back now rather than when the lease lapses; a missing app mustn't hold us up.
        try { off.Wait(1500); } catch (AggregateException) { }
        ExitThread();
    }

    /// The unhandled-exception path: the process exits right after this.
    public void Crashed()
    {
        try
        {
            endedBy = "error";
            WriteState();
            Send("saver-off").Wait(1500);
        }
        catch (Exception e) when (e is IOException or AggregateException or InvalidOperationException) { }
    }

    /// The state file (SPEC §10.25.12), in the test flavour or with WP_DEBUG: after every watchdog tick,
    /// on every step and at exit.
    public void WriteState()
    {
        if (!writeState) return;
        var state = new SaverState(System.Environment.ProcessId, "run", endedBy, windows.Select(w => w.State()).ToList());
        try { state.Write(Paths.SaverStateFile); }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException) { Log.Debug($"saver: state: {e.Message}"); }
    }

    /// --saver-window L,T,W,H[;L,T,W,H…] (test flavour): harness windows instead of the monitors.
    static List<Rect>? Harness(string[] args)
    {
        var i = Array.IndexOf(args, "--saver-window");
        if (i < 0 || i + 1 >= args.Length) return null;
        return args[i + 1].Split(';', StringSplitOptions.RemoveEmptyEntries).Select(r =>
        {
            var n = r.Split(',').Select(v => int.Parse(v, CultureInfo.InvariantCulture)).ToArray();
            return new Rect(n[0], n[1], n[0] + n[2], n[1] + n[3]);
        }).ToList();
    }

    static int? Number(string[] args, string name)
    {
        var i = Array.IndexOf(args, name);
        return i >= 0 && i + 1 < args.Length && int.TryParse(args[i + 1], NumberStyles.None, CultureInfo.InvariantCulture, out var n) && n > 0 ? n : null;
    }
}

/// saver-state.json, camelCase: what each window shows and what its watchdog did.
sealed record SaverState(int Pid, string Mode, string? Ended, IReadOnlyList<SaverWindowState> Windows)
{
    static readonly JsonSerializerOptions Options = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    /// To a temporary file, then moved over the old one: a reader never sees half of it.
    public void Write(string path)
    {
        var temp = path + ".tmp";
        File.WriteAllText(temp, JsonSerializer.Serialize(this, Options));
        File.Move(temp, path, overwrite: true);
    }

    /// Null when it isn't there or can't be read just now.
    public static SaverState? Read(string path)
    {
        try { return JsonSerializer.Deserialize<SaverState>(File.ReadAllText(path), Options); }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or JsonException) { return null; }
    }
}

sealed record SaverWindowState(string Key, string Url, string? Wallpaper, int Frames, int Recoveries, bool Fallback, IReadOnlyList<string> Steps, int Rotations);
