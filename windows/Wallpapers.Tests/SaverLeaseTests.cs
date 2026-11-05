namespace Wallpapers.Tests;

public class SaverLeaseTests
{
    static readonly DateTime T0 = new(2026, 11, 5, 12, 0, 0, DateTimeKind.Utc);

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
}
