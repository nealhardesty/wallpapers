using Microsoft.Win32;

namespace Wallpapers;

/// Which screen saver Windows runs (SPEC §10.25.12): `SCRNSAVE.EXE`, `ScreenSaveActive` and `ScreenSaveTimeOut`
/// under `SaverRegistry.KeyFor(flavor)`. Only the run flavour's key is the real one, and only the run flavour
/// ever calls SystemParametersInfo; the others write a private key and nothing else. Registry errors throw
/// (IOException, UnauthorizedAccessException, SecurityException): the caller says what failed.
sealed class SaverSelection(string flavor, Action<string> log)
{
    public const string PolicySays = "Your organization's policy sets the screen saver";
    const uint Notify = N.SPIF_UPDATEINIFILE | N.SPIF_SENDCHANGE;

    /// Why our choice wouldn't stick, or null: Group Policy sets the saver (the current user's, or for the
    /// run flavour the machine's too).
    public string? PolicyReason()
    {
        static bool Sets(RegistryKey hive, string path)
        {
            using var key = hive.OpenSubKey(path);
            return key?.GetValue(SaverRegistry.ExeValue) != null || key?.GetValue(SaverRegistry.ActiveValue) != null;
        }
        var path = SaverRegistry.PolicyKeyFor(flavor);
        return Sets(Registry.CurrentUser, path) || (flavor == "run" && Sets(Registry.LocalMachine, path)) ? PolicySays : null;
    }

    public bool IsSelected(string saverPath)
    {
        using var key = Registry.CurrentUser.OpenSubKey(SaverRegistry.KeyFor(flavor));
        return SaverRegistry.IsOurs(key?.GetValue(SaverRegistry.ExeValue) as string, saverPath, LongPath);
    }

    /// Makes ours the saver and turns it on; returns what was there before, for RestoreIfOurs.
    public PreviousSaver Select(string saverPath)
    {
        PreviousSaver before;
        var value = N.ShortPath(saverPath) ?? saverPath;
        using (var key = Registry.CurrentUser.CreateSubKey(SaverRegistry.KeyFor(flavor)))
        {
            before = new(key.GetValue(SaverRegistry.ExeValue) as string, key.GetValue(SaverRegistry.ActiveValue) as string);
            key.SetValue(SaverRegistry.ExeValue, value, RegistryValueKind.String);
            key.SetValue(SaverRegistry.ActiveValue, "1", RegistryValueKind.String);
        }
        log($"saver: selected {value} (was {before.Exe ?? "none"}, active {before.Active ?? "unset"})");
        SetActive(true);
        return before;
    }

    /// When ours is still the saver, puts back the one before it (or none, off). Someone who has since picked
    /// another saver keeps theirs.
    public void RestoreIfOurs(PreviousSaver? before, string saverPath)
    {
        if (!IsSelected(saverPath)) { log("saver: not ours; left as it is"); return; }
        var restore = SaverRestore.For(before, saverPath, LongPath);
        using (var key = Registry.CurrentUser.CreateSubKey(SaverRegistry.KeyFor(flavor)))
        {
            if (restore.Exe == null) key.DeleteValue(SaverRegistry.ExeValue, throwOnMissingValue: false);
            else key.SetValue(SaverRegistry.ExeValue, restore.Exe, RegistryValueKind.String);
            key.SetValue(SaverRegistry.ActiveValue, restore.Active, RegistryValueKind.String);
        }
        log($"saver: restored {restore.Exe ?? "none"}, active {restore.Active}");
        SetActive(restore.Active == "1");
    }

    /// Minutes of idle before the saver starts, or null when unset or unreadable.
    public int? TimeoutMinutes()
    {
        if (flavor == "run")
            return N.SystemParametersInfo(N.SPI_GETSCREENSAVETIMEOUT, 0, out int seconds, 0) ? seconds / 60 : null;
        using var key = Registry.CurrentUser.OpenSubKey(SaverRegistry.KeyFor(flavor));
        return int.TryParse(key?.GetValue(SaverRegistry.TimeoutValue) as string, out var s) ? s / 60 : null;
    }

    public void SetTimeoutMinutes(int minutes)
    {
        log($"saver: start after {minutes} min");
        if (flavor == "run")
        {
            if (!N.SystemParametersInfo(N.SPI_SETSCREENSAVETIMEOUT, (uint)(minutes * 60), IntPtr.Zero, Notify))
                log($"saver: SPI_SETSCREENSAVETIMEOUT failed ({System.Runtime.InteropServices.Marshal.GetLastWin32Error()})");
            return;
        }
        using var key = Registry.CurrentUser.CreateSubKey(SaverRegistry.KeyFor(flavor));
        key.SetValue(SaverRegistry.TimeoutValue, (minutes * 60).ToString(System.Globalization.CultureInfo.InvariantCulture), RegistryValueKind.String);
    }

    /// Tells Windows (run flavour only; the others have nobody to tell).
    void SetActive(bool on)
    {
        if (flavor != "run") return;
        if (!N.SystemParametersInfo(N.SPI_SETSCREENSAVEACTIVE, on ? 1u : 0u, IntPtr.Zero, Notify))
            log($"saver: SPI_SETSCREENSAVEACTIVE failed ({System.Runtime.InteropServices.Marshal.GetLastWin32Error()})");
    }

    /// The long form of a path (Windows may store an 8.3 name), or the path itself when that fails.
    public static string LongPath(string path) => N.LongPath(path) ?? path;
}
