namespace Wallpapers.Core;

/// Our pages, served from web/ at a virtual host that never resolves (SPEC §10.25.14).
public static class PageUrl
{
    public const string HostName = "wallpapers.example";
    public const string Origin = "https://" + HostName + "/";

    /// `display` is the surface's display key in Different mode (SPEC §10.25.7).
    public static string Desktop(Insets insets, string? display = null) => $"{Origin}index.html?host=windows&insets={insets.ToParam()}{Display(display)}";

    public static string Settings(string? display = null) => $"{Origin}index.html?host=windows&panel=open{Display(display)}";

    /// Play in a Window (SPEC §10.25.8): one wallpaper, for this load only (?w= is never saved).
    public static string Play(string id) => $"{Origin}index.html?host=windows&w={Uri.EscapeDataString(id)}";

    /// The screen saver (SPEC §10.25.12): `wallpaper` pins one, `display` is the monitor's key, `clock` shows the drifting clock.
    public static string Saver(string? wallpaper, string? display, bool clock) =>
        $"{Origin}index.html?host=windows-saver{(wallpaper == null ? "" : "&w=" + Uri.EscapeDataString(wallpaper))}{Display(display)}{(clock ? "&clock=drift" : "")}";

    static string Display(string? key) => key == null ? "" : "&display=" + Uri.EscapeDataString(key);
}
