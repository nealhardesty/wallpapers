namespace Wallpapers.Tests;

public class CatalogTests
{
    static CatalogInfo Page() => CatalogInfo.Parse(Fixture.Read("catalog-page.json"));

    static CatalogInfo Small(string current, string? resolved = null, params string[] ids) =>
        new(current, resolved ?? current, ids.Select(id => new CatalogEntry(id, id.ToUpperInvariant(), "*", id == "seasonal")).ToList());

    [Fact]
    public void Parses_the_pages_catalog()
    {
        var c = Page();
        Assert.Equal("seasonal", c.Current);
        Assert.Equal("harvest", c.Resolved);
        Assert.Equal(36, c.Entries.Count);
        Assert.Equal(new CatalogEntry("seasonal", "Seasonal", "📅", true), c.Entries[0]);
        Assert.Equal(["seasonal"], c.Entries.Where(e => e.Pseudo).Select(e => e.Id));
        Assert.Equal("Harvest Valley", c.NameOf("harvest"));
        Assert.Equal("gone", c.NameOf("gone"));
    }

    [Fact]
    public void A_missing_resolved_means_the_current_one() =>
        Assert.Equal("snow", CatalogInfo.Parse("""{ "current": "snow", "entries": [] }""").Resolved);

    [Theory]
    [InlineData("null")]
    [InlineData("{}")]
    [InlineData("""{ "current": "snow" }""")]
    [InlineData("""{ "current": "snow", "entries": [ { "name": "no id" } ] }""")]
    [InlineData("not json")]
    public void Rejects_what_isnt_the_pages_answer(string json) => Assert.Throws<FormatException>(() => CatalogInfo.Parse(json));

    [Fact]
    public void The_label_says_what_seasonal_is_showing()
    {
        Assert.Equal("📅 Seasonal: 🌾 Harvest Valley", Page().Label);
        Assert.Equal("❄️ Snow", (Page() with { Current = "snow", Resolved = "snow" }).Label);
    }

    [Fact]
    public void The_tooltip_names_the_wallpaper_and_fits_windows_limit()
    {
        Assert.Equal("Wallpapers: Harvest Valley (Seasonal)", Page().Tooltip(paused: false));
        Assert.Equal("Wallpapers: Snow · paused", (Page() with { Current = "snow", Resolved = "snow" }).Tooltip(paused: true));
        var long_ = new CatalogInfo("x", "x", [new CatalogEntry("x", new string('n', 100), "*", false)]);
        var tip = long_.Tooltip(paused: true);
        Assert.Equal(CatalogInfo.TooltipMax, tip.Length);
        Assert.EndsWith("… · paused", tip);
    }

    [Fact]
    public void The_thumbnail_script_asks_for_every_real_wallpaper()
    {
        var script = Small("snow", null, "seasonal", "snow", "rain").ThumbnailScript();
        Assert.EndsWith("""})(["snow","rain"])""", script);
        Assert.Contains("const W = 128, H = 72", script);
        Assert.DoesNotContain("__", script);
    }

    [Fact]
    public void Surprise_never_picks_current_pseudo_blank_or_jellyfin()
    {
        var c = Page() with { Current = "snow", Resolved = "snow" };
        var rng = new Random(7);
        var picks = Enumerable.Range(0, 200).Select(_ => Picker.Surprise(c, rng)).ToList();
        Assert.All(picks, p => Assert.NotNull(p));
        Assert.DoesNotContain("snow", picks);
        Assert.DoesNotContain("seasonal", picks);
        Assert.DoesNotContain("blank", picks);
        Assert.DoesNotContain("jellyfin", picks);
        Assert.True(picks.Distinct().Count() > 20, "200 draws should cover most of the catalog");
    }

    [Fact]
    public void Surprise_skips_what_seasonal_is_showing()
    {
        var rng = new Random(1);
        var picks = Enumerable.Range(0, 200).Select(_ => Picker.Surprise(Page(), rng)).ToList();
        Assert.DoesNotContain("harvest", picks);
    }

    [Fact]
    public void Surprise_returns_null_when_nothing_else_is_left()
    {
        Assert.Null(Picker.Surprise(Small("snow", null, "seasonal", "blank", "jellyfin", "snow"), new Random(1)));
        Assert.Equal("rain", Picker.Surprise(Small("snow", null, "seasonal", "blank", "snow", "rain"), new Random(1)));
    }
}
