namespace Wallpapers.Core;

/// The Run-key value that starts the installed app at sign-in (SPEC §10.25.13).
public static class RunKey
{
    public const string Path = @"Software\Microsoft\Windows\CurrentVersion\Run";

    /// The value's name and its data: the installed exe, quoted.
    public static (string Name, string Data) Spec(InstallLayout l) => (l.RunValueName, "\"" + l.Exe + "\"");
}

/// The Start-menu shortcut, as the executor creates it.
public sealed record ShortcutSpec(string Path, string Target, string WorkingDirectory, string Description, string IconPath, int IconIndex);

public static class StartMenuShortcut
{
    public static ShortcutSpec Spec(InstallLayout l) =>
        new(l.Shortcut, l.Exe, l.Root, "Live wallpapers behind your desktop icons", l.Exe, 0);
}

/// The values under the Uninstall key that Settings > Apps shows. Ints are REG_DWORD, strings REG_SZ.
public static class UninstallEntry
{
    public static IReadOnlyDictionary<string, object> Values(InstallLayout l, AppVersion v, int sizeKb, string installDate, string? homepage)
    {
        var values = new Dictionary<string, object>
        {
            ["DisplayName"] = l.DisplayName,
            ["DisplayVersion"] = v.Display,
            ["Publisher"] = "Wallpapers",
            ["DisplayIcon"] = l.Exe + ",0",
            ["InstallLocation"] = l.Root,
            ["InstallDate"] = installDate,
            ["UninstallString"] = "\"" + l.Exe + "\" --uninstall",
            ["QuietUninstallString"] = "\"" + l.Exe + "\" --uninstall --keep-settings",
            ["NoModify"] = 1,
            ["NoRepair"] = 1,
            ["EstimatedSize"] = sizeKb,
        };
        if (homepage is not null) values["URLInfoAbout"] = homepage;
        return values;
    }
}

/// Everything uninstall removes: the install folder and shortcut always, the data folder only when the
/// settings are not kept, and the Run value and Uninstall key.
public sealed record UninstallPlan(IReadOnlyList<string> Folders, IReadOnlyList<string> Files, (string Key, string Name) RunValue, string UninstallKey)
{
    public static UninstallPlan For(InstallLayout l, bool keepSettings) =>
        new(keepSettings ? [l.Root] : [l.Root, l.DataFolder], [l.Shortcut], (RunKey.Path, l.RunValueName), l.UninstallKey);
}
