namespace Wallpapers.Tests;

public class AppVersionTests
{
    static AppVersion V(string s) => AppVersion.Parse(s)!;

    [Fact]
    public void Parses_version_and_build_stamp()
    {
        Assert.Equal(new AppVersion(0, 10, 3, 20261104093000), AppVersion.Parse("0.10.3+20261104093000"));
        Assert.Equal(0, V("0.10.3").Stamp);
        Assert.Null(AppVersion.Parse("?"));
        Assert.Null(AppVersion.Parse(""));
        Assert.Null(AppVersion.Parse(null));
        Assert.Null(AppVersion.Parse("1.2"));
    }

    [Fact]
    public void Compares_numerically_then_by_stamp()
    {
        Assert.True(V("0.11.0") > V("0.9.9"));
        Assert.True(V("1.0.0") > V("0.99.99"));
        Assert.True(V("0.10.3+2") > V("0.10.3+1"));
        Assert.Equal(0, V("0.10.3+1").CompareTo(V("0.10.3+1")));
    }

    [Fact]
    public void Display_drops_the_stamp() => Assert.Equal("0.10.3", V("0.10.3+20261104093000").Display);
}
