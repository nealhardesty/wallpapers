namespace Wallpapers.Tests;

public class InstallSpecsTests
{
    static readonly InstallLayout L = InstallLayout.For("run", @"D:\Profiles\Zoë Ü\AppData\Local", @"D:\Profiles\Zoë Ü\AppData\Roaming");

    [Fact]
    public void Run_value_quotes_the_installed_exe() =>
        Assert.Equal(("Wallpapers", "\"D:\\Profiles\\Zoë Ü\\AppData\\Local\\Programs\\Wallpapers\\Wallpapers.exe\""), RunKey.Spec(L));

    [Fact]
    public void Shortcut_points_at_the_installed_exe()
    {
        var s = StartMenuShortcut.Spec(L);
        Assert.Equal(L.Shortcut, s.Path);
        Assert.Equal(L.Exe, s.Target);
        Assert.Equal(L.Root, s.WorkingDirectory);
        Assert.Equal("Live wallpapers behind your desktop icons", s.Description);
        Assert.Equal(L.Exe, s.IconPath);
        Assert.Equal(0, s.IconIndex);
    }

    [Fact]
    public void Uninstall_entry_lists_what_settings_apps_shows()
    {
        var v = AppVersion.Parse("0.11.0+20261104093000")!;
        var expected = new Dictionary<string, object>
        {
            ["DisplayName"] = "Wallpapers",
            ["DisplayVersion"] = "0.11.0",
            ["Publisher"] = "Wallpapers",
            ["DisplayIcon"] = L.Exe + ",0",
            ["InstallLocation"] = L.Root,
            ["InstallDate"] = "20261104",
            ["UninstallString"] = "\"" + L.Exe + "\" --uninstall",
            ["QuietUninstallString"] = "\"" + L.Exe + "\" --uninstall --keep-settings",
            ["NoModify"] = 1,
            ["NoRepair"] = 1,
            ["EstimatedSize"] = 72000,
            ["URLInfoAbout"] = "https://example.invalid/wallpapers",
        };
        Assert.Equal(expected.OrderBy(p => p.Key), UninstallEntry.Values(L, v, 72000, "20261104", "https://example.invalid/wallpapers").OrderBy(p => p.Key));
        Assert.DoesNotContain("URLInfoAbout", UninstallEntry.Values(L, v, 72000, "20261104", null).Keys);
    }

    [Fact]
    public void Uninstall_removes_only_what_install_made()
    {
        var keep = UninstallPlan.For(L, keepSettings: true);
        Assert.Equal(new[] { L.Root }, keep.Folders);
        Assert.Equal(new[] { L.Shortcut }, keep.Files);
        Assert.Equal((RunKey.Path, "Wallpapers"), keep.RunValue);
        Assert.Equal(L.UninstallKey, keep.UninstallKey);
        Assert.Equal(new[] { L.Root, L.DataFolder }, UninstallPlan.For(L, false).Folders);
    }
}
