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

    readonly App app;
    readonly WebView2 web = new() { Dock = DockStyle.Fill, DefaultBackgroundColor = Color.Black };
    Task? setUp;
    bool quitting;

    public SettingsWindow(App app)
    {
        this.app = app;
        Text = "Wallpapers Settings";
        Icon = Tray.LoadIcon();
        BackColor = Color.Black;
        StartPosition = FormStartPosition.Manual;
        AutoScaleMode = AutoScaleMode.Dpi;
        MinimumSize = new Size(LogicalToDeviceUnits(480), LogicalToDeviceUnits(400));
        Controls.Add(web);
        Place();
    }

    /// Opens it, or brings it to the front when it's already open.
    public async Task ShowOrFocusAsync()
    {
        if (Visible)
        {
            if (WindowState == FormWindowState.Minimized) WindowState = FormWindowState.Normal;
            Activate();
            return;
        }
        Place();
        Show();
        Activate();
        try
        {
            await (setUp ??= SetUpAsync());
            if (web.CoreWebView2 == null) { Hide(); return; }
            web.CoreWebView2.Navigate(PageUrl.Settings());
            Log.Info("settings: shown");
        }
        catch (Exception e) when (e is COMException or InvalidOperationException or WebView2RuntimeNotFoundException)
        {
            Log.Error($"settings: couldn't start the page: {e.Message}");
            Hide();
        }
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
            Log.Info("settings: hidden");
        }
        base.OnFormClosing(e);
    }

    /// For the app's cleanup: really close, saving the place first.
    public void CloseForGood()
    {
        quitting = true;
        Close();
        Dispose();
    }
}
