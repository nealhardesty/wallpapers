namespace Wallpapers.Tests;

public class SaverArgsTests
{
    [Theory]
    [InlineData(new[] { "/s" }, false, SaverMode.Run, 0L)]
    [InlineData(new[] { "/S" }, true, SaverMode.Run, 0L)]
    [InlineData(new[] { "-s" }, true, SaverMode.Run, 0L)]
    [InlineData(new[] { "/s", "--selftest" }, true, SaverMode.Run, 0L)]
    [InlineData(new[] { "/p", "1234" }, true, SaverMode.Preview, 1234L)]
    [InlineData(new[] { "/P:1234" }, true, SaverMode.Preview, 1234L)]
    [InlineData(new[] { "/p1234" }, true, SaverMode.Preview, 1234L)]
    [InlineData(new[] { "/c" }, true, SaverMode.Configure, 0L)]
    [InlineData(new[] { "/c:4567" }, true, SaverMode.Configure, 4567L)]
    [InlineData(new[] { "/C", "4567" }, true, SaverMode.Configure, 4567L)]
    [InlineData(new string[0], true, SaverMode.Configure, 0L)]
    [InlineData(new string[0], false, SaverMode.None, 0L)]
    [InlineData(new[] { "--settings" }, false, SaverMode.None, 0L)]
    [InlineData(new[] { "/p" }, true, SaverMode.Configure, 0L)]
    [InlineData(new[] { "/p:abc" }, true, SaverMode.Configure, 0L)]
    [InlineData(new[] { "/p" }, false, SaverMode.None, 0L)]
    [InlineData(new[] { "--selftest", "/s" }, false, SaverMode.None, 0L)]
    public void Parses(string[] args, bool isScr, SaverMode mode, long window) =>
        Assert.Equal(new SaverArgs(mode, window), SaverArgs.Parse(args, isScr));
}
