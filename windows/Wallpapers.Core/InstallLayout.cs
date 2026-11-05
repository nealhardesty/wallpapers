namespace Wallpapers.Core;

/// Where one flavor of the app installs and what it is called there (SPEC §10.25.13). Every path is
/// joined with a backslash by hand: the tests run on Linux, where Path.Combine would use a slash.
public sealed record InstallLayout(string Flavor, string Root, string Exe, string Web, string Saver, string Shortcut,
    string RunValueName, string UninstallKey, string DisplayName, string DataFolder)
{
    const string UninstallParent = @"Software\Microsoft\Windows\CurrentVersion\Uninstall";

    static string Join(string a, string b) => a.TrimEnd('\\') + '\\' + b;

    /// The run and test flavors only: dev never installs.
    public static InstallLayout For(string flavor, string localAppData, string roamingAppData)
    {
        string name, display;
        switch (flavor)
        {
            case "run": name = "Wallpapers"; display = "Wallpapers"; break;
            case "test": name = "Wallpapers-test"; display = "Wallpapers (test)"; break;
            default: throw new ArgumentException($"The {flavor} flavor does not install.", nameof(flavor));
        }
        var root = Join(Join(localAppData, "Programs"), name);
        return new InstallLayout(flavor, root, Join(root, "Wallpapers.exe"), Join(root, "web"), Join(root, "Wallpapers.scr"),
            Join(roamingAppData, @"Microsoft\Windows\Start Menu\Programs\" + name + ".lnk"),
            name, Join(UninstallParent, name), display, Join(localAppData, name));
    }

    /// Is this folder the install folder? Ignores case and trailing separators.
    public bool IsInstalledAt(string baseDirectory) =>
        string.Equals(baseDirectory.TrimEnd('\\', '/'), Root.TrimEnd('\\'), StringComparison.OrdinalIgnoreCase);
}
