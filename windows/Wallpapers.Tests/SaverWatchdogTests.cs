namespace Wallpapers.Tests;

public class SaverWatchdogTests
{
    static SaverWatchdog New() => new(retryTicks: 3);

    static WatchdogStep Stall(SaverWatchdog w, int times)
    {
        var step = WatchdogStep.None;
        for (var i = 0; i < times; i++) step = w.Tick(-1);
        return step;
    }

    [Fact]
    public void AdvancingFramesDoNothing()
    {
        var w = New();
        Assert.Equal(WatchdogStep.None, w.Tick(1));
        Assert.Equal(WatchdogStep.None, w.Tick(5));
        Assert.Equal(WatchdogStep.None, w.Tick(9));
        Assert.Equal(0, w.Recoveries);
    }

    [Fact]
    public void TwoStallsReload()
    {
        var w = New();
        Assert.Equal(WatchdogStep.None, w.Tick(10));
        Assert.Equal(WatchdogStep.None, w.Tick(10));
        Assert.Equal(WatchdogStep.Reload, w.Tick(10));
        Assert.Equal(1, w.Recoveries);
    }

    [Fact]
    public void NoAnswerIsAStall()
    {
        var w = New();
        w.Tick(5);
        Assert.Equal(WatchdogStep.None, w.Tick(-1));
        Assert.Equal(WatchdogStep.Reload, w.Tick(-1));
    }

    [Fact]
    public void AfterAReloadTheCounterStartsAgain()
    {
        var w = New();
        Stall(w, 2);
        Assert.Equal(WatchdogStep.None, w.Tick(0));
        Assert.Equal(WatchdogStep.None, w.Tick(3));
        Assert.Equal(1, w.Recoveries);
    }

    [Fact]
    public void StepsGoReloadRecreateFallback()
    {
        var w = New();
        Assert.Equal(WatchdogStep.Reload, Stall(w, 2));
        Assert.Equal(WatchdogStep.Recreate, Stall(w, 2));
        Assert.Equal(WatchdogStep.Fallback, Stall(w, 2));
        Assert.True(w.InFallback);
    }

    static SaverWatchdog InFallback()
    {
        var w = New();
        Stall(w, 6);
        return w;
    }

    [Fact]
    public void FallbackRetriesAfterRetryTicks()
    {
        var w = InFallback();
        Assert.Equal(WatchdogStep.None, w.Tick(-1));
        Assert.Equal(WatchdogStep.None, w.Tick(-1));
        Assert.Equal(WatchdogStep.Retry, w.Tick(-1));
        Assert.True(w.InFallback);
    }

    [Fact]
    public void RetryThatWorksRecovers()
    {
        var w = InFallback();
        Stall(w, 3);
        Assert.Equal(WatchdogStep.None, w.Tick(0));
        Assert.Equal(WatchdogStep.Recovered, w.Tick(4));
        Assert.False(w.InFallback);
        Assert.Equal(0, w.Recoveries);
    }

    [Fact]
    public void RetryThatStallsFallsBackAgain()
    {
        var w = InFallback();
        Assert.Equal(WatchdogStep.Retry, Stall(w, 3));
        Assert.Equal(WatchdogStep.Fallback, Stall(w, 2));
        Assert.Equal(WatchdogStep.None, w.Tick(-1));
        Assert.Equal(WatchdogStep.None, w.Tick(-1));
        Assert.Equal(WatchdogStep.Retry, w.Tick(-1));
    }

    [Fact]
    public void RecoveredLiveResetsRecoveries()
    {
        var w = New();
        w.Tick(1);
        Assert.Equal(WatchdogStep.Reload, Stall(w, 2));
        w.Tick(0);
        w.Tick(5);
        w.Tick(9);
        Assert.Equal(0, w.Recoveries);
        Assert.Equal(WatchdogStep.Reload, Stall(w, 2));
    }

    [Fact]
    public void CrashedCountsAsTheSecondStall()
    {
        var w = New();
        w.Tick(1);
        Assert.Equal(WatchdogStep.Reload, w.Crashed());
    }
}
