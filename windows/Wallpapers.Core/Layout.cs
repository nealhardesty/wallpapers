using System.Text.Json;
using System.Text.Json.Nodes;

namespace Wallpapers.Core;

/// One wallpaper surface: its stable display key, the monitor's GDI name, friendly name and 1-based
/// number, where it goes (physical px), its CSS scale and the insets its page gets (SPEC §10.25.6).
public sealed record SurfacePlan(string Key, string Device, string Name, int Number, bool Primary, Rect Bounds, Rect Work, double Scale, Insets Insets);

/// What changed between two plans, matched by Key: Kept pairs are (old, new), in the new plan's order.
public sealed record LayoutChange(IReadOnlyList<SurfacePlan> Added, IReadOnlyList<SurfacePlan> Removed, IReadOnlyList<(SurfacePlan Old, SurfacePlan New)> Kept);

/// Monitors → surfaces (SPEC §10.25.6): one surface per monitor.
public static class Layout
{
    /// Primary first, then by left, then top; numbered from 1. A key already taken gets -2, -3 in this order.
    public static IReadOnlyList<SurfacePlan> Plan(IReadOnlyList<MonitorInfo> monitors)
    {
        var taken = new HashSet<string>();
        return monitors.OrderByDescending(m => m.Primary).ThenBy(m => m.Bounds.Left).ThenBy(m => m.Bounds.Top)
            .Select((m, i) =>
            {
                var stable = DisplayKey.For(m);
                var key = stable;
                for (var n = 2; !taken.Add(key); n++) key = $"{stable}-{n}";
                var name = string.IsNullOrWhiteSpace(m.Name) ? $"Display {i + 1}" : m.Name;
                return new SurfacePlan(key, m.Device, name, i + 1, m.Primary, m.Bounds, m.Work, m.Dpi / 96.0, InsetsFor(m));
            })
            .ToList();
    }

    public static LayoutChange Diff(IReadOnlyList<SurfacePlan> current, IReadOnlyList<SurfacePlan> next)
    {
        var old = current.ToDictionary(p => p.Key);
        var keys = next.Select(p => p.Key).ToHashSet();
        return new LayoutChange(
            next.Where(p => !old.ContainsKey(p.Key)).ToList(),
            current.Where(p => !keys.Contains(p.Key)).ToList(),
            next.Where(p => old.ContainsKey(p.Key)).Select(p => (old[p.Key], p)).ToList());
    }

    /// The surface keeps its page but moves or resizes (a resolution or DPI change).
    public static bool Moved(SurfacePlan a, SurfacePlan b) => a.Bounds != b.Bounds || a.Scale != b.Scale;

    /// Its page's URL changes (the insets, after a taskbar move), so it navigates.
    public static bool NeedsNavigate(SurfacePlan a, SurfacePlan b) => a.Insets != b.Insets;

    /// The taskbar on any edge, as CSS px: (monitor edge − work edge) ÷ scale. Auto-hide gives 0.
    public static Insets InsetsFor(MonitorInfo m)
    {
        var scale = m.Dpi / 96.0;
        int Css(int physical) => (int)Math.Round(Math.Max(0, physical) / scale, MidpointRounding.AwayFromZero);
        return new Insets(Css(m.Work.Top - m.Bounds.Top), Css(m.Bounds.Right - m.Work.Right),
            Css(m.Bounds.Bottom - m.Work.Bottom), Css(m.Work.Left - m.Bounds.Left));
    }
}

/// Where a surface's window goes in a fake layout (WP_FAKE_DISPLAYS): a rect on the real screen, and the
/// scale that keeps the page at the fake monitor's CSS size.
public sealed record HostPlacement(Rect Screen, double RasterizationScale);

public static class FakeLayout
{
    /// The fake layout shrunk by one factor (never above 1) so its bounding box fits the real work area
    /// with a 5% margin, centred there.
    public static IReadOnlyDictionary<string, HostPlacement> Fit(IReadOnlyList<SurfacePlan> plans, Rect realWork)
    {
        if (plans.Count == 0) return new Dictionary<string, HostPlacement>();
        int left = plans.Min(p => p.Bounds.Left), top = plans.Min(p => p.Bounds.Top);
        int width = plans.Max(p => p.Bounds.Right) - left, height = plans.Max(p => p.Bounds.Bottom) - top;
        var factor = Math.Min(1, Math.Min(realWork.Width * 0.95 / width, realWork.Height * 0.95 / height));
        double x0 = realWork.Left + (realWork.Width - width * factor) / 2, y0 = realWork.Top + (realWork.Height - height * factor) / 2;
        int X(int x) => (int)Math.Round(x0 + (x - left) * factor);
        int Y(int y) => (int)Math.Round(y0 + (y - top) * factor);
        return plans.ToDictionary(p => p.Key, p => new HostPlacement(
            new Rect(X(p.Bounds.Left), Y(p.Bounds.Top), X(p.Bounds.Right), Y(p.Bounds.Bottom)), p.Scale * factor));
    }
}

/// Monitor layouts as JSON: what `Wallpapers.exe --dump-displays` writes, and the test fixtures.
public static class Displays
{
    sealed record File(List<MonitorInfo> Monitors);

    static readonly JsonSerializerOptions Options = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase, WriteIndented = true };

    public static IReadOnlyList<MonitorInfo> FromJson(string json) =>
        JsonSerializer.Deserialize<File>(json, Options)?.Monitors ?? throw new FormatException("no monitors");

    /// Each monitor also gets its display key, for reading; FromJson ignores it.
    public static string ToJson(IReadOnlyList<MonitorInfo> monitors)
    {
        var json = JsonSerializer.SerializeToNode(new File([.. monitors]), Options)!;
        var nodes = json["monitors"]!.AsArray();
        for (var i = 0; i < monitors.Count; i++) nodes[i]!["key"] = DisplayKey.For(monitors[i]);
        return json.ToJsonString(Options);
    }
}
