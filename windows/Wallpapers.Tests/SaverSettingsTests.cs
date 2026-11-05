namespace Wallpapers.Tests;

public class SaverSettingsTests
{
    [Fact]
    public void Normalized_KeepsAKnownChangeInterval() =>
        Assert.Equal(15, new SaverSettings(ChangeMinutes: 15).Normalized().ChangeMinutes);

    [Theory]
    [InlineData(7)]
    [InlineData(0)]
    [InlineData(-1)]
    public void Normalized_ReplacesAnUnknownInterval(int minutes) =>
        Assert.Equal(5, new SaverSettings(ChangeMinutes: minutes).Normalized().ChangeMinutes);

    [Fact]
    public void Normalized_OneWithoutAWallpaperIsSame()
    {
        Assert.Equal(SaverShow.Same, new SaverSettings(SaverShow.One, null).Normalized().Show);
        Assert.Equal(SaverShow.One, new SaverSettings(SaverShow.One, "snow").Normalized().Show);
    }

    [Fact]
    public void Choices_AreTheSpecsValues()
    {
        Assert.Equal([1, 3, 5, 10, 15, 30], SaverChoices.StartAfterMinutes);
        Assert.Equal([1, 5, 15, 30], SaverChoices.ChangeMinutes);
    }
}
