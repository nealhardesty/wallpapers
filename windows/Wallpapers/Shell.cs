using System.Diagnostics;
using System.Text;

namespace Wallpapers;

/// Windows' side of things we don't own: the user's wallpaper, folders, the browser.
static class Shell
{
    const uint SPI_GETDESKWALLPAPER = 0x73, SPI_SETDESKWALLPAPER = 0x14;
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool SystemParametersInfo(uint action, uint param, StringBuilder? value, uint flags);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool SystemParametersInfo(uint action, uint param, string value, uint flags);

    /// Make Explorer repaint its own picture after our hosts are gone, so no stale frame is left
    /// (SPEC §10.25.5): the same path again, without SPIF_UPDATEINIFILE, so nothing is changed.
    public static void Repaint()
    {
        var current = new StringBuilder(520);
        SystemParametersInfo(SPI_GETDESKWALLPAPER, (uint)current.Capacity, current, 0);
        var path = RepaintArgs.PathToReapply(current.ToString());
        if (path == null) { Log.Info("repaint: skipped (no wallpaper path: a solid colour or a slideshow)"); return; }
        Log.Info($"repaint: {(SystemParametersInfo(SPI_SETDESKWALLPAPER, 0, path, 0) ? "done" : "failed")} ({Path.GetExtension(path)})");
    }

    /// A folder in Explorer, or a link in the default browser.
    public static void Open(string target)
    {
        try { Process.Start(new ProcessStartInfo(target) { UseShellExecute = true }); }
        catch (Exception e) when (e is System.ComponentModel.Win32Exception or InvalidOperationException) { Log.Warn($"open {target}: {e.Message}"); }
    }
}
