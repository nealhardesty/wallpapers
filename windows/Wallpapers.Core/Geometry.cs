using System.Text.Json.Serialization;

namespace Wallpapers.Core;

/// CSS px kept clear on each edge of a surface (the taskbar), as the page's ?insets=t,r,b,l (SPEC §10.25.7).
public sealed record Insets(int Top, int Right, int Bottom, int Left)
{
    public static readonly Insets None = new(0, 0, 0, 0);
    public string ToParam() => $"{Top},{Right},{Bottom},{Left}";
}

/// A rectangle in physical px (Windows' virtual-screen coordinates; the origin can be negative).
public sealed record Rect(int Left, int Top, int Right, int Bottom)
{
    [JsonIgnore] public int Width => Right - Left;
    [JsonIgnore] public int Height => Bottom - Top;
    public bool Contains(int x, int y) => x >= Left && x < Right && y >= Top && y < Bottom;
}

/// One monitor as Windows reports it: its rect, its work area (less the taskbar) and its DPI.
public sealed record MonitorInfo(string Device, Rect Bounds, Rect Work, int Dpi, bool Primary);
