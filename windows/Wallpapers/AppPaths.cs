namespace Wallpapers;

/// Where this run keeps its data, and where its pages come from (SPEC §10.25.4, §10.25.15).
///   run  (normal)        %LOCALAPPDATA%\Wallpapers
///   dev  (WP_DEV=1)      %LOCALAPPDATA%\Wallpapers-dev   (never the normal settings)
///   test (--selftest)    %LOCALAPPDATA%\Wallpapers-test  (wiped by every self-test)
sealed class AppPaths
{
    public required string Flavor { get; init; }
    public required string Root { get; init; }
    public required string WebRoot { get; init; }
    public string UserData => Path.Combine(Root, "WebView2");
    public string SettingsFile => Path.Combine(Root, "settings.json");
    public string LogFile => Path.Combine(Root, "log.txt");
    /// The screen saver's own log: two processes never roll one file.
    public string SaverLogFile => Path.Combine(Root, "saver-log.txt");
    /// What a running saver is doing, for the self-test and WP_DEBUG (SPEC §10.25.12).
    public string SaverStateFile => Path.Combine(Root, "saver-state.json");

    public static AppPaths Resolve(string[] args, string? webRootOverride = null)
    {
        var flavor = args.Contains("--selftest") ? "test" : Environment.GetEnvironmentVariable("WP_DEV") == "1" ? "dev" : "run";
        var local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        return new AppPaths
        {
            Flavor = flavor,
            Root = Path.Combine(local, flavor == "run" ? "Wallpapers" : $"Wallpapers-{flavor}"),
            WebRoot = webRootOverride ?? (Environment.GetEnvironmentVariable("WP_WEB_ROOT") is { Length: > 0 } env ? env : Path.Combine(AppContext.BaseDirectory, "web")),
        };
    }

    public AppPaths WithWebRoot(string webRoot) => new() { Flavor = Flavor, Root = Root, WebRoot = webRoot };

    /// Why the pages can't be served from WebRoot, or null when they can.
    public string? CheckWebRoot() =>
        File.Exists(Path.Combine(WebRoot, "index.html")) ? null : $"No wallpapers found: {WebRoot} has no index.html";
}
