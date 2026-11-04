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
    public SurfacePlan Plan { get; private set; }
    /// Where its host is and the page's scale: the monitor itself, or its spot in a fake layout.
    public HostPlacement Placement { get; private set; }
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
    /// What the page was last told by WP.power (null: nothing yet).
    string? powerJson;
    bool disposed;

    public Surface(SurfacePlan plan, HostPlacement placement, IntPtr host)
    {
        Plan = plan;
        Placement = placement;
        Host = host;
    }

    public async Task StartAsync(CoreWebView2Environment env, AppPaths paths, BingJson bing, string url)
    {
        // Hidden, never shown, placed on this monitor (some WebView2 queries look at its parent's monitor).
        keeper.CreateHandle(new CreateParams
        {
            Caption = "WallpapersKeeper", X = Placement.Screen.Left, Y = Placement.Screen.Top, Width = 1, Height = 1,
            Style = unchecked((int)N.WS_POPUP), ExStyle = (int)(N.WS_EX_TOOLWINDOW | N.WS_EX_NOACTIVATE),
        });
        var made = await env.CreateCoreWebView2CompositionControllerAsync(keeper.Handle);
        // Disposed while it was being made (Quit, logoff): nothing else will close this one.
        if (disposed) { try { made.Close(); } catch (Exception e) when (e is InvalidOperationException or COMException) { } return; }
        controller = made;
        controller.BoundsMode = CoreWebView2BoundsMode.UseRawPixels;
        controller.ShouldDetectMonitorScaleChanges = false;
        controller.RasterizationScale = Placement.RasterizationScale;
        controller.Bounds = new Rectangle(0, 0, Placement.Screen.Width, Placement.Screen.Height);
        controller.DefaultBackgroundColor = Color.Black;
        dcomp = new Dcomp();
        dcomp.BindTo(Host);
        controller.RootVisualTarget = dcomp.Visual;
        dcomp.Commit();
        controller.IsVisible = true;
        await WebFactory.SetUpAsync(controller.CoreWebView2, paths, bing, desktop: true);
        if (disposed) return;   // Dispose closed it
        controller.CoreWebView2.ProcessFailed += OnProcessFailed;
        controller.CoreWebView2.NavigationCompleted += (_, e) =>
        {
            if (!e.IsSuccess) { Log.Warn($"surface {Plan.Device}: navigation failed ({e.WebErrorStatus})"); return; }
            if (powerJson != null) _ = TellPowerAsync(powerJson);
            Loaded?.Invoke(this);
        };
        controller.CoreWebView2.Navigate(url);
        Log.Info($"surface {Plan.Key} ({Plan.Device}): started on host {Host:X}");
    }

    /// The monitor moved, resized or changed scale (its host has already moved): the same page at the
    /// new size and scale. No reload.
    public void Resize(SurfacePlan plan, HostPlacement placement)
    {
        Plan = plan;
        Placement = placement;
        if (controller == null) return;
        N.SetWindowPos(keeper.Handle, IntPtr.Zero, placement.Screen.Left, placement.Screen.Top, 0, 0, N.SWP_NOSIZE | N.SWP_NOZORDER | N.SWP_NOACTIVATE);
        controller.RasterizationScale = placement.RasterizationScale;
        controller.Bounds = new Rectangle(0, 0, placement.Screen.Width, placement.Screen.Height);
    }

    /// A new URL (new insets, or the monitor mode changed): this one does load the page again.
    public void Navigate(string url)
    {
        Log.Info($"surface {Plan.Key}: navigating to {url}");
        Web?.Navigate(url);
    }

    /// Explorer restarted: the same page, the same visual, a new host. No reload.
    public void Rebind(IntPtr newHost)
    {
        Host = newHost;
        if (dcomp == null || controller == null) return;
        if (dcomp.BindTo(newHost)) { controller.RootVisualTarget = dcomp.Visual; dcomp.Commit(); }
        Log.Info($"surface {Plan.Device}: re-bound to host {newHost:X}");
    }

    /// Pause and power (§10.25.9): hidden web views stop rendering outright (W0.2), and the page is
    /// told `WP.power(json)` so it pauses cleanly and picks its quality. Nothing happens when neither
    /// changed; every load (a reload, a navigate) is told again, as a new page knows nothing.
    /// IsVisible is set before the first await, so a caller that starts this on every surface has
    /// them all right at once; the script can't throw (a closing or crashed page is logged).
    public Task ApplyPowerAsync(bool visible, string json)
    {
        if (controller == null) return Task.CompletedTask;
        try
        {
            if (visible == controller.IsVisible && json == powerJson) return Task.CompletedTask;
            if (visible != controller.IsVisible)
            {
                controller.IsVisible = visible;
                Log.Info($"surface {Plan.Device}: IsVisible={(visible ? "true" : "false")}");
            }
        }
        catch (Exception e) when (e is COMException or InvalidOperationException)
        {
            // Its browser process is gone (Desktop rebuilds it); the others must still get theirs.
            Log.Warn($"surface {Plan.Device}: couldn't set IsVisible ({e.GetType().Name}: {e.Message})");
            return Task.CompletedTask;
        }
        powerJson = json;
        return TellPowerAsync(json);
    }

    async Task TellPowerAsync(string json)
    {
        try { await EvalAsync($"window.WP && WP.power && WP.power({json})"); }
        catch (Exception e) when (e is COMException or InvalidOperationException or ObjectDisposedException)
        {
            Log.Warn($"surface {Plan.Device}: couldn't tell the page its power state ({e.GetType().Name}: {e.Message})");
        }
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
        disposed = true;
        try { controller?.Close(); } catch (Exception e) when (e is InvalidOperationException or COMException) { }
        controller = null;
        dcomp?.Dispose();
        dcomp = null;
        keeper.DestroyHandle();
    }
}
