namespace Wallpapers.Core;

/// Which wallpapers a screen saver may show, and how it picks one for each monitor.
public static class SaverPicker
{
    /// Blank is no show, and the other two need an account or a network the saver should not depend on.
    public static readonly IReadOnlySet<string> Never = new HashSet<string> { "blank", "jellyfin", "bing" };

    public static IReadOnlyList<string> Pool(CatalogInfo c) =>
        c.Entries.Where(e => !e.Pseudo && !Never.Contains(e.Id)).Select(e => e.Id).ToList();

    /// Avoids what the other monitors already show; with nothing left, repeats rather than going blank.
    public static string? Pick(IReadOnlyList<string> pool, IReadOnlyCollection<string> taken, Random rng)
    {
        if (pool.Count == 0) return null;
        var free = pool.Where(id => !taken.Contains(id)).ToList();
        var from = free.Count > 0 ? free : pool;
        return from[rng.Next(from.Count)];
    }
}
