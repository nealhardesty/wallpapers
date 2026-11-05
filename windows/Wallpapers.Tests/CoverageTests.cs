namespace Wallpapers.Tests;

public class CoverageTests
{
    static readonly Rect Area = new(0, 0, 1000, 1000);

    /// An ordinary app window: what every candidate test changes one thing of.
    static WindowFacts App(Rect bounds) => new("Notepad", Visible: true, Minimized: false, Cloaked: false, Ours: false,
        Transparent: false, LayeredAlphaZero: false, bounds);

    static SurfacePlan Plan(Rect work) => new("m-test", @"\\.\DISPLAY1", "Test", 1, true, work, work, 1, Insets.None);

    [Fact]
    public void Maximized_covers()
    {
        Assert.Equal(1.0, CoverageMath.Fraction(Area, [Area]));
        Assert.True(CoverageMath.Covered([Plan(Area)], [App(Area)])["m-test"]);
    }

    [Fact]
    public void Two_snapped_halves_cover()
    {
        var halves = new[] { App(new Rect(0, 0, 500, 1000)), App(new Rect(500, 0, 1000, 1000)) };
        Assert.True(CoverageMath.Covered([Plan(Area)], halves)["m-test"]);
    }

    [Fact]
    public void One_snapped_half_doesnt_cover()
    {
        Assert.Equal(0.5, CoverageMath.Fraction(Area, [new Rect(0, 0, 500, 1000)]));
        Assert.False(CoverageMath.Covered([Plan(Area)], [App(new Rect(0, 0, 500, 1000))])["m-test"]);
    }

    [Fact]
    public void Ninety_six_percent_doesnt_and_ninety_eight_does()
    {
        Assert.False(CoverageMath.Covered([Plan(Area)], [App(new Rect(0, 0, 960, 1000))])["m-test"]);
        Assert.True(CoverageMath.Covered([Plan(Area)], [App(new Rect(0, 0, 980, 1000))])["m-test"]);
    }

    [Fact]
    public void Overlapping_windows_count_once()
    {
        var r = new Rect(0, 0, 600, 1000);
        Assert.Equal(0.6, CoverageMath.Fraction(Area, [r, r]), 9);
    }

    [Fact]
    public void Only_the_part_inside_the_area_counts()
    {
        // Spilling past the edge (a maximized window's frame, a window half off-screen) adds nothing.
        Assert.Equal(1.0, CoverageMath.Fraction(Area, [new Rect(-8, -8, 1008, 1008)]));
        Assert.Equal(0.25, CoverageMath.Fraction(Area, [new Rect(500, 500, 1500, 1500)]), 9);
        Assert.Equal(0.0, CoverageMath.Fraction(Area, [new Rect(1000, 0, 2000, 1000)]));
    }

    [Fact]
    public void An_l_shape_and_a_gap_are_exact()
    {
        // Top strip + left strip: 1000×200 + 300×800 = 440 000 of 1 000 000.
        Assert.Equal(0.44, CoverageMath.Fraction(Area, [new Rect(0, 0, 1000, 200), new Rect(0, 0, 300, 1000)]), 9);
        // Four 490 px tiles with a 20 px cross between them.
        var tiles = new[] { new Rect(0, 0, 490, 490), new Rect(510, 0, 1000, 490), new Rect(0, 510, 490, 1000), new Rect(510, 510, 1000, 1000) };
        Assert.Equal(4 * 490 * 490 / 1e6, CoverageMath.Fraction(Area, tiles), 9);
    }

    [Fact]
    public void A_window_on_the_other_monitor_doesnt_cover_this_one()
    {
        var plans = Layout.Plan(Displays.FromJson(Fixture.Read("displays-two-with-paths.json")));
        var second = plans.Single(p => !p.Primary);
        var covered = CoverageMath.Covered(plans, [App(second.Work)]);
        Assert.True(covered[second.Key]);
        Assert.False(covered[plans.Single(p => p.Primary).Key]);
    }

    [Fact]
    public void Against_the_work_area_not_the_monitor()
    {
        // A maximized window stops at the taskbar: that's covered.
        var plans = Layout.Plan(Displays.FromJson(Fixture.Read("displays-two-with-paths.json")));
        var primary = plans.Single(p => p.Primary);
        Assert.NotEqual(primary.Bounds, primary.Work);
        Assert.True(CoverageMath.Covered(plans, [App(primary.Work)])[primary.Key]);
    }

    [Theory]
    [InlineData("minimized")]
    [InlineData("cloaked")]
    [InlineData("ours")]
    [InlineData("transparent")]
    [InlineData("layered alpha 0")]
    [InlineData("invisible")]
    [InlineData("Progman")]
    [InlineData("WorkerW")]
    [InlineData("Shell_TrayWnd")]
    [InlineData("Shell_SecondaryTrayWnd")]
    public void Not_candidates(string kind)
    {
        var w = App(Area);
        Assert.True(CoverageMath.IsCandidate(w));
        w = kind switch
        {
            "minimized" => w with { Minimized = true },
            "cloaked" => w with { Cloaked = true },          // another virtual desktop, Task View, a suspended UWP app
            "ours" => w with { Ours = true },                // the settings window, the tray menu, our hosts
            "transparent" => w with { Transparent = true },  // a click-through overlay (GeForce, Discord)
            "layered alpha 0" => w with { LayeredAlphaZero = true },
            "invisible" => w with { Visible = false },
            _ => w with { Class = kind },                    // the desktop and the taskbars
        };
        Assert.False(CoverageMath.IsCandidate(w));
        Assert.False(CoverageMath.Covered([Plan(Area)], [w])["m-test"]);
    }

    [Fact]
    public void Gate_pauses_after_300_ms_and_resumes_at_once()
    {
        var g = new CoverageGate();
        Assert.Equal(300, g.Update(true, 0));
        Assert.False(g.Hidden);
        Assert.Equal(1, g.Update(true, 299));
        Assert.False(g.Hidden);
        Assert.Null(g.Update(true, 300));
        Assert.True(g.Hidden);
        Assert.Null(g.Update(false, 310));
        Assert.False(g.Hidden);
    }

    [Fact]
    public void Gate_a_blip_doesnt_pause()
    {
        var g = new CoverageGate();
        g.Update(true, 0);
        Assert.Null(g.Update(false, 200));
        Assert.False(g.Hidden);
        Assert.Equal(300, g.Update(true, 250));
        Assert.Equal(1, g.Update(true, 549));
        Assert.False(g.Hidden);
        g.Update(true, 550);
        Assert.True(g.Hidden);
    }
}
