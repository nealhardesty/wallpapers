using System.Globalization;

namespace Wallpapers.Core;

/// The system's double-click time and box (SPEC §10.25.17): the second press within TimeMs, and within
/// half the box's width and height of the first.
public sealed record DoubleClickRule(int TimeMs, int Width, int Height)
{
    public static readonly DoubleClickRule WindowsDefault = new(500, 4, 4);

    public bool IsDouble(int x1, int y1, long t1, int x2, int y2, long t2) =>
        t2 - t1 <= TimeMs && Math.Abs(x2 - x1) <= Width / 2 && Math.Abs(y2 - y1) <= Height / 2;
}

public abstract record PointerAction(string Key, PointerHit At);
public sealed record Press(string Key, PointerHit At) : PointerAction(Key, At);
public sealed record DragMove(string Key, PointerHit At) : PointerAction(Key, At);
public sealed record Release(string Key, PointerHit At, bool DoubleClick) : PointerAction(Key, At);

/// The press decides: one classified bare is forwarded through its release, to the surface it landed on
/// (even when the release is elsewhere); anything else forwards nothing and breaks the double-click pair.
public sealed class GestureTracker(DoubleClickRule rule)
{
    PointerTarget? target;
    bool double_;
    (string Key, int X, int Y, long T)? last;

    public string? Pressed => target?.Key;

    public Press? Down(PointerTarget? t, HitKind kind, int x, int y, long nowMs)
    {
        if (t is null || kind != HitKind.Bare)
        {
            target = null;
            last = null;
            return null;
        }
        target = t;
        double_ = last is { } l && l.Key == t.Key && rule.IsDouble(l.X, l.Y, l.T, x, y, nowMs);
        last = double_ ? null : (t.Key, x, y, nowMs);
        return new Press(t.Key, PointerMap.Into(t, x, y));
    }

    public DragMove? Move(int x, int y) =>
        target is { } t ? new DragMove(t.Key, PointerMap.Into(t, x, y)) : null;

    public Release? Up(int x, int y, long nowMs)
    {
        if (target is not { } t) return null;
        target = null;
        return new Release(t.Key, PointerMap.Into(t, x, y), double_);
    }
}

/// The Mac's way (SPEC §10.25.8): synthetic pointer and mouse events at a CSS point in the newest stage
/// iframe's document. Does nothing when there is no stage.
public static class PointerScript
{
    public static string Press(bool down, double cssX, double cssY, bool doubleClick = false)
    {
        string x = cssX.ToString("F1", CultureInfo.InvariantCulture), y = cssY.ToString("F1", CultureInfo.InvariantCulture);
        var body = down
            ? "fire(new w.PointerEvent('pointerdown', { ...o, buttons: 1 })); fire(new w.MouseEvent('mousedown', { ...o, buttons: 1 }));"
            : "fire(new w.PointerEvent('pointerup', { ...o, buttons: 0 })); fire(new w.MouseEvent('mouseup', { ...o, buttons: 0 })); " +
              "fire(new w.MouseEvent('click', { ...o, buttons: 0 }));" +
              (doubleClick ? " fire(new w.MouseEvent('dblclick', { ...o, buttons: 0, detail: 2 }));" : "");
        return "(() => { const f = [...document.querySelectorAll('iframe.stage')].pop(); const d = f && f.contentDocument; if (!d) return;" +
            $" const x = {x}, y = {y}, t = d.elementFromPoint(x, y) || d.documentElement, w = d.defaultView;" +
            $" const o = {{ bubbles: true, cancelable: true, composed: true, clientX: {x}, clientY: {y}, button: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true, view: w }};" +
            $" const fire = e => t.dispatchEvent(e); {body} }})()";
    }
}
