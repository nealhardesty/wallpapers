namespace Wallpapers.Core;

/// CSS px kept clear on each edge of a surface (the taskbar), as the page's ?insets=t,r,b,l (SPEC §10.25.7).
public sealed record Insets(int Top, int Right, int Bottom, int Left)
{
    public static readonly Insets None = new(0, 0, 0, 0);
    public string ToParam() => $"{Top},{Right},{Bottom},{Left}";
}
