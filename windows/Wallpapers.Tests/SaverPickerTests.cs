namespace Wallpapers.Tests;

public class SaverPickerTests
{
    static CatalogInfo Catalog() => new("seasonal", "snow",
    [
        new("seasonal", "Seasonal", "x", true), new("blank", "Blank", "x", false), new("snow", "Snow", "x", false),
        new("rain", "Rain", "x", false), new("jellyfin", "Jellyfin", "x", false), new("bing", "Bing", "x", false),
        new("koi-pond", "Koi Pond", "x", false),
    ]);

    [Fact]
    public void Pool_SkipsPseudoBlankJellyfinAndBing() =>
        Assert.Equal(["snow", "rain", "koi-pond"], SaverPicker.Pool(Catalog()));

    [Fact]
    public void Pick_AvoidsTaken()
    {
        for (var seed = 0; seed <= 20; seed++)
            Assert.Equal("rain", SaverPicker.Pick(["snow", "rain"], ["snow"], new Random(seed)));
    }

    [Fact]
    public void Pick_FallsBackToAnyWhenAllTaken() =>
        Assert.Equal("snow", SaverPicker.Pick(["snow"], ["snow"], new Random(1)));

    [Fact]
    public void Pick_EmptyPoolIsNull() =>
        Assert.Null(SaverPicker.Pick([], [], new Random(1)));
}
