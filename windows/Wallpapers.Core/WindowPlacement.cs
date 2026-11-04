namespace Wallpapers.Core;

/// Where the settings window opens (SPEC §10.25.11): where it was last, pulled fully onto the
/// monitor it mostly sat on; or, the first time or when that monitor is gone, centred on the
/// primary at its default size. Physical px throughout, as Windows reports windows.
public static class WindowPlacement
{
    public static Rect Restore(Rect? saved, IReadOnlyList<MonitorInfo> monitors, int logicalWidth, int logicalHeight)
    {
        if (saved != null && monitors.MaxBy(m => Overlap(m.Work, saved)) is { } home && Overlap(home.Work, saved) > 0)
            return Fit(saved.Width, saved.Height, home.Work, saved.Left, saved.Top);

        var primary = monitors.FirstOrDefault(m => m.Primary) ?? monitors.FirstOrDefault();
        if (primary == null) return new Rect(0, 0, logicalWidth, logicalHeight);
        var work = primary.Work;
        int w = Math.Min(logicalWidth * primary.Dpi / 96, work.Width), h = Math.Min(logicalHeight * primary.Dpi / 96, work.Height);
        return Fit(w, h, work, work.Left + (work.Width - w) / 2, work.Top + (work.Height - h) / 2);
    }

    /// A w×h window at (left, top), cut to the work area's size and moved inside it.
    static Rect Fit(int w, int h, Rect work, int left, int top)
    {
        w = Math.Min(w, work.Width);
        h = Math.Min(h, work.Height);
        left = Math.Clamp(left, work.Left, work.Right - w);
        top = Math.Clamp(top, work.Top, work.Bottom - h);
        return new Rect(left, top, left + w, top + h);
    }

    static long Overlap(Rect a, Rect b) =>
        (long)Math.Max(0, Math.Min(a.Right, b.Right) - Math.Max(a.Left, b.Left)) * Math.Max(0, Math.Min(a.Bottom, b.Bottom) - Math.Max(a.Top, b.Top));
}
