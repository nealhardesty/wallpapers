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
    }
}
