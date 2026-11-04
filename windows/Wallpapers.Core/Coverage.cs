namespace Wallpapers.Core;

/// One top-level window, as coverage needs it (SPEC §10.25.9). Bounds are DWM's extended frame
/// bounds (without the invisible resize border), in physical px.
public sealed record WindowFacts(string Class, bool Visible, bool Minimized, bool Cloaked, bool Ours, bool Transparent, bool LayeredAlphaZero, Rect Bounds);

/// Whether other windows cover a monitor (SPEC §10.25.9): covered when at least 97% of its work area
/// is under candidate windows. That catches fullscreen, maximized and two snapped halves.
public static class CoverageMath
{
    public const double Threshold = 0.97;

    /// The desktop and the taskbars, which are always "over" the wallpaper.
    static readonly HashSet<string> ShellClasses = ["Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd"];

    /// A window that can hide the wallpaper: shown, not minimized, not cloaked (another virtual desktop,
    /// Task View, a suspended UWP app), not ours, not the shell, and not a click-through overlay.
    public static bool IsCandidate(WindowFacts w) =>
        w.Visible && !w.Minimized && !w.Cloaked && !w.Ours && !w.Transparent && !w.LayeredAlphaZero && !ShellClasses.Contains(w.Class);

    /// The union's area inside `area` ÷ `area`'s area. Exact: vertical slabs between every x edge,
    /// and in each one the merged y intervals of the rects that span it.
    public static double Fraction(Rect area, IEnumerable<Rect> rects)
    {
        if (area.Width <= 0 || area.Height <= 0) return 0;
        var clipped = rects
            .Select(r => new Rect(Math.Max(r.Left, area.Left), Math.Max(r.Top, area.Top), Math.Min(r.Right, area.Right), Math.Min(r.Bottom, area.Bottom)))
            .Where(r => r.Width > 0 && r.Height > 0)
            .ToList();
        var xs = clipped.SelectMany(r => new[] { r.Left, r.Right }).Distinct().Order().ToList();
        long covered = 0;
        for (var i = 0; i + 1 < xs.Count; i++)
        {
            int x0 = xs[i], x1 = xs[i + 1];
            long height = 0;
            int top = 0, bottom = 0;
            var open = false;
            foreach (var r in clipped.Where(r => r.Left <= x0 && r.Right >= x1).OrderBy(r => r.Top))
            {
                if (open && r.Top <= bottom) { bottom = Math.Max(bottom, r.Bottom); continue; }
                if (open) height += bottom - top;
                (top, bottom, open) = (r.Top, r.Bottom, true);
            }
            if (open) height += bottom - top;
            covered += height * (x1 - x0);
        }
        return covered / ((double)area.Width * area.Height);
    }

    /// Per surface key: whether the candidates among `windows` cover its work area.
    public static IReadOnlyDictionary<string, bool> Covered(IReadOnlyList<SurfacePlan> plans, IReadOnlyList<WindowFacts> windows)
    {
        var rects = windows.Where(IsCandidate).Select(w => w.Bounds).ToList();
        return plans.ToDictionary(p => p.Key, p => Fraction(p.Work, rects) >= Threshold);
    }
}

/// Hysteresis for one monitor (SPEC §10.25.9): uncovered shows it at once; covered hides it only after
/// 300 ms of being covered, so Alt-Tab and window drags don't flicker.
public sealed class CoverageGate
{
    public const int PauseAfterMs = 300;

    long? coveredSince;

    public bool Hidden { get; private set; }

    /// The latest reading at `nowMs`. Returns the ms until the gate must be asked again (it is waiting
    /// to hide), or null.
    public int? Update(bool covered, long nowMs)
    {
        if (!covered) { coveredSince = null; Hidden = false; return null; }
        if (Hidden) return null;
        coveredSince ??= nowMs;
        var left = coveredSince.Value + PauseAfterMs - nowMs;
        if (left > 0) return (int)left;
        Hidden = true;
        return null;
    }
}
