namespace Wallpapers.Tests;

public class PointerTests
{
    [Theory]
    [InlineData("SysListView32", "SHELLDLL_DefView")]
    [InlineData("SHELLDLL_DefView", "Progman")]
    [InlineData("SHELLDLL_DefView", "WorkerW")]
    [InlineData("Progman", "")]
    [InlineData("WorkerW", "")]
    [InlineData("WallpapersHost", "WorkerW")]
    public void Desktop_classes_and_the_host_are_desktop(string cls, string parent) => Assert.True(HitTest.IsDesktop(cls, parent));

    [Theory]
    [InlineData("Chrome_WidgetWin_1", "")]
    [InlineData("CabinetWClass", "")]
    [InlineData("Shell_TrayWnd", "")]
    [InlineData("SysListView32", "RegEdit_RegEdit")]
    [InlineData("SysListView32", "")]
    public void Other_classes_are_not_desktop(string cls, string parent) => Assert.False(HitTest.IsDesktop(cls, parent));

    [Fact]
    public void Kind_is_other_off_the_desktop_icon_on_a_list_item_else_bare()
    {
        Assert.Equal(HitKind.Other, HitTest.Kind("CabinetWClass", "", null));
        Assert.Equal(HitKind.Other, HitTest.Kind("SysListView32", "RegEdit_RegEdit", true));
        Assert.Equal(HitKind.Icon, HitTest.Kind("SysListView32", "SHELLDLL_DefView", true));
        Assert.Equal(HitKind.Bare, HitTest.Kind("SysListView32", "SHELLDLL_DefView", false));
        Assert.Equal(HitKind.Bare, HitTest.Kind("Progman", "", null));
    }

    static IReadOnlyList<SurfacePlan> Plan(string fixture) => Layout.Plan(Displays.FromJson(Fixture.Read(fixture)));

    static List<PointerTarget> Targets(IReadOnlyList<SurfacePlan> plans, bool secondVisible = true) =>
        plans.Select((p, i) => new PointerTarget(p.Key, new HostPlacement(p.Bounds, p.Scale), i == 0 || secondVisible)).ToList();

    [Fact]
    public void Find_picks_the_monitor_under_the_point_and_maps_its_css_px_across_mixed_dpi()
    {
        var plans = Plan("displays-mixed-dpi.json");
        var targets = Targets(plans);

        var a = PointerMap.Find(targets, 1000, 500)!;
        Assert.Equal(plans[0].Key, a.Key);
        Assert.Equal(new PointerHit(plans[0].Key, 1000, 500, 500, 250), PointerMap.Into(a, 1000, 500));

        var b = PointerMap.Find(targets, 3000, 100)!;
        Assert.Equal(plans[1].Key, b.Key);
        Assert.Equal(new PointerHit(plans[1].Key, 120, 100, 120, 100), PointerMap.Into(b, 3000, 100));

        Assert.Null(PointerMap.Find(targets, 6000, 100));
        Assert.Equal(plans[1].Key, PointerMap.Find(targets, 2880, 0)!.Key);
        Assert.Equal(plans[0].Key, PointerMap.Find(targets, 2879, 0)!.Key);
    }

    [Fact]
    public void Find_skips_a_hidden_surface()
    {
        var targets = Targets(Plan("displays-mixed-dpi.json"), secondVisible: false);
        Assert.Null(PointerMap.Find(targets, 3000, 100));
    }

    [Fact]
    public void Find_maps_a_fake_layout_through_its_fit()
    {
        var plans = Plan("displays-side-by-side.json");
        var fit = FakeLayout.Fit(plans, new Rect(0, 0, 2940, 1590));
        var targets = plans.Select(p => new PointerTarget(p.Key, fit[p.Key], true)).ToList();
        var s = fit[plans[1].Key].Screen;
        int cx = (s.Left + s.Right + 1) / 2, cy = (s.Top + s.Bottom + 1) / 2; // round the centre up: 1 physical px is 1.4 CSS px here

        var t = PointerMap.Find(targets, cx, cy)!;
        Assert.Equal(plans[1].Key, t.Key);
        var hit = PointerMap.Into(t, cx, cy);
        Assert.InRange(hit.CssX, 959, 961);
        Assert.InRange(hit.CssY, 539, 541);
    }

    [Fact]
    public void Into_maps_a_point_off_the_surface()
    {
        var plans = Plan("displays-mixed-dpi.json");
        var hit = PointerMap.Into(Targets(plans)[0], 3000, 100);
        Assert.Equal(1500, hit.CssX);
        Assert.Equal(50, hit.CssY);
    }

    [Fact]
    public void Throttle_sends_the_first_holds_the_rest_and_flushes_the_latest()
    {
        var t = new MoveThrottle();
        Assert.Equal((0, 0), t.Offer(0, 0, 0));
        Assert.Null(t.Offer(5, 5, 5));
        Assert.Equal(11, t.DueInMs);
        Assert.Null(t.Offer(10, 10, 10));
        Assert.Equal((10, 10), t.Flush(16));
        Assert.Null(t.Flush(16));
        Assert.Null(t.Offer(20, 20, 17));
        Assert.Equal(15, t.DueInMs);
        Assert.Equal((40, 40), t.Offer(40, 40, 32));
        Assert.Null(t.Flush(50));
        Assert.Null(t.DueInMs);
    }

    [Fact]
    public void Poll_counts_only_while_raw_input_is_silent_and_the_cursor_moves()
    {
        var c = new CursorSource();
        c.Raw(0, 0, 0);
        Assert.False(c.UsePoll(5, 5, 100));
        Assert.True(c.UsePoll(5, 5, 250));
        Assert.False(c.UsePoll(5, 5, 283));
        Assert.True(c.UsePoll(9, 9, 316));
        c.Raw(20, 20, 320);
        Assert.False(c.UsePoll(25, 25, 350));
    }
}
