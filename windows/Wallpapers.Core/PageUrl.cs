namespace Wallpapers.Core;

/// Our pages, served from web/ at a virtual host that never resolves (SPEC §10.25.14).
public static class PageUrl
{
    public const string HostName = "wallpapers.example";
    public const string Origin = "https://" + HostName + "/";

    public static string Desktop(Insets insets) => $"{Origin}index.html?host=windows&insets={insets.ToParam()}";

    public static string Settings() => $"{Origin}index.html?host=windows&panel=open";
}
