namespace Wallpapers.Core;

/// "major.minor.patch" with an optional "+stamp" build number (SPEC §10.25.13). The stamp breaks ties only.
public sealed record AppVersion(int Major, int Minor, int Patch, long Stamp) : IComparable<AppVersion>
{
    /// Null when the text is not a version ("?", "", "1.2").
    public static AppVersion? Parse(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        var plus = text.IndexOf('+');
        var core = plus < 0 ? text : text[..plus];
        long stamp = 0;
        if (plus >= 0 && !long.TryParse(text[(plus + 1)..], out stamp)) return null;
        var parts = core.Split('.');
        if (parts.Length != 3 || !int.TryParse(parts[0], out var major) || !int.TryParse(parts[1], out var minor)
            || !int.TryParse(parts[2], out var patch) || major < 0 || minor < 0 || patch < 0 || stamp < 0) return null;
        return new AppVersion(major, minor, patch, stamp);
    }

    /// "0.10.3": what people see; no stamp.
    public string Display => $"{Major}.{Minor}.{Patch}";

    public int CompareTo(AppVersion? other)
    {
        if (other is null) return 1;
        var c = Major.CompareTo(other.Major);
        if (c != 0) return c;
        c = Minor.CompareTo(other.Minor);
        if (c != 0) return c;
        c = Patch.CompareTo(other.Patch);
        return c != 0 ? c : Stamp.CompareTo(other.Stamp);
    }

    public static bool operator <(AppVersion? a, AppVersion? b) => a is null ? b is not null : a.CompareTo(b) < 0;
    public static bool operator >(AppVersion? a, AppVersion? b) => a is not null && a.CompareTo(b) > 0;
    public static bool operator <=(AppVersion? a, AppVersion? b) => !(a > b);
    public static bool operator >=(AppVersion? a, AppVersion? b) => !(a < b);
}
