using System.Reflection;
using System.Windows.Forms;

namespace Wallpapers;

/// The running app: startup order, commands from a second launch, and cleanup on every way out
/// (Quit, a crash, logoff; SPEC §10.25.5).
sealed class App : ApplicationContext
{
    public static string Version { get; } =
        typeof(App).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion ?? "?";

    public AppPaths Paths { get; }
    public AppSettings Settings { get; private set; }
    public DesktopLayer Layer { get; }
    public Power Power { get; } = new();
    public Desktop Desktop { get; }
    public Tray Tray { get; }
    SettingsWindow? settingsWindow;
    /// Why nothing can be shown (no web root), or null.
    public string? Problem { get; }
    bool cleaned;

    public App(AppPaths paths)
    {
        Paths = paths;
        Settings = AppSettings.Load(paths.SettingsFile);
        Log.Info($"Wallpapers {Version} ({paths.Flavor}) data={paths.Root} web={paths.WebRoot}");
        Application.ThreadException += (_, e) => Crash(e.Exception);
        AppDomain.CurrentDomain.UnhandledException += (_, e) => Crash(e.ExceptionObject as Exception);
        Layer = new DesktopLayer(Log.Info) { DrawAboveIcons = Settings.DrawAboveIcons };
        Layer.EndSession += () => Cleanup("logoff");
        Power.Start();
        Desktop = new Desktop(paths, Layer, Settings.Monitors, Power);
        Power.Changed += () => _ = Desktop.ApplyPowerAsync();
        Problem = paths.CheckWebRoot();
        if (Problem != null) Log.Error(Problem);
        else _ = Desktop.StartAsync();
        Tray = new Tray(this);
        SingleInstance.Listen(paths.Flavor, OnCommand);
    }

    public void SaveSettings(AppSettings settings)
    {
        Settings = settings;
        try { settings.Save(Paths.SettingsFile); } catch (IOException e) { Log.Warn($"settings: {e.Message}"); }
    }

    void OnCommand(string command)
    {
        Log.Info($"command: {command}");
        switch (command)
        {
            case "quit": Quit(); break;
            case "settings": OpenSettings(); break;
            case "reload": Desktop.ReloadAll(); break;
            default: Log.Warn($"unknown command {command}"); break;
        }
    }

    public void OpenSettings()
    {
        if (Problem != null) { Log.Warn($"settings: can't open ({Problem})"); return; }
        settingsWindow ??= new SettingsWindow(this);
        _ = settingsWindow.ShowOrFocusAsync();
    }

    public void Quit()
    {
        Cleanup("quit");
        ExitThread();
    }

    void Crash(Exception? e)
    {
        Log.Error($"crash: {e}");
        Cleanup("crash");
        // With the wallpaper and the tray icon gone, staying would leave an invisible process that
        // holds the single-instance lock: the next launch would only "open settings" in it.
        ExitThread();
    }

    /// Idempotent: everything that must not outlive us (hosts, web views, a stale frame).
    public void Cleanup(string reason)
    {
        if (cleaned) return;
        cleaned = true;
        Log.Info($"cleanup reason={reason}");
        Tray?.Dispose();   // null when cleanup comes during startup
        try { settingsWindow?.CloseForGood(); }
        catch (Exception e) { Log.Error($"cleanup: settings window: {e.Message}"); }
        try { Desktop.Dispose(); }
        catch (Exception e) { Log.Error($"cleanup: {e.Message}"); }
        Layer.Dispose();
        Power.Dispose();
    }
}
