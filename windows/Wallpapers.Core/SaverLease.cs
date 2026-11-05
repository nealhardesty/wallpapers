namespace Wallpapers.Core;

/// The saver's proof of life: the running saver pings it, and a lapse means it is gone (so the wallpaper
/// app need not stay out of the way forever after a crash).
public sealed class SaverLease
{
    public static readonly TimeSpan Length = TimeSpan.FromSeconds(10);

    DateTime? last;

    public void Ping(DateTime now) => last = now;

    public void End() => last = null;

    public bool Active(DateTime now) => last is { } t && now - t < Length;
}
