namespace Wallpapers.Tests;

public class PowerTests
{
    [Theory]
    [InlineData(nameof(PowerState.Locked))]
    [InlineData(nameof(PowerState.DisplayOff))]
    [InlineData(nameof(PowerState.Asleep))]
    [InlineData(nameof(PowerState.Disconnected))]
    [InlineData(nameof(PowerState.FullscreenApp))]
    [InlineData(nameof(PowerState.SaverRunning))]
    public void Hidden_everywhere_for_each_hiding_signal(string flag)
    {
        var s = flag switch
        {
            nameof(PowerState.Locked) => new PowerState(Locked: true),
            nameof(PowerState.DisplayOff) => new PowerState(DisplayOff: true),
            nameof(PowerState.Asleep) => new PowerState(Asleep: true),
            nameof(PowerState.Disconnected) => new PowerState(Disconnected: true),
            nameof(PowerState.FullscreenApp) => new PowerState(FullscreenApp: true),
            _ => new PowerState(SaverRunning: true),
        };
        Assert.True(s.HiddenEverywhere);
    }

    [Fact]
    public void Remote_energy_saver_and_battery_only_lower_quality()
    {
        Assert.False(new PowerState().HiddenEverywhere);
        Assert.False(new PowerState(Remote: true, EnergySaver: true, Battery: new BatteryInfo(false, 0.05)).HiddenEverywhere);
    }

    [Fact]
    public void Console_display_off_doesnt_hide_a_remote_session()
    {
        // Over Remote Desktop the console's monitors sleeping isn't the screen the user is looking at.
        Assert.False(new PowerState(DisplayOff: true, Remote: true).HiddenEverywhere);
        Assert.True(new PowerState(DisplayOff: true, Remote: true, Locked: true).HiddenEverywhere);
    }

    [Fact]
    public void Resume_clears_sleep_and_display_off()
    {
        var s = PowerSignals.Apply(PowerSignals.Apply(new PowerState(), PowerEvent.DisplayOff), PowerEvent.Suspend);
        Assert.True(s.Asleep && s.DisplayOff);
        // Waking without a display-on (missed or never sent) must not stay hidden.
        s = PowerSignals.Apply(s, PowerEvent.Resume);
        Assert.False(s.HiddenEverywhere);
    }

    [Fact]
    public void Unlock_after_lock_clears()
    {
        var s = PowerSignals.Apply(new PowerState(), PowerEvent.Lock);
        Assert.True(s.Locked && s.HiddenEverywhere);
        Assert.Equal(new PowerState(), PowerSignals.Apply(s, PowerEvent.Unlock));
    }

    [Fact]
    public void Unlock_before_display_on_stays_hidden_until_the_display_is()
    {
        var s = PowerSignals.Apply(PowerSignals.Apply(new PowerState(), PowerEvent.DisplayOff), PowerEvent.Lock);
        s = PowerSignals.Apply(s, PowerEvent.Unlock);
        Assert.True(s.HiddenEverywhere);
        Assert.False(PowerSignals.Apply(s, PowerEvent.DisplayOn).HiddenEverywhere);
    }

    [Fact]
    public void A_reconnect_clears_disconnected()
    {
        var s = PowerSignals.Apply(new PowerState(Remote: true), PowerEvent.Disconnect);
        Assert.True(s.HiddenEverywhere);
        s = PowerSignals.Apply(s, PowerEvent.Connect);
        Assert.False(s.Disconnected);
        Assert.False(s.HiddenEverywhere);
    }

    [Fact]
    public void Dimmed_still_draws()
    {
        Assert.False(PowerSignals.Apply(new PowerState(), PowerEvent.DisplayDimmed).HiddenEverywhere);
        // Dimming on the way back from off counts as on.
        var off = PowerSignals.Apply(new PowerState(), PowerEvent.DisplayOff);
        Assert.False(PowerSignals.Apply(off, PowerEvent.DisplayDimmed).HiddenEverywhere);
    }

    [Fact]
    public void Json_has_no_battery_without_one()
    {
        var json = PowerJson.For(new PowerState(Remote: true), hidden: true);
        Assert.Equal("""{"hidden":true,"saver":false,"remote":true}""", json);
        Assert.DoesNotContain("\"battery\"", json);
    }

    [Fact]
    public void Json_with_battery()
    {
        var s = new PowerState(EnergySaver: true, Battery: new BatteryInfo(false, 0.54));
        Assert.Equal("""{"hidden":false,"saver":true,"remote":false,"battery":{"charging":false,"level":0.54}}""", PowerJson.For(s, hidden: false));
    }

    [Fact]
    public void Describe_names_what_matters()
    {
        Assert.Equal("normal", new PowerState().Describe());
        Assert.Equal("locked, on battery 54%", new PowerState(Locked: true, Battery: new BatteryInfo(false, 0.54)).Describe());
        Assert.Equal("remote", new PowerState(Remote: true).Describe());
        Assert.Equal("display off, asleep, disconnected, fullscreen app, screen saver, energy saver, charging 100%",
            new PowerState(DisplayOff: true, Asleep: true, Disconnected: true, FullscreenApp: true, SaverRunning: true,
                EnergySaver: true, Battery: new BatteryInfo(true, 1)).Describe());
    }
}
