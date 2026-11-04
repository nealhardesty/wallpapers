using System.Drawing;
using System.Text.Json;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;

namespace Wallpapers;

/// One monitor's wallpaper (SPEC §10.25.4): a page in a WebView2 composition controller whose visual
/// is drawn into the host window inside Explorer's desktop. The controller hangs off a hidden window
/// of ours (the keeper), so when Explorer restarts and the host dies the page lives on and is just
/// re-bound to the new host (W0.2, §10.25.5).
sealed class Surface : IDisposable
{
    public SurfacePlan Plan { get; }
    public IntPtr Host { get; private set; }
    public CoreWebView2? Web => controller?.CoreWebView2;
    public bool Visible => controller?.IsVisible ?? false;
    /// The browser process is gone: this surface can't recover by itself; Desktop rebuilds it.
    public event Action<Surface>? Lost;
    /// The page finished loading (first load and every reload): it can answer scripts now.
    public event Action<Surface>? Loaded;

    CoreWebView2CompositionController? controller;
    Dcomp? dcomp;
    readonly NativeWindow keeper = new();
    readonly Queue<DateTime> crashes = new();

    public Surface(SurfacePlan plan, IntPtr host)
    {
        Plan = plan;
        Host = host;
    }

    public async Task StartAsync(CoreWebView2Environment env, AppPaths paths, BingJson bing)
    {
        // Hidden, never shown, placed on this monitor (some WebView2 queries look at its parent's monitor).
        keeper.CreateHandle(new CreateParams
        {
            Caption = "WallpapersKeeper", X = Plan.Bounds.Left, Y = Plan.Bounds.Top, Width = 1, Height = 1,
            Style = unchecked((int)N.WS_POPUP), ExStyle = (int)(N.WS_EX_TOOLWINDOW | N.WS_EX_NOACTIVATE),
        });
        controller = await env.CreateCoreWebView2CompositionControllerAsync(keeper.Handle);
        controller.BoundsMode = CoreWebView2BoundsMode.UseRawPixels;
        controller.ShouldDetectMonitorScaleChanges = false;
        controller.RasterizationScale = Plan.Scale;
        controller.Bounds = new Rectangle(0, 0, Plan.Bounds.Width, Plan.Bounds.Height);
        controller.DefaultBackgroundColor = Color.Black;
        dcomp = new Dcomp();
        dcomp.BindTo(Host);
        controller.RootVisualTarget = dcomp.Visual;
        dcomp.Commit();
        controller.IsVisible = true;
        await WebFactory.SetUpAsync(controller.CoreWebView2, paths, bing, desktop: true);
        controller.CoreWebView2.ProcessFailed += OnProcessFailed;
        controller.CoreWebView2.NavigationCompleted += (_, e) =>
        {
            if (!e.IsSuccess) Log.Warn($"surface {Plan.Device}: navigation failed ({e.WebErrorStatus})");
            else Loaded?.Invoke(this);
        };
        controller.CoreWebView2.Navigate(PageUrl.Desktop(Plan.Insets));
        Log.Info($"surface {Plan.Device}: started on host {Host:X}");
    }

    /// Explorer restarted: the same page, the same visual, a new host. No reload.
    public void Rebind(IntPtr newHost)
    {
        Host = newHost;
        if (dcomp == null || controller == null) return;
        if (dcomp.BindTo(newHost)) { controller.RootVisualTarget = dcomp.Visual; dcomp.Commit(); }
        Log.Info($"surface {Plan.Device}: re-bound to host {newHost:X}");
    }

    /// Hidden web views stop rendering outright (W0.2), and the page is told so it can pause cleanly.
    public async Task SetVisibleAsync(bool visible)
    {
        if (controller == null) return;
        controller.IsVisible = visible;
        Log.Info($"surface {Plan.Device}: IsVisible={(visible ? "true" : "false")}");
        await EvalAsync($"window.WP && WP.power && WP.power({{ hidden: {(visible ? "false" : "true")} }})");
    }

    public async Task<string> EvalAsync(string js) => Web == null ? "null" : await Web.ExecuteScriptAsync(js);

    /// A script whose value is a promise of a string (ExecuteScriptAsync doesn't wait for promises).
    /// Null when the page threw, or gave back something else.
    public async Task<string?> EvaluateAsync(string expression)
    {
        if (Web == null) return null;
        var json = await Web.CallDevToolsProtocolMethodAsync("Runtime.evaluate",
            JsonSerializer.Serialize(new { expression, awaitPromise = true, returnByValue = true }));
        using var doc = JsonDocument.Parse(json);
        if (doc.RootElement.TryGetProperty("exceptionDetails", out var ex)) { Log.Warn($"surface {Plan.Device}: script threw: {ex}"); return null; }
        return doc.RootElement.TryGetProperty("result", out var r) && r.TryGetProperty("value", out var v) && v.ValueKind == JsonValueKind.String
            ? v.GetString() : null;
    }

    public void Reload() => Web?.Reload();

    void OnProcessFailed(object? sender, CoreWebView2ProcessFailedEventArgs e)
    {
        Log.Warn($"surface {Plan.Device}: {e.ProcessFailedKind} ({e.Reason}, exit {e.ExitCode})");
        switch (e.ProcessFailedKind)
        {
            case CoreWebView2ProcessFailedKind.BrowserProcessExited:
                Lost?.Invoke(this);
                break;
            case CoreWebView2ProcessFailedKind.RenderProcessExited or CoreWebView2ProcessFailedKind.RenderProcessUnresponsive:
                // Reload, unless the page keeps crashing (then a frozen frame beats a crash loop).
                var now = DateTime.UtcNow;
                crashes.Enqueue(now);
                while (crashes.Count > 0 && now - crashes.Peek() > TimeSpan.FromMinutes(1)) crashes.Dequeue();
                if (crashes.Count <= 3) Reload();
                else Log.Error($"surface {Plan.Device}: the page crashed {crashes.Count} times in a minute; not reloading it again");
                break;
        }
    }

    public void Dispose()
    {
        try { controller?.Close(); } catch (Exception e) when (e is InvalidOperationException or COMException) { }
        controller = null;
        dcomp?.Dispose();
        dcomp = null;
        keeper.DestroyHandle();
    }
}
