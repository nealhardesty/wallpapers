namespace Wallpapers.Tests;

public class InstallLayoutTests
{
    const string L = @"D:\Profiles\Zoë Ü\AppData\Local";
    const string R = @"D:\Profiles\Zoë Ü\AppData\Roaming";

    [Fact]
    public void Run_flavor_installs_under_Programs()
    {
        var l = InstallLayout.For("run", L, R);
        Assert.Equal(L + @"\Programs\Wallpapers", l.Root);
        Assert.Equal(l.Root + @"\Wallpapers.exe", l.Exe);
        Assert.Equal(l.Root + @"\web", l.Web);
        Assert.Equal(l.Root + @"\Wallpapers.scr", l.Saver);
        Assert.Equal(R + @"\Microsoft\Windows\Start Menu\Programs\Wallpapers.lnk", l.Shortcut);
        Assert.Equal("Wallpapers", l.RunValueName);
        Assert.Equal(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\Wallpapers", l.UninstallKey);
        Assert.Equal("Wallpapers", l.DisplayName);
        Assert.Equal(L + @"\Wallpapers", l.DataFolder);
    }

    [Fact]
    public void Test_flavor_keeps_its_own_names()
    {
        var l = InstallLayout.For("test", L, R);
        Assert.EndsWith(@"\Programs\Wallpapers-test", l.Root);
        Assert.EndsWith(@"\Wallpapers-test.lnk", l.Shortcut);
        Assert.Equal("Wallpapers-test", l.RunValueName);
        Assert.EndsWith(@"\Wallpapers-test", l.UninstallKey);
        Assert.Equal("Wallpapers (test)", l.DisplayName);
        Assert.Equal(L + @"\Wallpapers-test", l.DataFolder);
    }

    [Fact]
    public void Dev_never_installs() => Assert.Throws<ArgumentException>(() => InstallLayout.For("dev", L, R));

    [Fact]
    public void Installed_at_ignores_case_and_trailing_separators()
    {
        var l = InstallLayout.For("run", L, R);
        Assert.True(l.IsInstalledAt(@"d:\profiles\zoë ü\appdata\local\programs\wallpapers\"));
        Assert.False(l.IsInstalledAt(L + @"\Wallpapers-build\run"));
    }
}
