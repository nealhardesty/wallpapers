namespace Wallpapers.Tests;

public class GestureTests
{
    static readonly PointerTarget T1 = new("m-1", new HostPlacement(new Rect(0, 0, 2880, 1800), 2), true);
    static readonly PointerTarget T2 = new("m-2", new HostPlacement(new Rect(2880, 0, 5440, 1440), 1), true);

    static GestureTracker Tracker() => new(DoubleClickRule.WindowsDefault);

    static bool Click(GestureTracker g, PointerTarget t, int x, int y, long at) =>
        g.Down(t, HitKind.Bare, x, y, at) is not null && g.Up(x, y, at + 50)!.DoubleClick;

    [Fact]
    public void A_press_on_bare_desktop_is_forwarded_through_its_release()
    {
        var g = Tracker();
        var press = g.Down(T1, HitKind.Bare, 100, 100, 0)!;
        Assert.Equal("m-1", press.Key);
        Assert.Equal(50, press.At.CssX);
        Assert.Equal(50, press.At.CssY);
        Assert.Equal("m-1", g.Pressed);

        var move = g.Move(110, 120)!;
        Assert.Equal(55, move.At.CssX);
        Assert.Equal(60, move.At.CssY);

        var up = g.Up(110, 120, 300)!;
        Assert.Equal(55, up.At.CssX);
        Assert.Equal(60, up.At.CssY);
        Assert.False(up.DoubleClick);
        Assert.Null(g.Pressed);
    }

    [Fact]
    public void A_press_on_an_icon_is_never_forwarded_even_if_it_ends_bare()
    {
        var g = Tracker();
        Assert.Null(g.Down(T1, HitKind.Icon, 100, 100, 0));
        Assert.Null(g.Move(110, 120));
        Assert.Null(g.Up(110, 120, 300));
    }

    [Fact]
    public void A_press_off_every_surface_is_nothing() =>
        Assert.Null(Tracker().Down(null, HitKind.Bare, 100, 100, 0));

    [Fact]
    public void An_up_without_a_press_is_nothing()
    {
        var g = Tracker();
        Assert.Null(g.Up(100, 100, 0));
        Assert.Null(g.Move(100, 100));
    }

    [Fact]
    public void A_release_off_the_surface_still_goes_to_the_pressed_one()
    {
        var g = Tracker();
        g.Down(T1, HitKind.Bare, 100, 100, 0);
        var up = g.Up(3000, 100, 200)!;
        Assert.Equal("m-1", up.Key);
        Assert.Equal(1500, up.At.CssX);
        Assert.Equal(50, up.At.CssY);
    }

    [Fact]
    public void Two_quick_clicks_make_a_double_and_the_third_doesnt()
    {
        var g = Tracker();
        Assert.False(Click(g, T1, 100, 100, 0));
        Assert.True(Click(g, T1, 100, 100, 400));
        Assert.False(Click(g, T1, 100, 100, 800));
    }

    [Fact]
    public void A_slow_second_click_isnt_double()
    {
        var g = Tracker();
        Assert.False(Click(g, T1, 100, 100, 0));
        Assert.False(Click(g, T1, 100, 100, 600));
    }

    [Fact]
    public void A_second_click_too_far_isnt_double()
    {
        var g = Tracker();
        Assert.False(Click(g, T1, 100, 100, 0));
        Assert.False(Click(g, T1, 103, 100, 100));
        Assert.True(Click(g, T1, 102, 100, 200));
    }

    [Fact]
    public void A_second_click_on_another_surface_isnt_double()
    {
        var g = Tracker();
        Assert.False(Click(g, T1, 100, 100, 0));
        Assert.False(Click(g, T2, 100, 100, 100));
    }

    [Fact]
    public void An_icon_click_between_two_bare_clicks_breaks_the_pair()
    {
        var g = Tracker();
        Assert.False(Click(g, T1, 100, 100, 0));
        Assert.Null(g.Down(T1, HitKind.Icon, 100, 100, 100));
        Assert.False(Click(g, T1, 100, 100, 200));
    }

    [Fact]
    public void A_press_off_every_surface_breaks_the_pair()
    {
        var g = Tracker();
        Assert.False(Click(g, T1, 100, 100, 0));
        Assert.Null(g.Down(null, HitKind.Other, 100, 100, 100));
        Assert.False(Click(g, T1, 100, 100, 200));
    }

    [Fact]
    public void Script_dispatches_the_right_events_in_order()
    {
        var down = PointerScript.Press(true, 400, 300);
        Assert.True(down.IndexOf("'pointerdown'") is >= 0 and var d && d < down.IndexOf("'mousedown'"));
        Assert.Contains("clientX: 400.0", down);
        Assert.DoesNotContain("'click'", down);

        var up = PointerScript.Press(false, 400, 300);
        var order = new[] { "'pointerup'", "'mouseup'", "'click'" }.Select(s => up.IndexOf(s)).ToArray();
        Assert.All(order, i => Assert.True(i >= 0));
        Assert.Equal(order.OrderBy(i => i), order);
        Assert.DoesNotContain("'dblclick'", up);

        var dbl = PointerScript.Press(false, 400, 300, doubleClick: true);
        Assert.Contains("'dblclick'", dbl);
        Assert.Contains("detail: 2", dbl);
        Assert.True(dbl.IndexOf("'dblclick'") > dbl.IndexOf("'click'"));
    }
}
