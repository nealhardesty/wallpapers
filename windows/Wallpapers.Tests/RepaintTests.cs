namespace Wallpapers.Tests;

public class RepaintTests
{
    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Solid_colour_or_slideshow_paths_are_never_reapplied(string current) => Assert.Null(RepaintArgs.PathToReapply(current));

    [Fact]
    public void A_picture_is_reapplied_as_is() =>
        Assert.Equal(@"C:\Pictures\hills.jpg", RepaintArgs.PathToReapply(@"C:\Pictures\hills.jpg"));
}
