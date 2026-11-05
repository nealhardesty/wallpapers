namespace Wallpapers.Tests;

public class WebFilesTests
{
    static TempDir Web()
    {
        var dir = new TempDir();
        Directory.CreateDirectory(System.IO.Path.Combine(dir.Path, "web", "wallpapers", "snow"));
        System.IO.File.WriteAllText(System.IO.Path.Combine(dir.Path, "web", "index.html"), "<!doctype html>");
        System.IO.File.WriteAllText(System.IO.Path.Combine(dir.Path, "web", "wallpapers", "snow", "snow.js"), "//");
        System.IO.File.WriteAllText(System.IO.Path.Combine(dir.Path, "web", "wallpapers", "snow", "a b.js"), "//");
        System.IO.File.WriteAllText(System.IO.Path.Combine(dir.Path, "secret.txt"), "not served");
        return dir;
    }

    static string Root(TempDir d) => System.IO.Path.Combine(d.Path, "web");

    [Theory]
    [InlineData("https://wallpapers.example/index.html", "index.html")]
    [InlineData("https://wallpapers.example/index.html?host=windows&insets=0,0,48,0", "index.html")]
    [InlineData("https://wallpapers.example/", "index.html")]
    [InlineData("https://wallpapers.example/wallpapers/snow/snow.js#x", "wallpapers/snow/snow.js")]
    [InlineData("https://wallpapers.example/wallpapers/snow/a%20b.js", "wallpapers/snow/a b.js")]
    public void Serves_files_under_the_web_folder(string url, string relative)
    {
        using var d = Web();
        Assert.Equal(System.IO.Path.GetFullPath(System.IO.Path.Combine(Root(d), relative)), WebFiles.Resolve(Root(d), url));
    }

    [Theory]
    [InlineData("https://wallpapers.example/../secret.txt")]
    [InlineData("https://wallpapers.example/%2e%2e/secret.txt")]
    [InlineData("https://wallpapers.example/wallpapers/%2e%2e%2f%2e%2e%2fsecret.txt")]
    [InlineData("https://wallpapers.example/..%5csecret.txt")]
    [InlineData("https://wallpapers.example/missing.js")]
    [InlineData("https://wallpapers.example/wallpapers/snow")]
    [InlineData("https://elsewhere.example/index.html")]
    [InlineData("not a url")]
    public void Serves_nothing_outside_it_or_missing(string url)
    {
        using var d = Web();
        Assert.Null(WebFiles.Resolve(Root(d), url));
    }

    [Theory]
    [InlineData("x.js", "text/javascript; charset=utf-8")]
    [InlineData("x.html", "text/html; charset=utf-8")]
    [InlineData("x.css", "text/css; charset=utf-8")]
    [InlineData("x.json", "application/json; charset=utf-8")]
    [InlineData("x.webmanifest", "application/manifest+json; charset=utf-8")]
    [InlineData("x.svg", "image/svg+xml")]
    [InlineData("x.webp", "image/webp")]
    [InlineData("x.PNG", "image/png")]
    [InlineData("x.unknown", "application/octet-stream")]
    public void Knows_the_types_web_uses(string name, string type) => Assert.Equal(type, WebFiles.ContentType(name));
}
