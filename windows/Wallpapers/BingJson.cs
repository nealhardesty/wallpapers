namespace Wallpapers;

/// Answers the page's bing.json natively, like the Android and Mac apps (SPEC §10.25.14): Bing's
/// archive fetched by the app (no CORS for it), in tools/bing.mjs's shape, cached for an hour.
sealed class BingJson
{
    static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(10) };
    readonly SemaphoreSlim gate = new(1, 1);
    (DateTimeOffset at, string body)? cached;

    public async Task<(int Status, string Body)> GetAsync()
    {
        await gate.WaitAsync();
        try
        {
            if (cached is { } c && DateTimeOffset.UtcNow - c.at < TimeSpan.FromHours(1)) return (200, c.body);
            var archive = await Http.GetStringAsync(BingArchive.Url);
            var body = BingArchive.Shape(archive, DateTimeOffset.UtcNow);
            cached = (DateTimeOffset.UtcNow, body);
            return (200, body);
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException or FormatException)
        {
            Log.Warn($"bing.json: {e.Message}");
            return (503, """{"error":"Bing is unreachable"}""");
        }
        finally { gate.Release(); }
    }
}
