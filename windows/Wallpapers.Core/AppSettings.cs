using System.Text.Json;
using System.Text.Json.Serialization;

namespace Wallpapers.Core;

/// Same wallpaper on every monitor, or each its own (SPEC §10.25.6).
public enum MonitorMode { Same, Different }

/// The app's own settings (settings.json in the data folder; SPEC §10.25.4). Wallpaper settings
/// live in the pages' localStorage, not here.
public sealed record AppSettings(bool DrawAboveIcons = false, Rect? SettingsBounds = null, MonitorMode Monitors = MonitorMode.Same,
    bool FollowMouse = true, bool DesktopClicks = true)
{
    static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true,
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },   // "monitors": "different"
    };

    /// Missing → defaults. Unreadable → defaults, with the bad file kept beside it as settings.bad.json.
    public static AppSettings Load(string path)
    {
        if (!File.Exists(path)) return new AppSettings();
        var text = File.ReadAllText(path);
        try { return JsonSerializer.Deserialize<AppSettings>(text, Options) ?? new AppSettings(); }
        catch (JsonException)
        {
            File.WriteAllText(Path.Combine(Path.GetDirectoryName(path) ?? ".", Path.GetFileNameWithoutExtension(path) + ".bad.json"), text);
            return new AppSettings();
        }
    }

    /// Written to a temporary file, then moved over the old one: a crash mid-save never leaves half a file.
    public void Save(string path)
    {
        var temp = path + ".tmp";
        File.WriteAllText(temp, JsonSerializer.Serialize(this, Options));
        File.Move(temp, path, overwrite: true);
    }
}
