using System.Drawing;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Wallpapers;

/// The panel in an ordinary window (SPEC §10.25.11), as Android and the Mac do it: the page with
/// ?panel=open over a live preview. It shares the desktop's environment and so its storage, and
/// a pick or a setting reaches every desktop surface through Chromium's storage events. Closing
/// hides it and unloads the page; it's in the taskbar and Alt-Tab only while it's shown.
sealed class SettingsWindow : Form
{
    const int DefaultWidth = 1280, DefaultHeight = 800;   // logical px
    const string PanelClosed = "panel-closed";
    const string BaseTitle = "Wallpapers Settings";

    readonly App app;
    readonly WebView2 web = new() { Dock = DockStyle.Fill, DefaultBackgroundColor = Color.Black };
    Task? setUp;
    /// The page it should show, and the one it does (null while hidden).
    string? wanted, shown;
    bool quitting;
    /// The monitor it edits in Different mode (by key), so its title follows a renumbering.
    string? monitorKey;

    public SettingsWindow(App app)
    {
        this.app = app;
        Text = BaseTitle;
        Icon = Tray.LoadIcon();
        BackColor = Color.Black;
        StartPosition = FormStartPosition.Manual;
        AutoScaleMode = AutoScaleMode.Dpi;
        MinimumSize = new Size(LogicalToDeviceUnits(480), LogicalToDeviceUnits(400));
        Controls.Add(web);
        Place();
        app.Desktop.Changed += FollowMonitors;
    }

    /// Opens it, or brings it to the front when it's already open. In Different mode it edits one
    /// monitor's choice (monitor 1's when none is named); it's one window, so another monitor's
    /// Settings… navigates it there.
    public async Task ShowOrFocusAsync(SurfacePlan? monitor = null)
    {
        (wanted, Text) = Target(monitor);
        if (Visible)
        {
            if (WindowState == FormWindowState.Minimized) WindowState = FormWindowState.Normal;
            Activate();
            Go();
            return;
        }
        Place();
        Show();
        Activate();
        try
        {
            await (setUp ??= SetUpAsync());
            if (web.CoreWebView2 == null) { Hide(); return; }
            Go();   // the latest ask: another may have come while the page was being set up
        }
        catch (Exception e) when (e is COMException or InvalidOperationException or WebView2RuntimeNotFoundException)
        {
            Log.Error($"settings: couldn't start the page: {e.Message}");
            Hide();
        }
    }

    /// The monitor mode changed: an open window follows it (monitor 1's in Different, the shared one in Same).
    public void FollowMode()
    {
        if (!Visible) return;
        (wanted, Text) = Target(null);
        Go();
    }

    /// A reconcile can renumber the monitors: the title follows the one shown (by key), and with
    /// that monitor gone the window moves to monitor 1's, as when none is named.
    void FollowMonitors()
    {
        if (IsDisposed || !Visible || monitorKey == null || app.Desktop.Building) return;
        (wanted, Text) = Target(app.Desktop.Surfaces.FirstOrDefault(s => s.Plan.Key == monitorKey)?.Plan);
        Go();
    }

    (string Url, string Title) Target(SurfacePlan? monitor)
    {
        monitorKey = null;
        if (app.Desktop.Mode == MonitorMode.Different && (monitor ?? app.Desktop.Surfaces.FirstOrDefault()?.Plan) is { } m)
        {
            monitorKey = m.Key;
            return (PageUrl.Settings(m.Key), $"{BaseTitle} · Monitor {m.Number} · {m.Name}");
        }
        return (PageUrl.Settings(), BaseTitle);
    }

    void Go()
    {
        if (web.CoreWebView2 == null || wanted == null || wanted == shown) return;
        web.CoreWebView2.Navigate(wanted);
        shown = wanted;
        Log.Info($"settings: shown ({Text})");
    }

    async Task SetUpAsync()
    {
        var env = await app.Desktop.EnvironmentReady;
        if (env == null) { Log.Warn("settings: no WebView2 environment"); return; }
        await web.EnsureCoreWebView2Async(env);
        await WebFactory.SetUpAsync(web.CoreWebView2, app.Paths, app.Desktop.Bing, desktop: false);
        // The panel's × (or Esc) closes the window too: with the panel gone, what's left is just a
        // second copy of the desktop. The page has no host hook for it, so this one listens.
        await web.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(
            $"document.addEventListener('wp-panel', e => {{ if (!e.detail.open) window.chrome.webview.postMessage('{PanelClosed}'); }});");
        web.CoreWebView2.WebMessageReceived += (_, e) =>
        {
            if (e.TryGetWebMessageAsString() == PanelClosed) Close();
        };
    }

    /// Where it opens: last time's place, kept on a monitor that's still there (§10.25.11).
    void Place()
    {
        var r = WindowPlacement.Restore(app.Settings.SettingsBounds, N.Monitors(), DefaultWidth, DefaultHeight);
        Bounds = new Rectangle(r.Left, r.Top, r.Width, r.Height);
    }

    void Remember()
    {
        var b = WindowState == FormWindowState.Normal ? Bounds : RestoreBounds;
        var rect = new Rect(b.Left, b.Top, b.Right, b.Bottom);
        if (rect != app.Settings.SettingsBounds) app.SaveSettings(app.Settings with { SettingsBounds = rect });
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (Visible) Remember();
        if (!quitting)
        {
            // Hide, don't close: the next open is quicker, and the page goes to about:blank so a
            // hidden window costs nothing.
            e.Cancel = true;
            Hide();
            web.CoreWebView2?.Navigate("about:blank");
            shown = null;
            Log.Info("settings: hidden");
        }
        base.OnFormClosing(e);
    }

    /// For the app's cleanup: really close, saving the place first.
    public void CloseForGood()
    {
        quitting = true;
        app.Desktop.Changed -= FollowMonitors;
        Close();
        Dispose();
    }
}
