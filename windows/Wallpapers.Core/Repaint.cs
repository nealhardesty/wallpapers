namespace Wallpapers.Core;

/// Quit and crash cleanup make Explorer repaint its own picture by re-applying the wallpaper path
/// (SPEC §10.25.5). A solid colour or some slideshows report no path: then nothing is re-applied,
/// because setting "" would remove the user's picture.
public static class RepaintArgs
{
    public static string? PathToReapply(string current) => string.IsNullOrWhiteSpace(current) ? null : current;
}
