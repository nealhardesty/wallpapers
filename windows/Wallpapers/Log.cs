using System.Diagnostics;

namespace Wallpapers;

/// The app's log: log.txt in the data folder, rolling at 1 MB (SPEC §10.25.4).
static class Log
{
    static RollingLog? file;

    public static void Init(AppPaths paths)
    {
        Directory.CreateDirectory(paths.Root);
        file = new RollingLog(paths.LogFile);
    }

    public static void Info(string text) => Write("info ", text);
    public static void Warn(string text) => Write("warn ", text);
    public static void Error(string text) => Write("error", text);
    public static bool Verbose { get; } = Environment.GetEnvironmentVariable("WP_DEBUG") == "1";
    public static void Debug(string text) { if (Verbose) Write("debug", text); }

    static void Write(string level, string text)
    {
        var line = $"{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff} {level} {text}";
        System.Diagnostics.Debug.WriteLine(line);
        try { file?.Write(line); } catch (IOException) { }
    }
}
