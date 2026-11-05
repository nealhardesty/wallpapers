using System.Drawing;
using System.Globalization;
using System.Text.Json;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;

namespace Wallpapers;

/// /p <hwnd> (SPEC §10.25.12): the saver, live, in the little monitor of Windows' Screen Saver Settings. A
/// black child window of that dialog's with a Surface in it: the page lays out at twice the little monitor's
/// size and is drawn into it (RasterizationScale 0.5, WebView2's floor). The dialog owns input; there is no
/// watchdog, no pinging the app and no cursor hiding. When the page can't start: our icon on black. It exits
/// when the dialog's window goes, or its own does.
sealed class SaverPreview : Control
{
    public const string Caption = "WallpapersSaverPreview";

    readonly AppPaths paths;
    readonly IntPtr parent;
    readonly SaverSettings settings;
    readonly string url;
    readonly System.Windows.Forms.Timer watch = new() { Interval = 500 };
    readonly bool writeState;
    Surface? surface;
    string? wallpaper;
    int frames;
    bool failed, reading, exiting;

    public static int Run(AppPaths paths, IntPtr parent)
    {
        if (!N.IsWindow(parent)) { Log.Info("saver: preview: no such window"); return 0; }
        ApplicationConfiguration.Initialize();
        // Windows' dialog may not be per-monitor aware like us; without this a child of it can't be made.
        N.SetThreadDpiHostingBehavior(N.DPI_HOSTING_BEHAVIOR_MIXED);
        SynchronizationContext.SetSynchronizationContext(new WindowsFormsSynchronizationContext());
        Application.ThreadException += (_, e) => { Log.Error($"saver: preview: crash: {e.Exception}"); Environment.Exit(1); };
        using var preview = new SaverPreview(paths, parent);
        preview.CreateControl();
        _ = preview.StartAsync();
        Application.Run();
        Log.Info("saver: preview ended");
        return 0;
    }

    SaverPreview(AppPaths paths, IntPtr parent)
    {
        this.paths = paths;
        this.parent = parent;
        var app = AppSettings.Load(paths.SettingsFile);
        settings = (app.Saver ?? new()).Normalized();
        var primary = Wallpapers.Core.Layout.Plan(N.Monitors()).FirstOrDefault(p => p.Primary)?.Key;
        url = SaverSession.UrlFor(settings, app.Monitors, primary, clock: false);
        wallpaper = settings.Show == SaverShow.One ? settings.Wallpaper : null;
        writeState = paths.Flavor == "test" || Log.Verbose;
        Text = Caption;
        BackColor = Color.Black;
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint, true);
        watch.Tick += (_, _) => Watch();
    }

    /// A child of the dialog's window, filling its client area.
    protected override CreateParams CreateParams
    {
        get
        {
            var cp = base.CreateParams;
            N.GetClientRect(parent, out var r);
            cp.Parent = parent;
            cp.Style = unchecked((int)(N.WS_CHILD | N.WS_VISIBLE | N.WS_CLIPCHILDREN));
            cp.ExStyle = 0;
            cp.X = cp.Y = 0;
            cp.Width = r.R - r.L;
            cp.Height = r.B - r.T;
            cp.Caption = Caption;
            return cp;
        }
    }

    async Task StartAsync()
    {
        watch.Start();
        WriteState();
        var screen = N.RectOf(Handle);
        Log.Info($"saver: preview {screen.Width}x{screen.Height} in {parent}: {settings.Show}");
        var problem = paths.CheckWebRoot();
        if (problem == null)
        {
            var plan = new SurfacePlan("preview", "preview", "Preview", 1, true, screen, screen, 1.0, Insets.None);
            var s = surface = new Surface(plan, new HostPlacement(screen, 0.5), Handle);
            s.Lost += _ => Fail("the browser process died");
            s.Loaded += loaded => _ = PickAsync();
            try
            {
                var env = await WebFactory.CreateAsync(paths);
                if (exiting) return;
                await s.StartAsync(env, paths, new BingJson(), url);
                return;
            }
            catch (Exception e) when (e is WebView2RuntimeNotFoundException or COMException or InvalidOperationException or ArgumentException)
            {
                problem = $"{e.GetType().Name}: {e.Message}";
            }
        }
        Fail(problem);
    }

    /// The page and its web view are gone for good: the icon instead.
    void Fail(string why)
    {
        if (failed || exiting) return;
        Log.Error($"saver: preview: {why}; showing the icon");
        failed = true;
        surface?.Dispose();
        surface = null;
        Invalidate();
        WriteState();
    }

    /// A Different One Each Time: one of the saver's pool, as a run would start.
    async Task PickAsync()
    {
        if (settings.Show != SaverShow.Different || surface is not { } s) return;
        for (var waited = 0; !exiting && waited <= 15_000; waited += 500)
        {
            try
            {
                if (JsonSerializer.Deserialize<string?>(await s.EvalAsync(CatalogInfo.Script)) is { } json)
                {
                    wallpaper = SaverPicker.Pick(SaverPicker.Pool(CatalogInfo.Parse(json)), [], Random.Shared);
                    if (wallpaper != null) await s.EvalAsync(SaverWindow.ShowScript(wallpaper));
                    return;
                }
            }
            catch (Exception e) when (e is COMException or InvalidOperationException or ObjectDisposedException or JsonException or FormatException)
            {
                Log.Warn($"saver: preview: couldn't pick one ({e.Message})");
                return;
            }
            await Task.Delay(500);
        }
    }

    void Watch()
    {
        if (!N.IsWindow(parent)) { Exit("the dialog went"); return; }
        if (writeState && !reading) _ = ReadFramesAsync();
    }

    async Task ReadFramesAsync()
    {
        if (surface is not { } s) return;
        reading = true;
        try
        {
            if (int.TryParse(await s.EvalAsync(SaverWindow.FrameScript), NumberStyles.Integer, CultureInfo.InvariantCulture, out var n)) frames = n;
        }
        catch (Exception e) when (e is COMException or InvalidOperationException or ObjectDisposedException) { }
        finally { reading = false; }
        WriteState();
    }

    void WriteState()
    {
        if (!writeState) return;
        var window = new SaverWindowState("preview", url, wallpaper, frames, 0, failed, [], 0);
        try { new SaverState(Environment.ProcessId, "preview", exiting ? "closed" : null, [window]).Write(paths.SaverStateFile); }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException) { Log.Debug($"saver: preview state: {e.Message}"); }
    }

    void Exit(string why)
    {
        if (exiting) return;
        exiting = true;
        Log.Info($"saver: preview: {why}");
        watch.Stop();
        WriteState();
        Application.ExitThread();
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        if (!failed) return;
        var side = Math.Max(16, Math.Min(64, Math.Min(ClientSize.Width, ClientSize.Height) / 2));
        using var icon = Tray.LoadIcon(new Size(side, side));
        e.Graphics.DrawIcon(icon, new Rectangle((ClientSize.Width - side) / 2, (ClientSize.Height - side) / 2, side, side));
    }

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == N.WM_DESTROY) Exit("its window went");
        base.WndProc(ref m);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            watch.Dispose();
            surface?.Dispose();
            surface = null;
        }
        base.Dispose(disposing);
    }
}
