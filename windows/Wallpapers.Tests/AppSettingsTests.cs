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
    public void Corrupt_file_gives_defaults_and_is_kept_aside()
    {
        using var dir = new TempDir();
        File.WriteAllText(dir.File("settings.json"), "{ not json");
        Assert.Equal(new AppSettings(), AppSettings.Load(dir.File("settings.json")));
        Assert.Equal("{ not json", File.ReadAllText(dir.File("settings.bad.json")));
    }
}
