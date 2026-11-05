namespace Wallpapers.Core;

/// Where Windows keeps "which screen saver", and how we give it back (SPEC §10.25.12). The test and dev
/// flavors use a private key so they can never change the machine's real saver.
public static class SaverRegistry
{
    public const string DesktopKey = @"Control Panel\Desktop";
    public const string PolicyKey = @"Software\Policies\Microsoft\Windows\Control Panel\Desktop";
    public const string ExeValue = "SCRNSAVE.EXE";
    public const string ActiveValue = "ScreenSaveActive";
    public const string TimeoutValue = "ScreenSaveTimeOut";

    public static string KeyFor(string flavor) => flavor == "run" ? DesktopKey : $@"Software\Wallpapers-{flavor}\Control Panel\Desktop";

    public static string PolicyKeyFor(string flavor) => flavor == "run" ? PolicyKey : $@"Software\Wallpapers-{flavor}\Policies\Control Panel\Desktop";

    /// Windows may store an 8.3 name, so both sides go through `longPath` first.
    public static bool IsOurs(string? current, string saverPath, Func<string, string> longPath) =>
        !string.IsNullOrEmpty(current) && string.Equals(longPath(current).TrimEnd('\\'), longPath(saverPath).TrimEnd('\\'), StringComparison.OrdinalIgnoreCase);
}

/// What to write back when we stop being the saver; `Exe` null means delete the value.
public sealed record SaverRestore(string? Exe, string Active)
{
    public static SaverRestore For(PreviousSaver? before, string saverPath, Func<string, string> longPath)
    {
        if (before?.Exe is { Length: > 0 } exe)
            return SaverRegistry.IsOurs(exe, saverPath, longPath) ? new(null, "0") : new(exe, before.Active ?? "1");
        return new(null, before?.Active is { Length: > 0 } a ? a : "0");
    }
}
