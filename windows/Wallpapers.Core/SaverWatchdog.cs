namespace Wallpapers.Core;

public enum WatchdogStep { None, Reload, Recreate, Fallback, Retry, Recovered }

/// Watches the saver page's frame counter (SPEC §10.25.12): reload, then recreate the web view, then give up
/// to a plain fallback scene, and try the page again now and then. Pure logic; the saver ticks it every `Every`.
public sealed class SaverWatchdog(int retryTicks)
{
    public const int StallsPerStep = 2;
    public static readonly TimeSpan Every = TimeSpan.FromSeconds(4), RetryAfter = TimeSpan.FromSeconds(60);

    int last = -1, stalls, advances, countdown;
    bool retrying;

    public bool InFallback { get; private set; }

    /// How many recovery steps are in play; two frame advances in a row after one clear it.
    public int Recoveries { get; private set; }

    /// `frames` is the page's counter; -1 means it did not answer.
    public WatchdogStep Tick(int frames)
    {
        if (InFallback && !retrying)
        {
            if (--countdown > 0) return WatchdogStep.None;
            retrying = true;
            Recoveries = 2;
            last = -1; stalls = 0; advances = 0;
            return WatchdogStep.Retry;
        }
        if (frames > last)
        {
            var advance = last >= 0;
            last = frames; stalls = 0;
            if (retrying) return frames > 0 ? Recovered() : WatchdogStep.None;
            advances = advance ? advances + 1 : 0;
            if (advances >= 2) Recoveries = 0;
            return WatchdogStep.None;
        }
        return Stall();
    }

    /// The web view's process died: counts as the stall that completes a step.
    public WatchdogStep Crashed()
    {
        if (InFallback && !retrying) return WatchdogStep.None;
        stalls = StallsPerStep - 1;
        return Stall();
    }

    WatchdogStep Recovered()
    {
        InFallback = retrying = false;
        Recoveries = 0;
        return WatchdogStep.Recovered;
    }

    WatchdogStep Stall()
    {
        advances = 0;
        if (++stalls < StallsPerStep) return WatchdogStep.None;
        stalls = 0; last = -1;
        Recoveries++;
        if (Recoveries == 1) return WatchdogStep.Reload;
        if (Recoveries == 2) return WatchdogStep.Recreate;
        InFallback = true; retrying = false; countdown = retryTicks;
        return WatchdogStep.Fallback;
    }
}
