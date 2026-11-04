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

    static CatalogInfo Showing(string id, string name) => new(id, id, [new CatalogEntry(id, name, "*", false)]);

    [Fact]
    public void Tooltip_joins_monitors()
    {
        IReadOnlyList<CatalogInfo> two = [Showing("snow", "Snow"), Showing("fish-tank", "Fish Tank")];
        Assert.Equal("Wallpapers: Snow · Fish Tank", CatalogInfo.Tooltip(two, paused: false));
        Assert.Equal("Wallpapers: Snow · Fish Tank · paused", CatalogInfo.Tooltip(two, paused: true));
        // Seasonal says what it's showing; two monitors of three that agree are still named apart.
        IReadOnlyList<CatalogInfo> three = [Page(), Showing("snow", "Snow"), Showing("snow", "Snow")];
        Assert.Equal("Wallpapers: Harvest Valley · Snow · Snow", CatalogInfo.Tooltip(three, paused: false));
    }

    [Fact]
    public void Tooltip_same_everywhere_is_the_single_form()
    {
        Assert.Equal(Page().Tooltip(paused: false), CatalogInfo.Tooltip([Page()], paused: false));
        Assert.Equal("Wallpapers: Harvest Valley (Seasonal)", CatalogInfo.Tooltip([Page(), Page()], paused: false));
        Assert.Equal("Wallpapers: Snow · paused", CatalogInfo.Tooltip([Showing("snow", "Snow"), Showing("snow", "Snow")], paused: true));
    }

    [Fact]
    public void Tooltip_cuts_long_names_evenly_within_63()
    {
        // Two long names: each is cut to the same length, and the whole fits.
        IReadOnlyList<CatalogInfo> longs = [Showing("a", new string('a', 50)), Showing("b", new string('b', 50))];
        var tip = CatalogInfo.Tooltip(longs, paused: true);
        Assert.True(tip.Length <= CatalogInfo.TooltipMax, $"{tip.Length}: {tip}");
        Assert.EndsWith(" · paused", tip);
        var names = tip["Wallpapers: ".Length..^" · paused".Length].Split(" · ");
        Assert.Equal(2, names.Length);
        Assert.Equal(names[0].Length, names[1].Length);
        Assert.All(names, n => Assert.EndsWith("…", n));
        Assert.True(names[0].Length >= 15, "the room is shared, not wasted");

        // A short name stays whole; the long one gets the rest of the room.
        tip = CatalogInfo.Tooltip([Showing("snow", "Snow"), Showing("x", new string('x', 100))], paused: false);
        Assert.Equal(CatalogInfo.TooltipMax, tip.Length);
        Assert.StartsWith("Wallpapers: Snow · xxx", tip);
        Assert.EndsWith("x…", tip);

        // Never half an emoji.
        tip = CatalogInfo.Tooltip([Showing("a", string.Concat(Enumerable.Repeat("❄️🐟", 30))), Showing("snow", "Snow")], paused: false);
        Assert.True(tip.Length <= CatalogInfo.TooltipMax);
        for (var i = 0; i < tip.Length; i++)
            if (char.IsHighSurrogate(tip[i])) Assert.True(i + 1 < tip.Length && char.IsLowSurrogate(tip[i + 1]), $"half an emoji at {i}: {tip}");
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
