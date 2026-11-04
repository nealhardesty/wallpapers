using System.Text;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;

namespace Wallpapers;

/// Every web view the app makes, and the one environment they share (SPEC §10.25.14).
static class WebFactory
{
    /// The browser arguments. None are needed (W0.2: Chromium never throttles our hosts). The screen
    /// saver (W5) shares this user data folder, and a second process with different options fails
    /// CreateAsync (0x8007139F, W0.3), so this is the one place they're decided.
    public const string BrowserArgs = "";

    public static Task<CoreWebView2Environment> CreateAsync(AppPaths paths) =>
        CoreWebView2Environment.CreateAsync(null, paths.UserData, new CoreWebView2EnvironmentOptions(BrowserArgs));

    /// Our pages from the web folder, links in the browser, bing.json answered natively, page errors
    /// in the log. Desktop surfaces are also silent and skip the first-run hint.
    public static async Task SetUpAsync(CoreWebView2 web, AppPaths paths, BingJson bing, bool desktop)
    {
        web.Settings.AreDevToolsEnabled = Log.Verbose;
        web.Settings.AreDefaultContextMenusEnabled = Log.Verbose;
        web.Settings.IsStatusBarEnabled = false;
        web.Settings.IsZoomControlEnabled = false;

        web.NavigationStarting += (_, e) =>
        {
            if (e.Uri.StartsWith(PageUrl.Origin, StringComparison.OrdinalIgnoreCase) || e.Uri.StartsWith("about:", StringComparison.Ordinal)) return;
            e.Cancel = true;
            if (e.Uri.StartsWith("http", StringComparison.OrdinalIgnoreCase)) Shell.Open(e.Uri);
        };
        web.NewWindowRequested += (_, e) =>
        {
            e.Handled = true;
            if (e.Uri.StartsWith("http", StringComparison.OrdinalIgnoreCase)) Shell.Open(e.Uri);
        };

        // Our origin is answered here, file by file, from the web folder (not WebView2's folder
        // mapping: WebResourceRequested never fires for a mapped host, and bing.json needs it).
        web.AddWebResourceRequestedFilter(PageUrl.Origin + "*", CoreWebView2WebResourceContext.All);
        web.WebResourceRequested += (_, e) => Serve(web, e, paths, bing);

        // Page errors (and with WP_DEBUG, everything the page logs) go to the app's log.
        web.GetDevToolsProtocolEventReceiver("Runtime.exceptionThrown").DevToolsProtocolEventReceived += (_, e) =>
            Log.Error($"page: {Describe(e.ParameterObjectAsJson, "exceptionDetails")}");
        web.GetDevToolsProtocolEventReceiver("Runtime.consoleAPICalled").DevToolsProtocolEventReceived += (_, e) =>
        {
            using var doc = JsonDocument.Parse(e.ParameterObjectAsJson);
            var type = doc.RootElement.GetProperty("type").GetString();
            if (type == "error" || Log.Verbose) Log.Info($"page console.{type}: {Describe(e.ParameterObjectAsJson, "args")}");
        };
        await web.CallDevToolsProtocolMethodAsync("Runtime.enable", "{}");

        if (desktop)
        {
            // "Press , for settings" is wrong on a desktop that ignores keys (as on the Mac).
            await web.AddScriptToExecuteOnDocumentCreatedAsync("try { localStorage.setItem('wp:hinted', 'true'); } catch (e) {}");
            web.IsMuted = true;   // a desktop that talks unexpectedly is a failure (§10.25.9)
        }
    }

    static void Serve(CoreWebView2 web, CoreWebView2WebResourceRequestedEventArgs e, AppPaths paths, BingJson bing)
    {
        var url = e.Request.Uri;
        if (Uri.TryCreate(url, UriKind.Absolute, out var uri) && uri.AbsolutePath == "/bing.json")
        {
            _ = ServeBingAsync(web, e, bing);
            return;
        }
        var file = WebFiles.Resolve(paths.WebRoot, url);
        byte[]? bytes = null;
        if (file != null)
        {
            try { bytes = File.ReadAllBytes(file); }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { Log.Warn($"web: {file}: {ex.Message}"); }
        }
        if (bytes == null)
        {
            Log.Debug($"web: 404 {url}");
            e.Response = web.Environment.CreateWebResourceResponse(null, 404, "Not Found", "Content-Type: text/plain");
            return;
        }
        // no-cache: Reload Wallpapers shows a web/ edit at once (make win-dev).
        e.Response = web.Environment.CreateWebResourceResponse(new MemoryStream(bytes), 200, "OK",
            $"Content-Type: {WebFiles.ContentType(file!)}\r\nCache-Control: no-cache");
    }

    static async Task ServeBingAsync(CoreWebView2 web, CoreWebView2WebResourceRequestedEventArgs e, BingJson bing)
    {
        var deferral = e.GetDeferral();
        try
        {
            var (status, body) = await bing.GetAsync();
            e.Response = web.Environment.CreateWebResourceResponse(new MemoryStream(Encoding.UTF8.GetBytes(body)), status,
                status == 200 ? "OK" : "Service Unavailable",
                "Content-Type: application/json\r\nCache-Control: no-store\r\nX-Wallpapers-Bing: native");
        }
        catch (Exception ex) when (ex is InvalidOperationException or COMException) { Log.Warn($"bing.json: {ex.Message}"); }
        finally { deferral.Complete(); }
    }

    static string Describe(string json, string key)
    {
        using var doc = JsonDocument.Parse(json);
        if (!doc.RootElement.TryGetProperty(key, out var value)) return json.Length > 300 ? json[..300] : json;
        var text = value.ValueKind == JsonValueKind.Array
            ? string.Join(" ", value.EnumerateArray().Select(a => a.TryGetProperty("value", out var v) ? v.ToString() : a.TryGetProperty("description", out var d) ? d.GetString() : ""))
            : value.TryGetProperty("exception", out var ex) && ex.TryGetProperty("description", out var desc) ? desc.GetString() ?? "" : value.ToString();
        return text.Length > 400 ? text[..400] : text;
    }
}
