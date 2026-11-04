using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace Wallpapers.Core;

/// Bing's image-of-the-day archive → the shape tools/bing.mjs writes to web/bing.json, so the Bing
/// wallpaper works under the app's https origin without a CORS proxy (SPEC §4.6, §10.25.14).
public static partial class BingArchive
{
    public const string Url = "https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=8&mkt=en-US";

    [GeneratedRegex(@"^/th\?id=")] private static partial Regex ImagePath();
    [GeneratedRegex(@"^\d{8}$")] private static partial Regex Date();

    /// Throws FormatException for anything that isn't the archive we know (the same checks as tools/bing.mjs).
    public static string Shape(string archiveJson, DateTimeOffset now)
    {
        JsonNode? root;
        try { root = JsonNode.Parse(archiveJson); }
        catch (JsonException e) { throw new FormatException("Bing sent something that isn't JSON", e); }
        if (root?["images"] is not JsonArray images || images.Count == 0) throw new FormatException("Bing sent no images");

        var kept = new JsonArray();
        foreach (var image in images)
        {
            string? Get(string key) => image?[key] is JsonValue v && v.TryGetValue<string>(out var s) ? s : null;
            var (url, startdate) = (Get("url"), Get("startdate"));
            if (url is null || !ImagePath().IsMatch(url) || startdate is null || !Date().IsMatch(startdate))
                throw new FormatException($"unexpected image entry: {image?.ToJsonString()}");
            kept.Add(new JsonObject { ["url"] = url, ["copyright"] = Get("copyright"), ["copyrightlink"] = Get("copyrightlink"), ["startdate"] = startdate });
        }
        var generated = now.UtcDateTime.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
        return new JsonObject { ["generated"] = generated, ["images"] = kept }.ToJsonString();
    }
}
