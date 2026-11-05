namespace Wallpapers.Tests;

public class AppSettingsTests
{
    [Fact]
    public void Missing_file_gives_defaults()
    {
        using var dir = new TempDir();
        Assert.Equal(new AppSettings(), AppSettings.Load(dir.File("settings.json")));
    }

    [Fact]
    public void Round_trips()
    {
        using var dir = new TempDir();
        var s = new AppSettings(DrawAboveIcons: true, SettingsBounds: new Rect(10, 20, 1290, 820));
        s.Save(dir.File("settings.json"));
        Assert.Equal(s, AppSettings.Load(dir.File("settings.json")));
    }

    [Fact]
    public void Monitors_round_trips_as_a_word()
    {
        using var dir = new TempDir();
        var s = new AppSettings(Monitors: MonitorMode.Different);
        s.Save(dir.File("settings.json"));
        Assert.Contains("\"monitors\": \"different\"", File.ReadAllText(dir.File("settings.json")));
        Assert.Equal(s, AppSettings.Load(dir.File("settings.json")));
    }

    [Fact]
    public void Old_files_without_monitors_are_same()
    {
        using var dir = new TempDir();
        File.WriteAllText(dir.File("settings.json"), "{ \"drawAboveIcons\": true }");
        Assert.Equal(new AppSettings(DrawAboveIcons: true, Monitors: MonitorMode.Same), AppSettings.Load(dir.File("settings.json")));
    }

    [Fact]
    public void Pointer_toggles_round_trip()
    {
        using var dir = new TempDir();
        var s = new AppSettings(FollowMouse: false, DesktopClicks: false);
        s.Save(dir.File("settings.json"));
        Assert.Contains("\"followMouse\": false", File.ReadAllText(dir.File("settings.json")));
        Assert.Equal(s, AppSettings.Load(dir.File("settings.json")));
    }

    [Fact]
    public void Old_files_without_the_toggles_follow_and_click()
    {
        using var dir = new TempDir();
        File.WriteAllText(dir.File("settings.json"), "{ \"drawAboveIcons\": true }");
        var s = AppSettings.Load(dir.File("settings.json"));
        Assert.True(s.FollowMouse);
        Assert.True(s.DesktopClicks);
    }

    [Fact]
    public void Corrupt_file_gives_defaults_and_is_kept_aside()
    {
        using var dir = new TempDir();
        File.WriteAllText(dir.File("settings.json"), "{ not json");
        Assert.Equal(new AppSettings(), AppSettings.Load(dir.File("settings.json")));
        Assert.Equal("{ not json", File.ReadAllText(dir.File("settings.bad.json")));
    }

    [Fact]
    public void Just_run_is_remembered()
    {
        using var dir = new TempDir();
        var s = new AppSettings(OfferInstall: false);
        s.Save(dir.File("settings.json"));
        Assert.Contains("\"offerInstall\": false", File.ReadAllText(dir.File("settings.json")));
        Assert.Equal(s, AppSettings.Load(dir.File("settings.json")));
    }

    [Fact]
    public void Old_files_offer_install()
    {
        using var dir = new TempDir();
        File.WriteAllText(dir.File("settings.json"), "{ \"drawAboveIcons\": true }");
        Assert.True(AppSettings.Load(dir.File("settings.json")).OfferInstall);
    }

    [Fact]
    public void Saver_DefaultsWhenMissing()
    {
        using var dir = new TempDir();
        File.WriteAllText(dir.File("settings.json"), "{\"monitors\":\"different\"}");
        Assert.Equal(new SaverSettings(), AppSettings.Load(dir.File("settings.json")).Saver);
    }

    [Fact]
    public void Saver_RoundTrips()
    {
        using var dir = new TempDir();
        var s = new AppSettings() with { Saver = new(SaverShow.Different, null, 15, true, new PreviousSaver(@"C:\Windows\System32\Ribbons.scr", "1")) };
        s.Save(dir.File("settings.json"));
        var text = File.ReadAllText(dir.File("settings.json"));
        Assert.Contains("\"saver\"", text);
        Assert.Contains("\"show\": \"different\"", text);
        Assert.Contains("\"changeMinutes\": 15", text);
        Assert.Equal(s, AppSettings.Load(dir.File("settings.json")));
    }
}
