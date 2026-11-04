namespace Wallpapers.Core;

/// Our pages, served from web/ at a virtual host that never resolves (SPEC §10.25.14).
public static class PageUrl
{
    public const string HostName = "wallpapers.example";
    public const string Origin = "https://" + HostName + "/";

    /// `display` is the surface's display key in Different mode (SPEC §10.25.7).
    public static string Desktop(Insets insets, string? display = null) => $"{Origin}index.html?host=windows&insets={insets.ToParam()}{Display(display)}";

    public static string Settings(string? display = null) => $"{Origin}index.html?host=windows&panel=open{Display(display)}";

    static string Display(string? key) => key == null ? "" : "&display=" + Uri.EscapeDataString(key);
}
