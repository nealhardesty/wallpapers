namespace Wallpapers.Core;

/// The saver's proof of life: the running saver pings it, and a lapse means it is gone (so the wallpaper
/// app need not stay out of the way forever after a crash). Times are monotonic (Now: time since boot),
/// so a wall clock set back can't keep the desktop hidden.
public sealed class SaverLease
{
    public static readonly TimeSpan Length = TimeSpan.FromSeconds(10);

    /// The monotonic clock to pass in: Environment.TickCount64, which no clock change moves.
    public static TimeSpan Now => TimeSpan.FromMilliseconds(Environment.TickCount64);

    TimeSpan? last;

    public void Ping(TimeSpan now) => last = now;

    public void End() => last = null;

    public bool Active(TimeSpan now) => last is { } t && now - t < Length;
}
