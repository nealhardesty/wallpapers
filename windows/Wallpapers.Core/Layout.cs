using System.Text.Json;

namespace Wallpapers.Core;

/// One wallpaper surface: where it goes (physical px), its CSS scale and the insets its page gets.
/// Key is the monitor's device name in W1; W2 makes it a stable display key (SPEC §10.25.6).
public sealed record SurfacePlan(string Key, string Device, Rect Bounds, double Scale, Insets Insets);

/// Monitors → surfaces (SPEC §10.25.6). W1 has Same mode only: one surface per monitor.
public static class Layout
{
    public static IReadOnlyList<SurfacePlan> Plan(IReadOnlyList<MonitorInfo> monitors) =>
        monitors.OrderByDescending(m => m.Primary).ThenBy(m => m.Bounds.Left).ThenBy(m => m.Bounds.Top)
            .Select(m => new SurfacePlan(m.Device, m.Device, m.Bounds, m.Dpi / 96.0, InsetsFor(m)))
            .ToList();

    /// The taskbar on any edge, as CSS px: (monitor edge − work edge) ÷ scale. Auto-hide gives 0.
    public static Insets InsetsFor(MonitorInfo m)
    {
        var scale = m.Dpi / 96.0;
        int Css(int physical) => (int)Math.Round(Math.Max(0, physical) / scale, MidpointRounding.AwayFromZero);
        return new Insets(Css(m.Work.Top - m.Bounds.Top), Css(m.Bounds.Right - m.Work.Right),
            Css(m.Bounds.Bottom - m.Work.Bottom), Css(m.Work.Left - m.Bounds.Left));
    }
}

/// Monitor layouts as JSON: what `Wallpapers.exe --dump-displays` writes, and the test fixtures.
public static class Displays
{
    sealed record File(List<MonitorInfo> Monitors);

    static readonly JsonSerializerOptions Options = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase, WriteIndented = true };

    public static IReadOnlyList<MonitorInfo> FromJson(string json) =>
        JsonSerializer.Deserialize<File>(json, Options)?.Monitors ?? throw new FormatException("no monitors");

    public static string ToJson(IReadOnlyList<MonitorInfo> monitors) => JsonSerializer.Serialize(new File([.. monitors]), Options);
}
