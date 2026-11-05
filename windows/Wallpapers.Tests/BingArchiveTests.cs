using System.Text.Json;

namespace Wallpapers.Tests;

public class BingArchiveTests
{
    static readonly DateTimeOffset Now = new(2026, 11, 3, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Keeps_only_what_the_wallpaper_uses()
    {
        using var doc = JsonDocument.Parse(BingArchive.Shape(Fixture.Read("bing-archive.json"), Now));
        Assert.Equal("2026-11-03T12:00:00.000Z", doc.RootElement.GetProperty("generated").GetString());
        var images = doc.RootElement.GetProperty("images").EnumerateArray().ToList();
        Assert.Equal(2, images.Count);
        Assert.Equal(["url", "copyright", "copyrightlink", "startdate"], images[0].EnumerateObject().Select(p => p.Name));
        Assert.Equal("20261102", images[0].GetProperty("startdate").GetString());
        Assert.StartsWith("/th?id=OHR.FixtureHills", images[0].GetProperty("url").GetString());
    }

    [Theory]
    [InlineData("""{ "images": [ { "url": "https://elsewhere.example/x.jpg", "startdate": "20261102" } ] }""")]
    [InlineData("""{ "images": [ { "url": "/th?id=ok.jpg", "startdate": "Nov 2" } ] }""")]
    [InlineData("""{ "images": [] }""")]
    [InlineData("""{ "nothing": true }""")]
    [InlineData("not json")]
    public void Rejects_unexpected_entries(string archive) => Assert.Throws<FormatException>(() => BingArchive.Shape(archive, Now));
}
