namespace Wallpapers.Core;

/// Which wallpaper(s) the saver shows (SPEC §10.25.12).
public enum SaverShow { Same, Different, One }

/// The screen saver that was selected before ours, so Uninstall and "stop being the saver" can put it back.
public sealed record PreviousSaver(string? Exe, string? Active);

public static class SaverChoices
{
    public static readonly IReadOnlyList<int> StartAfterMinutes = [1, 3, 5, 10, 15, 30];
    public static readonly IReadOnlyList<int> ChangeMinutes = [1, 5, 15, 30];
}

/// The saver's own options, kept inside settings.json.
public sealed record SaverSettings(SaverShow Show = SaverShow.Same, string? Wallpaper = null, int ChangeMinutes = 5, bool Clock = false, PreviousSaver? Before = null)
{
    /// A hand-edited file never leaves the saver with an interval or a choice it cannot honour.
    public SaverSettings Normalized() => this with
    {
        ChangeMinutes = SaverChoices.ChangeMinutes.Contains(ChangeMinutes) ? ChangeMinutes : 5,
        Show = Show == SaverShow.One && string.IsNullOrEmpty(Wallpaper) ? SaverShow.Same : Show,
    };
}
