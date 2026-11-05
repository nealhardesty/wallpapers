namespace Wallpapers.Tests;

public class SaverLeaseTests
{
    // Monotonic stamps (time since boot), as Power passes them.
    static readonly TimeSpan T0 = TimeSpan.FromHours(30);

    [Fact]
    public void NotActiveUntilPinged() => Assert.False(new SaverLease().Active(T0));

    [Fact]
    public void ActiveWithinTenSeconds()
    {
        var l = new SaverLease();
        l.Ping(T0);
        Assert.True(l.Active(T0 + TimeSpan.FromSeconds(9.9)));
    }

    [Fact]
    public void LapsesAfterTen()
    {
        var l = new SaverLease();
        l.Ping(T0);
        Assert.False(l.Active(T0 + TimeSpan.FromSeconds(10.1)));
    }

    [Fact]
    public void EndStopsIt()
    {
        var l = new SaverLease();
        l.Ping(T0);
        l.End();
        Assert.False(l.Active(T0 + TimeSpan.FromSeconds(1)));
    }

    [Fact]
    public void APingAfterEndStartsAgain()
    {
        var l = new SaverLease();
        l.Ping(T0);
        l.End();
        l.Ping(T0 + TimeSpan.FromSeconds(2));
        Assert.True(l.Active(T0 + TimeSpan.FromSeconds(3)));
    }

    /// The clock it's given is the system's monotonic one, not the wall clock a user or a time sync can set back.
    [Fact]
    public void NowIsMonotonic()
    {
        var a = SaverLease.Now;
        var b = SaverLease.Now;
        Assert.True(b >= a);
        Assert.Equal(Environment.TickCount64, SaverLease.Now.TotalMilliseconds, 1000.0);
    }
}
