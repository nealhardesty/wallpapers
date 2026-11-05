using System.Text.RegularExpressions;

namespace Wallpapers.Tests;

public class DisplayKeyTests
{
    static readonly Rect Screen = new(0, 0, 1920, 1080);
    static MonitorInfo Monitor(string device, string? path = null) => new(device, Screen, Screen, 96, true, path);

    [Fact]
    public void DisplayKey_is_stable_and_ignores_the_gdi_name_when_there_is_a_path()
    {
        // RDP hands out a new GDI name every session (DISPLAY81, then DISPLAY97); the path stays.
        const string path = @"\\?\DISPLAY#FAKE0001#1&0#{fixture}";
        var key = DisplayKey.For(Monitor(@"\\.\DISPLAY81", path));
        Assert.Matches(new Regex("^m-[0-9a-f]{6}$"), key);
        Assert.Equal(key, DisplayKey.For(Monitor(@"\\.\DISPLAY97", path)));
        Assert.Equal(key, DisplayKey.For(Monitor(@"\\.\DISPLAY1", path.ToUpperInvariant())));
    }

    [Fact]
    public void DisplayKey_falls_back_to_the_gdi_name()
    {
        var one = DisplayKey.For(Monitor(@"\\.\DISPLAY1"));
        Assert.Matches(new Regex("^m-[0-9a-f]{6}$"), one);
        Assert.NotEqual(one, DisplayKey.For(Monitor(@"\\.\DISPLAY2")));
        Assert.Equal(one, DisplayKey.For(Monitor(@"\\.\DISPLAY1", "")));
    }
}
