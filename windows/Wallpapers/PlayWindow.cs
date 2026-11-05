using System.Drawing;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Wallpapers;

/// Play in a Window (SPEC §10.25.8): the current wallpaper in an ordinary, focused, resizable window,
/// for the wallpapers that want keys (the desktop never gets any). It shares the desktop's environment
/// as the settings window does, and isn't muted. One window: another ask navigates it. Closing really
/// closes it, so the page and its renderer are gone; the next ask makes a new one.
sealed class PlayWindow : Form
{
    const int DefaultWidth = 1280, DefaultHeight = 720;   // logical px, of the page
    const string BaseTitle = "Wallpapers";

    readonly App app;
    readonly WebView2 web = new() { Dock = DockStyle.Fill, DefaultBackgroundColor = Color.Black };
    Task? setUp;
    /// The page it should show, and the one it does.
    string? wanted, shown;
    /// The window's state before the page went fullscreen (the player's f).
    FormWindowState beforeFullScreen;

    public PlayWindow(App app)
    {
        this.app = app;
        Text = BaseTitle;
        Icon = Tray.LoadIcon();
        BackColor = Color.Black;
        StartPosition = FormStartPosition.Manual;
        AutoScaleMode = AutoScaleMode.Dpi;
        MinimumSize = new Size(LogicalToDeviceUnits(480), LogicalToDeviceUnits(300));
        Controls.Add(web);
    }

    /// Opens it on that monitor's work area, or (already open) shows `id` in it where it is.
    public async Task ShowAsync(string id, string name, Rect monitorWork)
    {
        wanted = PageUrl.Play(id);
        Text = $"{BaseTitle} · {name}";
        if (Visible)
        {
            if (WindowState == FormWindowState.Minimized) WindowState = FormWindowState.Normal;
            Activate();
            Go();
            return;
        }
        Place(monitorWork);
        Show();
        Activate();
        try
        {
            await (setUp ??= SetUpAsync());
            if (IsDisposed) return;   // closed while the page was being set up
            if (web.CoreWebView2 == null) { Close(); return; }
            Go();   // the latest ask: another may have come meanwhile
        }
        catch (Exception e) when (e is COMException or InvalidOperationException or WebView2RuntimeNotFoundException or ObjectDisposedException)
        {
            Log.Error($"play: couldn't start the page: {e.Message}");
            if (!IsDisposed) Close();
        }
    }

    void Go()
    {
        if (web.CoreWebView2 == null || wanted == null || wanted == shown) return;
        web.CoreWebView2.Navigate(wanted);
        shown = wanted;
    }

    async Task SetUpAsync()
    {
        var env = await app.Desktop.EnvironmentReady;
        if (env == null) { Log.Warn("play: no WebView2 environment"); return; }
        await web.EnsureCoreWebView2Async(env);
        // desktop: false, so not muted (an owner decision: a game you chose to play may make sound).
        await WebFactory.SetUpAsync(web.CoreWebView2, app.Paths, app.Desktop.Bing, desktop: false);
        web.CoreWebView2.ContainsFullScreenElementChanged += (_, _) => FullScreen(web.CoreWebView2.ContainsFullScreenElement);
    }

    /// The page's fullscreen (f) fills the screen: borderless and maximized, and back as it was.
    void FullScreen(bool on)
    {
        if (on == (FormBorderStyle == FormBorderStyle.None)) return;
        if (on)
        {
            beforeFullScreen = WindowState;
            WindowState = FormWindowState.Normal;   // so maximizing again covers the taskbar too
            FormBorderStyle = FormBorderStyle.None;
            WindowState = FormWindowState.Maximized;
        }
        else
        {
            FormBorderStyle = FormBorderStyle.Sizable;
            WindowState = beforeFullScreen;
        }
    }

    /// 1280×720 of page at that monitor's scale, cut to its work area and centred on it (physical px).
    void Place(Rect work)
    {
        var dpi = N.Monitors().FirstOrDefault(m => m.Work == work)?.Dpi ?? DeviceDpi;
        var outer = SizeFromClientSize(new Size(DefaultWidth * dpi / 96, DefaultHeight * dpi / 96));
        int w = Math.Min(outer.Width, work.Width), h = Math.Min(outer.Height, work.Height);
        Bounds = new Rectangle(work.Left + (work.Width - w) / 2, work.Top + (work.Height - h) / 2, w, h);
    }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        base.OnFormClosed(e);
        web.Dispose();   // the page and its renderer go now, not at the next GC
        Log.Info($"play: closed ({Text})");
    }
}
