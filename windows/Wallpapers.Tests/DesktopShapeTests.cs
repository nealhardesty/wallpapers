namespace Wallpapers.Tests;

public class DesktopShapeTests
{
    static IReadOnlyList<WindowNode> Tree(string fixture) => DesktopShape.TreeFromJson(Fixture.Read(fixture));

    [Fact]
    public void Raised_before_the_message_needs_it()
    {
        var s = DesktopShape.Detect(Tree("tree-raised-before.json"), messageSent: false);
        Assert.Equal(ShapeKind.Raised, s.Kind);
        Assert.Equal(0, s.Layer);
        Assert.True(DesktopShape.NeedsLayerMessage(s));
    }

    [Fact]
    public void Raised_after_has_the_layer_and_targets_progman_below_defview()
    {
        var s = DesktopShape.Detect(Tree("tree-raised-after.json"), messageSent: true);
        Assert.Equal((ShapeKind.Raised, 1L, 2L, 4L), (s.Kind, s.Progman, s.DefView, s.Layer));
        Assert.False(DesktopShape.NeedsLayerMessage(s));
        Assert.Equal((1L, 2L), DesktopShape.AttachTarget(s));
    }

    [Fact]
    public void Other_processes_workerws_are_never_the_layer()
    {
        // tree-classic has a foreign visible full-screen WorkerW (pid 400) ahead of Explorer's back one.
        var s = DesktopShape.Detect(Tree("tree-classic.json"), messageSent: true);
        Assert.Equal(33, s.Layer);
    }

    [Fact]
    public void Classic_targets_the_back_workerw()
    {
        var s = DesktopShape.Detect(Tree("tree-classic.json"), messageSent: true);
        Assert.Equal(ShapeKind.Classic, s.Kind);
        Assert.Equal(31, s.DefView);
        Assert.Equal((33L, 0L), DesktopShape.AttachTarget(s));
    }

    [Fact]
    public void Not_split_once_the_message_failed_has_no_target()
    {
        var s = DesktopShape.Detect(Tree("tree-raised-before.json"), messageSent: true);
        Assert.Equal(ShapeKind.NotSplit, s.Kind);
        Assert.Equal((0L, 0L), DesktopShape.AttachTarget(s));
        Assert.False(DesktopShape.NeedsLayerMessage(s));
    }

    [Fact]
    public void No_progman_is_no_shell()
    {
        var s = DesktopShape.Detect(Tree("tree-empty.json"), messageSent: false);
        Assert.Equal(ShapeKind.NoShell, s.Kind);
        Assert.False(DesktopShape.NeedsLayerMessage(s));
    }

    [Theory]
    [InlineData(new long[] { 2, 99, 4 }, true)]    // DefView > host > WorkerW
    [InlineData(new long[] { 99, 2, 4 }, false)]   // host above the icons
    [InlineData(new long[] { 2, 4, 99 }, false)]   // host below Explorer's own wallpaper
    [InlineData(new long[] { 2, 4 }, false)]       // host missing
    public void Z_order_raised(long[] progmanChildrenTopFirst, bool ok)
    {
        var s = DesktopShape.Detect(Tree("tree-raised-after.json"), messageSent: true);
        Assert.Equal(ok, DesktopShape.ZOk(s, progmanChildrenTopFirst, 99));
    }

    [Fact]
    public void Z_order_classic_only_needs_the_host_in_the_layer() =>
        Assert.True(DesktopShape.ZOk(DesktopShape.Detect(Tree("tree-classic.json"), true), [99], 99));

    [Fact]
    public void Live_25h2_rdp_desktop_is_raised_with_a_layer()
    {
        // Captured by `Wallpapers.exe --dump-displays` on the owner's 25H2 machine over RDP, 2026-11-03.
        var s = DesktopShape.Detect(Tree("tree-live-rdp.json"), messageSent: false);
        Assert.Equal(ShapeKind.Raised, s.Kind);
        Assert.Equal((1L, 2L), DesktopShape.AttachTarget(s));
        Assert.False(DesktopShape.NeedsLayerMessage(s));
    }
}
