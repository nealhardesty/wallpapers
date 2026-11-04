using System.Globalization;

namespace Wallpapers.Core;

/// What Windows reports about the battery: plugged in (`charging`, as the page's navigator.getBattery
/// means it), and the charge from 0 to 1.
public sealed record BatteryInfo(bool Charging, double Level);

/// Every power and session signal at once (SPEC §10.25.9). The hiding ones pause every page; Remote,
/// EnergySaver and Battery only lower quality (the owner's rule: only invisibility pauses).
public sealed record PowerState(bool Locked = false, bool DisplayOff = false, bool Asleep = false, bool Disconnected = false,
    bool FullscreenApp = false, bool SaverRunning = false, bool Remote = false, bool EnergySaver = false, BatteryInfo? Battery = null)
{
    /// No monitor can be seen. A display-off is the console's: over Remote Desktop it isn't the
    /// screen the user is looking at.
    public bool HiddenEverywhere => Locked || (DisplayOff && !Remote) || Asleep || Disconnected || FullscreenApp || SaverRunning;

    /// For the log and the tray: `locked, on battery 54%`, or `normal`.
    public string Describe()
    {
        var parts = new List<string>();
        if (Locked) parts.Add("locked");
        if (DisplayOff) parts.Add("display off");
        if (Asleep) parts.Add("asleep");
        if (Disconnected) parts.Add("disconnected");
        if (FullscreenApp) parts.Add("fullscreen app");
        if (SaverRunning) parts.Add("screen saver");
        if (Remote) parts.Add("remote");
        if (EnergySaver) parts.Add("energy saver");
        if (Battery is { } b) parts.Add($"{(b.Charging ? "charging" : "on battery")} {Math.Round(b.Level * 100).ToString(CultureInfo.InvariantCulture)}%");
        return parts.Count == 0 ? "normal" : string.Join(", ", parts);
    }
}

/// The notifications Windows sends (session changes, WM_POWERBROADCAST); the polled signals are set directly.
public enum PowerEvent { Lock, Unlock, DisplayOff, DisplayOn, DisplayDimmed, Suspend, Resume, Disconnect, Connect }

public static class PowerSignals
{
    /// One notification applied. A resume clears the display-off too: waking can come without a
    /// display-on, and a missed one must never leave the wallpaper hidden.
    public static PowerState Apply(PowerState s, PowerEvent e) => e switch
    {
        PowerEvent.Lock => s with { Locked = true },
        PowerEvent.Unlock => s with { Locked = false },
        PowerEvent.DisplayOff => s with { DisplayOff = true },
        PowerEvent.DisplayOn or PowerEvent.DisplayDimmed => s with { DisplayOff = false },
        PowerEvent.Suspend => s with { Asleep = true },
        PowerEvent.Resume => s with { Asleep = false, DisplayOff = false },
        PowerEvent.Disconnect => s with { Disconnected = true },
        PowerEvent.Connect => s with { Disconnected = false },
        _ => s,
    };
}

public static class PowerJson
{
    /// The argument to the page's `WP.power(...)`. `battery` only when Windows reports one: a null
    /// would override the page's own navigator.getBattery() reading.
    public static string For(PowerState s, bool hidden)
    {
        static string B(bool v) => v ? "true" : "false";
        var json = $$"""{"hidden":{{B(hidden)}},"saver":{{B(s.EnergySaver)}},"remote":{{B(s.Remote)}}""";
        if (s.Battery is { } b) json += $$""","battery":{"charging":{{B(b.Charging)}},"level":{{b.Level.ToString("R", CultureInfo.InvariantCulture)}}}""";
        return json + "}";
    }
}
