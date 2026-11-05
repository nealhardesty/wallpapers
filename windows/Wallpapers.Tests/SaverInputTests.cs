namespace Wallpapers.Tests;

public class SaverInputTests
{
    [Fact]
    public void Moved_FalseWithinEightPixels()
    {
        Assert.False(SaverInput.Moved(100, 100, 108, 100));
        Assert.False(SaverInput.Moved(100, 100, 105, 106));
    }

    [Fact]
    public void Moved_TrueBeyondEight()
    {
        Assert.True(SaverInput.Moved(100, 100, 109, 100));
        Assert.True(SaverInput.Moved(100, 100, 106, 106));
        Assert.True(SaverInput.Moved(100, 100, -5000, 100));
    }
}
