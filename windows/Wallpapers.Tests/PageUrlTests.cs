namespace Wallpapers.Tests;

public class PageUrlTests
{
    [Fact]
    public void Desktop_carries_host_and_insets() =>
        Assert.Equal("https://wallpapers.example/index.html?host=windows&insets=0,0,24,0", PageUrl.Desktop(new Insets(0, 0, 24, 0)));

    [Fact]
    public void Settings_opens_the_panel() =>
        Assert.Equal("https://wallpapers.example/index.html?host=windows&panel=open", PageUrl.Settings());
}
