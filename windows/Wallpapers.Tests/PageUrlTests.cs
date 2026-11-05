namespace Wallpapers.Tests;

public class PageUrlTests
{
    [Fact]
    public void Desktop_carries_host_and_insets() =>
        Assert.Equal("https://wallpapers.example/index.html?host=windows&insets=0,0,24,0", PageUrl.Desktop(new Insets(0, 0, 24, 0)));

    [Fact]
    public void Settings_opens_the_panel() =>
        Assert.Equal("https://wallpapers.example/index.html?host=windows&panel=open", PageUrl.Settings());

    [Fact]
    public void Desktop_with_display() =>
        Assert.Equal("https://wallpapers.example/index.html?host=windows&insets=0,0,24,0&display=m-3fa9c2", PageUrl.Desktop(new Insets(0, 0, 24, 0), "m-3fa9c2"));

    [Fact]
    public void Settings_with_display() =>
        Assert.Equal("https://wallpapers.example/index.html?host=windows&panel=open&display=m-3fa9c2-2", PageUrl.Settings("m-3fa9c2-2"));

    [Fact]
    public void Play_shows_one_wallpaper() =>
        Assert.Equal("https://wallpapers.example/index.html?host=windows&w=quest", PageUrl.Play("quest"));

    [Fact]
    public void Saver_Plain() =>
        Assert.Equal("https://wallpapers.example/index.html?host=windows-saver", PageUrl.Saver(null, null, false));

    [Fact]
    public void Saver_All() =>
        Assert.Equal("https://wallpapers.example/index.html?host=windows-saver&w=koi-pond&display=dell-u2720q-1&clock=drift",
            PageUrl.Saver("koi-pond", "dell-u2720q-1", true));

    [Fact]
    public void Saver_Escapes() => Assert.EndsWith("&w=a%20b", PageUrl.Saver("a b", null, false));
}
