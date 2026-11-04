namespace Wallpapers.Tests;

public class LayoutTests
{
    static IReadOnlyList<SurfacePlan> Plan(string fixture) => Layout.Plan(Displays.FromJson(Fixture.Read(fixture)));

    [Fact]
    public void Rdp_200_percent_insets_are_css_px()
    {
        var p = Assert.Single(Plan("displays-rdp-200.json"));
        Assert.Equal(new Insets(0, 0, 48, 0), p.Insets);
        Assert.Equal(2.0, p.Scale);
        Assert.Equal(new Rect(0, 0, 2940, 1686), p.Bounds);
        Assert.Equal(@"\\.\DISPLAY81", p.Device);
    }

    [Fact]
    public void Resized_rdp_session_gets_new_bounds_and_same_insets()
    {
        var p = Assert.Single(Plan("displays-rdp-200-resized.json"));
        Assert.Equal(1844, p.Bounds.Height);
        Assert.Equal(new Insets(0, 0, 48, 0), p.Insets);
    }

    [Fact]
    public void Side_by_side_primary_first_and_taskbar_only_where_it_is()
    {
        var plans = Plan("displays-side-by-side.json");
        Assert.Equal([@"\\.\DISPLAY1", @"\\.\DISPLAY2"], plans.Select(p => p.Device));
        Assert.Equal(new Insets(0, 0, 48, 0), plans[0].Insets);
        Assert.Equal(Insets.None, plans[1].Insets);
    }

    [Fact]
    public void Negative_origin_keeps_physical_bounds()
    {
        var left = Plan("displays-negative-origin.json").Single(p => p.Device.EndsWith("DISPLAY2"));
        Assert.Equal(new Rect(-1920, -300, 0, 780), left.Bounds);
        Assert.Equal(new Insets(0, 0, 48, 0), left.Insets);
    }

    [Fact]
    public void Mixed_dpi_scales_per_monitor()
    {
        var plans = Plan("displays-mixed-dpi.json");
        Assert.Equal([2.0, 1.0], plans.Select(p => p.Scale));
        Assert.Equal(48, plans[0].Insets.Bottom);   // 96 physical px at 200%
        Assert.Equal(48, plans[1].Insets.Bottom);   // 48 physical px at 100%
    }

    [Fact]
    public void Taskbar_on_each_edge_and_auto_hide()
    {
        var plans = Plan("displays-taskbar-edges.json");
        Assert.Equal(new Insets(0, 0, 0, 48), plans[0].Insets);
        Assert.Equal(new Insets(48, 0, 0, 0), plans[1].Insets);
        Assert.Equal(new Insets(0, 48, 0, 0), plans[2].Insets);
        Assert.Equal(Insets.None, plans[3].Insets);
    }

    [Fact]
    public void Displays_json_round_trips()
    {
        var monitors = Displays.FromJson(Fixture.Read("displays-mixed-dpi.json"));
        Assert.Equal(monitors, Displays.FromJson(Displays.ToJson(monitors)));
        var named = Displays.FromJson(Fixture.Read("displays-two-with-paths.json"));
        Assert.Equal(named, Displays.FromJson(Displays.ToJson(named)));
    }

    [Fact]
    public void Dump_writes_path_name_and_key()
    {
        var named = Displays.FromJson(Fixture.Read("displays-two-with-paths.json"));
        var first = System.Text.Json.Nodes.JsonNode.Parse(Displays.ToJson(named))!["monitors"]![0]!;
        Assert.Equal(DisplayKey.For(named[0]), (string?)first["key"]);
        Assert.Equal("Fixture 24", (string?)first["name"]);
        Assert.Equal(@"\\?\DISPLAY#FAKE0002#1&0#{fixture}", (string?)first["path"]);
    }

    [Fact]
    public void Plan_numbers_primary_first_and_names_fall_back()
    {
        var named = Plan("displays-two-with-paths.json");
        Assert.Equal([1, 2], named.Select(p => p.Number));
        Assert.Equal(["Fixture 27", "Fixture 24"], named.Select(p => p.Name));
        Assert.True(named[0].Primary);
        Assert.Equal(new Rect(0, 0, 3840, 2064), named[0].Work);
        Assert.Equal(DisplayKey.For(Displays.FromJson(Fixture.Read("displays-two-with-paths.json"))[1]), named[0].Key);

        var unnamed = Plan("displays-side-by-side.json");
        Assert.Equal(["Display 1", "Display 2"], unnamed.Select(p => p.Name));
    }

    [Fact]
    public void Plan_keys_are_unique()
    {
        var r = new Rect(0, 0, 1920, 1080);
        var twin = new Rect(1920, 0, 3840, 1080);
        const string path = @"\\?\DISPLAY#FAKE0001#1&0#{fixture}";
        var plans = Layout.Plan([new(@"\\.\DISPLAY2", twin, twin, 96, false, path), new(@"\\.\DISPLAY1", r, r, 96, true, path)]);
        var k = DisplayKey.For(new MonitorInfo("", r, r, 96, true, path));
        Assert.Equal([k, k + "-2"], plans.Select(p => p.Key));
        Assert.Equal(@"\\.\DISPLAY1", plans[0].Device);
    }

    [Fact]
    public void Diff_unplug_keeps_the_other_and_removes_one()
    {
        var before = Plan("displays-two-with-paths.json");
        var change = Layout.Diff(before, Plan("displays-two-with-paths-unplugged.json"));
        Assert.Empty(change.Added);
        Assert.Equal([before[1]], change.Removed);
        var (old, now) = Assert.Single(change.Kept);
        Assert.Equal(before[0], old);
        Assert.False(Layout.Moved(old, now));
        Assert.False(Layout.NeedsNavigate(old, now));
    }

    [Fact]
    public void Diff_replug_adds_it()
    {
        var two = Plan("displays-two-with-paths.json");
        var change = Layout.Diff(Plan("displays-two-with-paths-unplugged.json"), two);
        Assert.Equal([two[1]], change.Added);
        Assert.Empty(change.Removed);
        Assert.Equal(two[0].Key, Assert.Single(change.Kept).New.Key);
    }

    [Fact]
    public void Diff_dpi_change_is_a_move_not_a_navigate()
    {
        var change = Layout.Diff(Plan("displays-two-with-paths.json"), Plan("displays-two-with-paths-dpi.json"));
        Assert.Empty(change.Added);
        Assert.Empty(change.Removed);
        Assert.Equal(2, change.Kept.Count);
        var (old, now) = change.Kept[0];
        Assert.Equal((2.0, 1.5), (old.Scale, now.Scale));
        Assert.True(Layout.Moved(old, now));
        Assert.False(Layout.NeedsNavigate(old, now));
        Assert.False(Layout.Moved(change.Kept[1].Old, change.Kept[1].New));
    }

    [Fact]
    public void Diff_taskbar_move_needs_navigate()
    {
        var monitors = Displays.FromJson(Fixture.Read("displays-two-with-paths.json"));
        // The taskbar moves from the primary's bottom edge to its left edge.
        var moved = monitors.Select(m => m.Primary ? m with { Work = new Rect(96, 0, 3840, 2160) } : m).ToList();
        var change = Layout.Diff(Layout.Plan(monitors), Layout.Plan(moved));
        Assert.Equal(2, change.Kept.Count);
        var (old, now) = change.Kept[0];
        Assert.False(Layout.Moved(old, now));
        Assert.True(Layout.NeedsNavigate(old, now));
        Assert.False(Layout.NeedsNavigate(change.Kept[1].Old, change.Kept[1].New));
    }

    [Fact]
    public void Diff_rdp_resize_is_a_move()
    {
        // These W1 captures have no device path, so this tests the GDI-name fallback (a real RDP
        // session has a path since W2). The two fixtures came from different sessions (DISPLAY81,
        // DISPLAY97); a resize inside one session keeps its GDI name.
        var before = Displays.FromJson(Fixture.Read("displays-rdp-200.json"));
        var resized = Displays.FromJson(Fixture.Read("displays-rdp-200-resized.json")).Select(m => m with { Device = before[0].Device }).ToList();
        var change = Layout.Diff(Layout.Plan(before), Layout.Plan(resized));
        Assert.Empty(change.Added);
        Assert.Empty(change.Removed);
        var (old, now) = Assert.Single(change.Kept);
        Assert.Equal(DisplayKey.For(before[0]), now.Key);
        Assert.True(Layout.Moved(old, now));
        Assert.False(Layout.NeedsNavigate(old, now));
    }

    [Fact]
    public void Fake_fit_two_2560_monitors_into_a_1590_tall_work_area()
    {
        var plans = Plan("displays-side-by-side.json");
        var work = new Rect(0, 0, 2940, 1590);
        var fit = FakeLayout.Fit(plans, work);
        Assert.Equal(plans.Select(p => p.Key).Order(), fit.Keys.Order());
        foreach (var r in fit.Values.Select(h => h.Screen))
            Assert.True(r.Left >= work.Left && r.Top >= work.Top && r.Right <= work.Right && r.Bottom <= work.Bottom, $"{r} outside {work}");
        Assert.True(fit.Values.Sum(h => h.Screen.Width) <= 2940 * 0.95);
        var factors = plans.Select(p => fit[p.Key].RasterizationScale / p.Scale).ToList();
        Assert.Equal(factors[0], factors[1], 9);
        Assert.True(factors[0] < 1);
        // Centred, and side by side as they are for real.
        var (a, b) = (fit[plans[0].Key].Screen, fit[plans[1].Key].Screen);
        Assert.Equal(a.Right, b.Left);
        Assert.InRange(a.Left - work.Left - (work.Right - b.Right), -1, 1);
    }

    [Fact]
    public void Fake_fit_never_scales_up()
    {
        var plans = Plan("displays-side-by-side.json");
        var fit = FakeLayout.Fit(plans, new Rect(0, 0, 10000, 5000));
        Assert.All(plans, p => Assert.Equal(p.Scale, fit[p.Key].RasterizationScale));
        Assert.Equal(2560, fit[plans[0].Key].Screen.Width);
    }
}
