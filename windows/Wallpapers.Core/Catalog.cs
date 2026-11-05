using System.Text.Json;

namespace Wallpapers.Core;

/// One row of the page's catalog, as the tray shows it (SPEC §10.25.10).
public sealed record CatalogEntry(string Id, string Name, string Icon, bool Pseudo);

/// The page's answer to "what can be shown, and what is": the catalog lives in web/, so the tray
/// asks a desktop surface (as the Mac does). Current is the choice ("seasonal" included); Resolved
/// is what's on screen for it ("harvest" for Seasonal in November).
public sealed record CatalogInfo(string Current, string Resolved, IReadOnlyList<CatalogEntry> Entries)
{
    /// Windows cuts a tray tooltip at 63 characters (NOTIFYICONDATA.szTip, less the terminator).
    public const int TooltipMax = 63;

    /// What the tray runs on a surface. JSON, or null when the page isn't ready yet.
    public const string Script = """
        (window.WP && WP.catalog && WP.player) ? JSON.stringify({
            current: WP.player.choice || WP.store.get('wp:current') || 'seasonal',
            resolved: WP.player.resolved,
            entries: WP.catalog.filter(e => !e.disabled).map(e => ({ id: e.id, name: e.name, icon: e.icon, pseudo: !!e.pseudo })),
        }) : null
        """;

    /// Menu thumbnails: each wallpaper's thumb.webp, cropped to fill ThumbWidth×ThumbHeight, as PNG
    /// data URLs by id (a missing thumb is left out). Async, so it runs through Runtime.evaluate.
    public const int ThumbWidth = 128, ThumbHeight = 72;
    const string ThumbScript = """
        (async ids => {
            const W = __W__, H = __H__, out = {};
            await Promise.all(ids.map(async id => {
                try {
                    const img = new Image();
                    img.src = `wallpapers/${id}/thumb.webp`;
                    await img.decode();
                    const c = document.createElement('canvas');
                    c.width = W; c.height = H;
                    const s = Math.max(W / img.naturalWidth, H / img.naturalHeight);
                    const w = img.naturalWidth * s, h = img.naturalHeight * s;
                    c.getContext('2d').drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
                    out[id] = c.toDataURL('image/png');
                } catch {}
            }));
            return JSON.stringify(out);
        })(__IDS__)
        """;

    public string ThumbnailScript() => ThumbScript
        .Replace("__W__", ThumbWidth.ToString(System.Globalization.CultureInfo.InvariantCulture))
        .Replace("__H__", ThumbHeight.ToString(System.Globalization.CultureInfo.InvariantCulture))
        .Replace("__IDS__", JsonSerializer.Serialize(Entries.Where(e => !e.Pseudo).Select(e => e.Id)));

    /// Throws FormatException for anything that isn't the page's answer.
    public static CatalogInfo Parse(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Object) throw new FormatException("the catalog isn't an object");
            var current = Text(root, "current") ?? throw new FormatException("the catalog has no current choice");
            if (!root.TryGetProperty("entries", out var list) || list.ValueKind != JsonValueKind.Array) throw new FormatException("the catalog has no entries");
            var entries = list.EnumerateArray().Select(e =>
            {
                var id = Text(e, "id") ?? throw new FormatException($"a catalog entry has no id: {e}");
                return new CatalogEntry(id, Text(e, "name") ?? id, Text(e, "icon") ?? "",
                    e.TryGetProperty("pseudo", out var p) && p.ValueKind == JsonValueKind.True);
            }).ToList();
            return new CatalogInfo(current, Text(root, "resolved") ?? current, entries);
        }
        catch (JsonException e) { throw new FormatException("the catalog isn't JSON", e); }
    }

    static string? Text(JsonElement e, string key) =>
        e.ValueKind == JsonValueKind.Object && e.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    public CatalogEntry? Find(string id) => Entries.FirstOrDefault(e => e.Id == id);
    public string NameOf(string id) => Find(id)?.Name ?? id;
    string IconAndName(string id) => Find(id) is { } e ? $"{e.Icon} {e.Name}".Trim() : id;

    /// What's showing, as the page's own toasts say it: "❄️ Snow", or "📅 Seasonal: 🌾 Harvest Valley".
    public string Label => Current == Resolved ? IconAndName(Current) : $"{IconAndName(Current)}: {IconAndName(Resolved)}";

    /// "Wallpapers: Snow", "Wallpapers: Harvest Valley (Seasonal)", "… · paused"; never past TooltipMax.
    public string Tooltip(bool paused)
    {
        const string prefix = "Wallpapers: ";
        var suffix = paused ? " · paused" : "";
        var name = Current == Resolved ? NameOf(Current) : $"{NameOf(Resolved)} ({NameOf(Current)})";
        var room = TooltipMax - prefix.Length - suffix.Length;
        return prefix + Cut(name, room) + suffix;
    }

    /// Every monitor's (in monitor order): W1's single form when there's one, or when they all show the
    /// same thing; else what each shows, "Wallpapers: Snow · Fish Tank". Long names are cut evenly:
    /// each to the same length, short ones kept whole, so the whole is never past TooltipMax.
    public static string Tooltip(IReadOnlyList<CatalogInfo> perMonitor, bool paused)
    {
        var first = perMonitor[0];
        if (perMonitor.All(c => c.Current == first.Current && c.Resolved == first.Resolved)) return first.Tooltip(paused);
        const string prefix = "Wallpapers: ", between = " · ";
        var suffix = paused ? " · paused" : "";
        var names = perMonitor.Select(c => c.NameOf(c.Resolved)).ToList();
        var room = TooltipMax - prefix.Length - suffix.Length - between.Length * (names.Count - 1);
        var each = names.Max(n => n.Length);
        while (each > 2 && names.Sum(n => Math.Min(n.Length, each)) > room) each--;
        return prefix + string.Join(between, names.Select(n => Cut(n, each))) + suffix;
    }

    /// At most `room` characters, ending in "…" when cut; never half an emoji.
    static string Cut(string name, int room)
    {
        if (name.Length <= room) return name;
        var cut = room - 1;
        if (cut > 0 && char.IsHighSurrogate(name[cut - 1])) cut--;
        return name[..cut] + "…";
    }
}

/// The page's performance choice and what it's doing (SPEC §4.8, §10.25.10). Mode is "auto", "low",
/// "medium" or "high"; Status is the stage's own line, or null before it has reported.
public sealed record PerformanceInfo(string Mode, bool BatteryAware, string? Status)
{
    public const string Script = """
        (window.WP && WP.player) ? JSON.stringify({
            mode: (WP.store.get('wp:performance') || {}).mode || 'auto',
            batteryAware: (WP.store.get('wp:performance') || {}).batteryAware !== false,
            stats: WP.player.stats,
        }) : null
        """;

    /// Throws FormatException for anything that isn't the page's answer.
    public static PerformanceInfo Parse(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Object) throw new FormatException("the performance answer isn't an object");
            var mode = root.TryGetProperty("mode", out var m) && m.ValueKind == JsonValueKind.String ? m.GetString()! : "auto";
            var aware = !(root.TryGetProperty("batteryAware", out var b) && b.ValueKind == JsonValueKind.False);
            return new PerformanceInfo(mode, aware, root.TryGetProperty("stats", out var s) ? StatusOf(s) : null);
        }
        catch (JsonException e) { throw new FormatException("the performance answer isn't JSON", e); }
    }

    static string? StatusOf(JsonElement s)
    {
        if (s.ValueKind != JsonValueKind.Object) return null;
        var label = s.TryGetProperty("label", out var l) && l.ValueKind == JsonValueKind.String ? l.GetString() : null;
        if (label == null || !s.TryGetProperty("fps", out var f) || f.ValueKind != JsonValueKind.Number) return null;
        var reasons = s.TryGetProperty("reasons", out var r) && r.ValueKind == JsonValueKind.Array
            ? r.EnumerateArray().Where(x => x.ValueKind == JsonValueKind.String).Select(x => x.GetString()!).ToList() : [];
        var fps = Math.Round(f.GetDouble()).ToString(System.Globalization.CultureInfo.InvariantCulture);
        return $"now: {label} · {fps} fps · {(reasons.Count > 0 ? string.Join(", ", reasons) : "no power limits")}";
    }
}

/// Surprise Me (SPEC §10.25.10): any real wallpaper but the one showing. Never Seasonal (it's a
/// pseudo entry), Blank (it looks broken) or Jellyfin (it needs a server signed in first).
public static class Picker
{
    static readonly HashSet<string> Never = ["blank", "jellyfin"];

    public static string? Surprise(CatalogInfo catalog, Random rng)
    {
        var choices = catalog.Entries
            .Where(e => !e.Pseudo && !Never.Contains(e.Id) && e.Id != catalog.Current && e.Id != catalog.Resolved)
            .ToList();
        return choices.Count == 0 ? null : choices[rng.Next(choices.Count)].Id;
    }
}
