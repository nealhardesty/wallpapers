namespace Wallpapers.Core;

/// Serving web/ at https://wallpapers.example/ (SPEC §10.25.14). The app answers every request
/// itself through WebResourceRequested rather than WebView2's folder mapping, because that event
/// never fires for a mapped virtual host (Microsoft's documentation; found by --selftest's
/// bing.json check), and bing.json has to be answered by the app.
public static class WebFiles
{
    /// The file a URL asks for, or null when it isn't ours, isn't there, or would leave the folder.
    public static string? Resolve(string root, string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps
            || !uri.Host.Equals(PageUrl.HostName, StringComparison.OrdinalIgnoreCase)) return null;
        var path = Uri.UnescapeDataString(uri.AbsolutePath);
        if (path == "/") path = "/index.html";
        // Decoded, a request can still try "..", or a backslash Windows would treat as a separator.
        if (path.Contains('\\') || path.Contains('\0') || path.Split('/').Any(part => part is ".." or ".")) return null;
        var top = Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        var full = Path.GetFullPath(Path.Combine(top, path.TrimStart('/')));
        return full.StartsWith(top, StringComparison.Ordinal) && File.Exists(full) ? full : null;
    }

    static readonly Dictionary<string, string> Types = new(StringComparer.OrdinalIgnoreCase)
    {
        [".html"] = "text/html; charset=utf-8",
        [".js"] = "text/javascript; charset=utf-8",
        [".css"] = "text/css; charset=utf-8",
        [".json"] = "application/json; charset=utf-8",
        [".webmanifest"] = "application/manifest+json; charset=utf-8",
        [".txt"] = "text/plain; charset=utf-8",
        [".svg"] = "image/svg+xml",
        [".webp"] = "image/webp",
        [".png"] = "image/png",
        [".jpg"] = "image/jpeg",
        [".gif"] = "image/gif",
        [".ico"] = "image/x-icon",
        [".woff2"] = "font/woff2",
        [".mp3"] = "audio/mpeg",
        [".ogg"] = "audio/ogg",
        [".wav"] = "audio/wav",
        [".mp4"] = "video/mp4",
        [".webm"] = "video/webm",
    };

    public static string ContentType(string path) => Types.GetValueOrDefault(Path.GetExtension(path), "application/octet-stream");
}
