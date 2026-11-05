using System.ComponentModel;
using System.Drawing;
using System.Globalization;
using System.Text.Json;
using System.Windows.Forms;

namespace Wallpapers;

/// One monitor's saver (SPEC §10.25.12): a borderless black window with a Surface drawn into it, any
/// input ends the session, and a watchdog on the page's frames that reloads it, then recreates it, then
/// paints a clock on black and tries the page again now and then.
sealed class SaverWindow : Form
{
    public const string Caption = "WallpapersSaver";
    /// A counter the watchdog installs on the top-level page: a still wallpaper idles its stage legitimately.
    internal const string FrameScript = "(() => { if (window.__wpSaverRaf == null) { window.__wpSaverRaf = 0; (function t() { window.__wpSaverRaf++; requestAnimationFrame(t); })(); } return window.__wpSaverRaf; })()";

    public SurfacePlan Plan { get; }
    public string Url { get; }
    /// What it shows when the saver picks (Different) or was told (One); null in Same mode.
    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)] public string? Wallpaper { get; set; }
    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)] public int Rotations { get; set; }

    readonly SaverSession session;
    readonly HostPlacement placement;
    readonly SaverWatchdog watchdog;
    readonly System.Windows.Forms.Timer tick, clockTimer = new() { Interval = 1000 };
    readonly List<string> steps = [];
    readonly Random rng = new();
    Surface? surface;
    int frames;
    bool reading, clock;
    Point clockAt;
    DateTime clockMoved;

    public SaverWindow(SaverSession session, SurfacePlan plan, string url)
    {
        this.session = session;
        Plan = plan;
        Url = url;
        var r = plan.Bounds;
        placement = new HostPlacement(r, plan.Scale);
        var test = session.Paths.Flavor == "test";
        tick = new System.Windows.Forms.Timer { Interval = test ? 1000 : (int)SaverWatchdog.Every.TotalMilliseconds };
        watchdog = new SaverWatchdog(test ? 3 : (int)(SaverWatchdog.RetryAfter / SaverWatchdog.Every));
        tick.Tick += (_, _) => _ = TickAsync();
        clockTimer.Tick += (_, _) => Invalidate();

        Text = Caption;
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.Manual;
        AutoScaleMode = AutoScaleMode.None;
        BackColor = Color.Black;
        DoubleBuffered = true;
        TopMost = session.Real;
        Bounds = new Rectangle(r.Left, r.Top, r.Width, r.Height);
    }

    /// The harness windows sit beside whatever the user is doing; a real saver takes the foreground.
    protected override bool ShowWithoutActivation => !session.Real;

    // WinForms can rescale a form for its monitor's DPI: put it exactly there once it's up.
    protected override void OnShown(EventArgs e)
    {
        base.OnShown(e);
        var r = Plan.Bounds;
        N.SetWindowPos(Handle, IntPtr.Zero, r.Left, r.Top, r.Width, r.Height, N.SWP_NOZORDER | N.SWP_NOACTIVATE);
    }

    public async Task StartAsync()
    {
        tick.Start();
        await StartSurfaceAsync();
    }

    /// No WebView2 or no pages: the clock, for good.
    public void ClockOnly()
    {
        tick.Stop();
        ShowClock(true);
    }

    async Task StartSurfaceAsync()
    {
        if (session.Environment is not { } env || IsDisposed) return;
        var s = surface = new Surface(Plan, placement, Handle);
        s.Lost += _ => { if (surface == s) Act(watchdog.Crashed(), "the browser process died"); };
        s.Loaded += loaded => { if (surface == loaded) _ = session.PageLoadedAsync(this); };
        try
        {
            await s.StartAsync(env, session.Paths, session.Bing, Url);
            if (session.TakeWindowFault()) throw new NotSupportedException("--saver-fault window");
            // Chromium's input window must not take the mouse moves and clicks that end the saver.
            WebFactory.MakeOverlaysClickThrough(env);
            if (surface == s) await ApplyPowerAsync();
        }
        catch (Exception e) when (e is COMException or InvalidOperationException or ArgumentException)
        {
            // The watchdog sees no frames from it and moves on to the next step.
            Log.Warn($"saver: {Plan.Key}: couldn't start the page ({e.GetType().Name}: {e.Message})");
        }
    }

    public Task ApplyPowerAsync() => surface?.ApplyPowerAsync(!session.Hidden, session.PowerArgument) ?? Task.CompletedTask;

    public async Task<string?> AskAsync(string script)
    {
        if (surface == null) return null;
        try { return JsonSerializer.Deserialize<string?>(await surface.EvalAsync(script)); }
        catch (Exception e) when (e is COMException or InvalidOperationException or ObjectDisposedException or JsonException) { return null; }
    }

    /// Shown for this load only (no persist): the desktop's own choice is untouched.
    public async Task ShowWallpaperAsync(string id)
    {
        if (surface == null) return;
        try { await surface.EvalAsync(ShowScript(id)); }
        catch (Exception e) when (e is COMException or InvalidOperationException or ObjectDisposedException) { Log.Warn($"saver: {Plan.Key}: couldn't show {id} ({e.Message})"); }
    }

    internal static string ShowScript(string id) => $"window.WP && WP.player && WP.player.show({JsonSerializer.Serialize(id)})";

    async Task TickAsync()
    {
        if (reading || session.Hidden) return;
        reading = true;
        try { frames = await ReadFramesAsync(); }
        finally { reading = false; }
        if (IsDisposed) return;
        if (surface != null && session.Environment is { } env) WebFactory.MakeOverlaysClickThrough(env);   // as Desktop's 5 s check
        Act(watchdog.Tick(frames), $"frames {frames}");
        session.WriteState();
    }

    /// The page's counter, or -1 when it doesn't answer within 2 s (a hung renderer never does).
    async Task<int> ReadFramesAsync()
    {
        if (session.Stall || surface == null) return -1;
        try
        {
            var eval = surface.EvalAsync(FrameScript);
            _ = eval.ContinueWith(t => _ = t.Exception, TaskScheduler.Default);   // a late failure stays quiet
            if (await Task.WhenAny(eval, Task.Delay(2000)) != eval || !eval.IsCompletedSuccessfully) return -1;
            return int.TryParse(eval.Result, NumberStyles.Integer, CultureInfo.InvariantCulture, out var n) ? n : -1;
        }
        catch (Exception e) when (e is COMException or InvalidOperationException or ObjectDisposedException) { return -1; }
    }

    void Act(WatchdogStep step, string why)
    {
        if (step == WatchdogStep.None || IsDisposed) return;
        Log.Warn($"saver: {Plan.Key}: watchdog {step.ToString().ToLowerInvariant()} ({why}; recoveries {watchdog.Recoveries})");
        steps.Add(step.ToString().ToLowerInvariant());
        switch (step)
        {
            case WatchdogStep.Reload:
                surface?.Reload();
                break;
            case WatchdogStep.Recreate:
                DisposeSurface();
                _ = StartSurfaceAsync();
                break;
            case WatchdogStep.Fallback:
                DisposeSurface();
                ShowClock(true);
                break;
            case WatchdogStep.Retry:
                // The clock stays painted under the new page until it proves itself.
                DisposeSurface();
                _ = StartSurfaceAsync();
                break;
            case WatchdogStep.Recovered:
                ShowClock(false);
                break;
        }
        session.WriteState();
    }

    void DisposeSurface()
    {
        surface?.Dispose();
        surface = null;
    }

    void ShowClock(bool on)
    {
        clock = on;
        clockMoved = DateTime.MinValue;
        if (on) clockTimer.Start(); else clockTimer.Stop();
        Invalidate();
    }

    /// The fallback: the time in white on black, moved to a new random spot every minute (no burn-in).
    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        if (!clock) return;
        var text = DateTime.Now.ToString("t", CultureInfo.CurrentCulture);
        using var font = new Font("Segoe UI Light", Math.Max(12, ClientSize.Height / 6f), GraphicsUnit.Pixel);
        var size = TextRenderer.MeasureText(e.Graphics, text, font);
        if (DateTime.UtcNow - clockMoved >= TimeSpan.FromMinutes(1))
        {
            clockMoved = DateTime.UtcNow;
            clockAt = new Point(rng.Next(Math.Max(1, ClientSize.Width - size.Width)), rng.Next(Math.Max(1, ClientSize.Height - size.Height)));
        }
        TextRenderer.DrawText(e.Graphics, text, font, clockAt, Color.White, Color.Black);
    }

    public SaverWindowState State() => new(Plan.Key, Url, Wallpaper, frames, watchdog.Recoveries, watchdog.InFallback || clock, steps.ToList(), Rotations);

    protected override void WndProc(ref Message m)
    {
        switch (m.Msg)
        {
            case N.WM_KEYDOWN or N.WM_SYSKEYDOWN:
                session.End("key");
                return;
            case N.WM_LBUTTONDOWN or N.WM_RBUTTONDOWN or N.WM_MBUTTONDOWN or N.WM_XBUTTONDOWN or N.WM_MOUSEWHEEL or N.WM_MOUSEHWHEEL:
                session.End("click");
                return;
            case N.WM_MOUSEMOVE:
                // Client px (signed: GET_X_LPARAM) plus the window's screen origin.
                var l = (long)m.LParam;
                int x = (short)(l & 0xFFFF), y = (short)((l >> 16) & 0xFFFF);
                var origin = N.RectOf(Handle);
                if (session.MovedFromStart(origin.Left + x, origin.Top + y)) { session.End("move"); return; }
                break;
            case N.WM_ACTIVATEAPP when m.WParam == IntPtr.Zero && session.Real:
                session.End("deactivate");
                break;
            case (int)N.WM_CLOSE:
                session.End("close");
                return;
            case N.WM_SYSCOMMAND when ((int)m.WParam & 0xFFF0) == N.SC_SCREENSAVE:
                m.Result = IntPtr.Zero;   // Windows mustn't start a second saver over this one
                return;
        }
        base.WndProc(ref m);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            tick.Dispose();
            clockTimer.Dispose();
            DisposeSurface();
        }
        base.Dispose(disposing);
    }
}
