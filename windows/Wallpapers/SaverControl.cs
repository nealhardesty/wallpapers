using System.ComponentModel;
using System.Diagnostics;
using System.Security;
using System.Windows.Forms;

namespace Wallpapers;

/// The Screen Saver choices (SPEC §10.25.12), behind the tray's Screen Saver menu and the options window
/// (/c): whether ours is the saver, when it starts, and what it shows. Every failure is logged and said in
/// a warning dialog; nothing throws back into the tray or the window.
sealed class SaverControl(App app)
{
    readonly SaverSelection selection = new(app.Paths.Flavor, Log.Info);

    public SaverSettings Settings => app.Settings.Saver ?? new();

    public void Set(SaverSettings s) => app.SaveSettings(app.Settings with { Saver = s.Normalized() });

    /// Why ours can't be selected (not installed, or a policy sets the saver), or null.
    public string? WhyNot()
    {
        if (app.Installer == null || !File.Exists(app.Layout!.Saver)) return "Install Wallpapers first";
        return Read("policy", selection.PolicyReason, null);
    }

    public bool Selected => app.Layout is { } layout && Read("selected", () => selection.IsSelected(layout.Saver), false);

    /// Windows' minutes before the saver starts (null: unset or unreadable).
    public int? StartAfter => Read("start after", selection.TimeoutMinutes, null);

    /// Selecting asks first (and starts it after 5 minutes when Windows had no timeout); unselecting puts the
    /// saver from before back, without asking.
    public void ToggleUse()
    {
        if (app.Layout is not { } layout) return;
        try
        {
            if (selection.IsSelected(layout.Saver))
            {
                selection.RestoreIfOurs(Settings.Before, layout.Saver);
                Set(Settings with { Before = null });
                return;
            }
            if (WhyNot() is { } why) { Warn("Couldn't use Wallpapers as the screen saver", why + "."); return; }
            var minutes = StartAfter is { } m and > 0 ? m : (int?)null;
            if (!Ask(minutes ?? 5)) return;
            if (minutes == null) SetStartAfter(5);
            var before = selection.Select(layout.Saver);
            // Already ours (selected elsewhere meanwhile): the saver from before stays the one we keep.
            if (!SaverRegistry.IsOurs(before.Exe, layout.Saver, SaverSelection.LongPath)) Set(Settings with { Before = before });
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or SecurityException)
        {
            Warn("Couldn't change the screen saver", $"Windows' screen saver setting couldn't be written ({e.Message}).");
        }
    }

    public void SetStartAfter(int minutes)
    {
        try { selection.SetTimeoutMinutes(minutes); }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or SecurityException)
        {
            Warn("Couldn't change when the screen saver starts", $"Windows' setting couldn't be written ({e.Message}).");
            return;
        }
        // The run flavour's SystemParametersInfo only logs a failure: read it back to know.
        if (StartAfter != minutes) Warn("Couldn't change when the screen saver starts", $"Windows didn't take {Minutes(minutes)}.");
    }

    public void PreviewNow() => Start("preview the screen saver", Environment.ProcessPath!, app.Paths.Flavor == "test" ? "/s --selftest" : "/s");

    public void OpenWindowsSettings() => Start("open Windows' Screen Saver Settings", Path.Combine(Environment.SystemDirectory, "control.exe"), "desk.cpl,,@screensaver");

    /// What it will show, for the question: "showing …".
    string Showing()
    {
        var s = Settings;
        return s.Show switch
        {
            SaverShow.Different => "a different wallpaper each time",
            SaverShow.One when s.Wallpaper != null => app.Tray?.Catalog?.NameOf(s.Wallpaper) ?? s.Wallpaper,
            _ => "the same wallpaper as the desktop",
        };
    }

    bool Ask(int minutes)
    {
        var use = new TaskDialogButton("Use Wallpapers");
        var page = new TaskDialogPage
        {
            Caption = "Wallpapers",
            Heading = "Use Wallpapers as your screen saver?",
            Text = $"It starts after {Minutes(minutes)} without input, showing {Showing()}. Windows' Screen Saver Settings can change it back, and uninstalling Wallpapers puts your old one back.",
            Buttons = { use, TaskDialogButton.Cancel },
            DefaultButton = use,
            AllowCancel = true,
        };
        return Show(page) == use;
    }

    static string Minutes(int n) => n == 1 ? "1 minute" : $"{n} minutes";

    static void Start(string what, string file, string args)
    {
        try
        {
            Log.Info($"saver: {what}: {Path.GetFileName(file)} {args}");
            Process.Start(file, args)?.Dispose();
        }
        catch (Exception e) when (e is Win32Exception or InvalidOperationException or IOException)
        {
            Warn($"Couldn't {what}", $"{Path.GetFileName(file)} didn't start ({e.Message}).");
        }
    }

    static T Read<T>(string what, Func<T> read, T fallback)
    {
        try { return read(); }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or SecurityException)
        {
            Log.Warn($"saver: couldn't read {what}: {e.GetType().Name}: {e.Message}");
            return fallback;
        }
    }

    static void Warn(string heading, string text)
    {
        Log.Warn($"saver: {heading}: {text}");
        Show(new TaskDialogPage { Caption = "Wallpapers", Heading = heading, Text = text, AllowCancel = true, Icon = TaskDialogIcon.Warning });
    }

    /// Over the options window when it's the one in front, else in the middle of the screen.
    static TaskDialogButton Show(TaskDialogPage page) => Form.ActiveForm is { } owner
        ? TaskDialog.ShowDialog(owner, page)
        : TaskDialog.ShowDialog(page, TaskDialogStartupLocation.CenterScreen);
}
