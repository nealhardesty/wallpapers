namespace Wallpapers.Tests;

public class WindowPlacementTests
{
    // Today's RDP session at 200%: 2940×1686, taskbar 96 px (48 CSS px) at the bottom.
    static readonly MonitorInfo Rdp = new(@"\\.\DISPLAY1", new Rect(0, 0, 2940, 1686), new Rect(0, 0, 2940, 1590), 192, true);
    // A second 100% monitor to the right.
    static readonly MonitorInfo Right = new(@"\\.\DISPLAY2", new Rect(2940, 0, 4860, 1080), new Rect(2940, 0, 4860, 1080), 96, false);

    [Fact]
    public void First_time_it_is_centred_on_the_primary_at_its_dpi()
    {
        // 1280×800 logical at 200% is 2560×1600: too tall for the 1590 px work area, so it's cut to fit.
        var r = WindowPlacement.Restore(null, [Right, Rdp], 1280, 800);
        Assert.Equal(new Rect(190, 0, 2750, 1590), r);
    }

    [Fact]
    public void A_saved_place_that_is_on_screen_is_kept()
    {
        var saved = new Rect(3000, 100, 4000, 900);
        Assert.Equal(saved, WindowPlacement.Restore(saved, [Rdp, Right], 1280, 800));
    }

    [Fact]
    public void A_place_hanging_off_the_edge_is_pulled_back_onto_its_monitor()
    {
        // Mostly on the right-hand monitor, hanging off its bottom and right.
        var r = WindowPlacement.Restore(new Rect(4000, 600, 5000, 1400), [Rdp, Right], 1280, 800);
        Assert.Equal(new Rect(3860, 280, 4860, 1080), r);
    }

    [Fact]
    public void A_place_on_a_monitor_that_is_gone_goes_back_to_the_default()
    {
        var r = WindowPlacement.Restore(new Rect(3000, 100, 4000, 900), [Rdp], 1280, 800);
        Assert.Equal(WindowPlacement.Restore(null, [Rdp], 1280, 800), r);
    }

    [Fact]
    public void A_place_bigger_than_the_monitor_is_cut_to_its_work_area()
    {
        // Saved on a larger screen; the RDP window is smaller now.
        var r = WindowPlacement.Restore(new Rect(-10, -10, 3500, 2000), [Rdp], 1280, 800);
        Assert.Equal(Rdp.Work, r);
    }

    [Fact]
    public void With_no_monitors_reported_it_still_gives_a_window() =>
        Assert.Equal(new Rect(0, 0, 1280, 800), WindowPlacement.Restore(null, [], 1280, 800));
}
