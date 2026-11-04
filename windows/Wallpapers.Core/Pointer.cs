namespace Wallpapers.Core;

public enum HitKind { Bare, Icon, Other }

/// The desktop pointer's verdict on what is under the cursor (SPEC §10.25.17).
public static class HitTest
{
    public const string HostClass = "WallpapersHost";

    static readonly HashSet<string> Desktop = ["SysListView32", "SHELLDLL_DefView", "Progman", "WorkerW", HostClass];

    public static bool IsDesktop(string windowClass) => Desktop.Contains(windowClass);

    /// Off the desktop classes: Other (UIA is never asked). On them: an icon when UIA says list item,
    /// else bare, including when UIA failed.
    public static HitKind Kind(string windowClass, bool? uiaListItem) =>
        !IsDesktop(windowClass) ? HitKind.Other : uiaListItem == true ? HitKind.Icon : HitKind.Bare;
}

public sealed record PointerTarget(string Key, HostPlacement Placement, bool Visible);

/// A physical point on a surface: its local px and its CSS px.
public sealed record PointerHit(string Key, int LocalX, int LocalY, double CssX, double CssY);

public static class PointerMap
{
    /// The first visible target whose screen rect contains the point.
    public static PointerTarget? Find(IReadOnlyList<PointerTarget> targets, int x, int y) =>
        targets.FirstOrDefault(t => t.Visible && t.Placement.Screen.Contains(x, y));

    /// Maps even a point outside the target (a drag that left it).
    public static PointerHit Into(PointerTarget t, int x, int y)
    {
        int lx = x - t.Placement.Screen.Left, ly = y - t.Placement.Screen.Top;
        return new PointerHit(t.Key, lx, ly, lx / t.Placement.RasterizationScale, ly / t.Placement.RasterizationScale);
    }
}

/// At most one move per interval; the latest held point is flushed when the burst ends.
public sealed class MoveThrottle(int intervalMs = 16)
{
    long? lastSent;
    (int X, int Y)? held;
    long lastOffer;

    public (int X, int Y)? Offer(int x, int y, long nowMs)
    {
        lastOffer = nowMs;
        if (lastSent is not { } last || nowMs - last >= intervalMs)
        {
            lastSent = nowMs;
            held = null;
            return (x, y);
        }
        held = (x, y);
        return null;
    }

    /// Ms until the held point is due, or null when nothing is held.
    public int? DueInMs => held is null ? null : (int)Math.Max(0, lastSent!.Value + intervalMs - lastOffer);

    public (int X, int Y)? Flush(long nowMs)
    {
        var p = held;
        held = null;
        if (p is not null) lastSent = nowMs;
        return p;
    }
}

/// Raw input is the cursor source; the 33 ms poll only counts while it has been silent (an elevated
/// foreground window starves it), and only for a position not seen before.
public sealed class CursorSource
{
    public const int RawSilentMs = 250;

    long? lastRaw;
    (int X, int Y)? lastSeen;

    public void Raw(int x, int y, long nowMs)
    {
        lastRaw = nowMs;
        lastSeen = (x, y);
    }

    public bool UsePoll(int x, int y, long nowMs)
    {
        if (lastRaw is { } raw && nowMs - raw < RawSilentMs) return false;
        if (lastSeen == (x, y)) return false;
        lastSeen = (x, y);
        return true;
    }
}
