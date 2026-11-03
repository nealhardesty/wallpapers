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
    public void Corrupt_file_gives_defaults_and_is_kept_aside()
    {
        using var dir = new TempDir();
        File.WriteAllText(dir.File("settings.json"), "{ not json");
        Assert.Equal(new AppSettings(), AppSettings.Load(dir.File("settings.json")));
        Assert.Equal("{ not json", File.ReadAllText(dir.File("settings.bad.json")));
    }
}
