using System.Globalization;

namespace Wallpapers.Core;

/// What Windows asked the saver to do (SPEC §10.25.12).
public enum SaverMode { None, Run, Preview, Configure }

/// The command line as Windows passes it to an .scr: /s run, /p HWND preview, /c[:HWND] options.
public sealed record SaverArgs(SaverMode Mode, long Window)
{
    /// Only the first argument decides. From an .scr, anything unrecognised opens the options rather than starting the whole app.
    public static SaverArgs Parse(IReadOnlyList<string> args, bool isScr)
    {
        var fallback = new SaverArgs(isScr ? SaverMode.Configure : SaverMode.None, 0);
        if (args.Count == 0) return fallback;
        var first = args[0].TrimStart('/', '-');
        if (first.Length == 0 || args[0][0] is not ('/' or '-') || args[0].Length - first.Length != 1) return fallback;   // "--selftest" is not "-s"
        if (first.Length > 1 && first[1] is not (':' or (>= '0' and <= '9'))) return fallback;
        var rest = first[1..].TrimStart(':');
        var handle = long.TryParse(rest.Length > 0 ? rest : args.Count > 1 ? args[1] : "", NumberStyles.None, CultureInfo.InvariantCulture, out var h) ? h : 0;
        switch (char.ToLowerInvariant(first[0]))
        {
            case 's': return new SaverArgs(SaverMode.Run, 0);
            case 'c': return new SaverArgs(SaverMode.Configure, handle);
            case 'p': return handle != 0 ? new SaverArgs(SaverMode.Preview, handle) : fallback;
            default: return fallback;
        }
    }
}
