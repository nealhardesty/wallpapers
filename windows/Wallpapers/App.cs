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
        Problem = paths.CheckWebRoot();
        if (Problem != null) Log.Error(Problem);
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
            default: Log.Warn($"unknown command {command}"); break;
        }
    }

    public void OpenSettings() => Log.Info("settings: not built yet (W1 Task 8)");

    public void Quit()
    {
        Cleanup("quit");
        ExitThread();
    }

    void Crash(Exception? e)
    {
        Log.Error($"crash: {e}");
        Cleanup("crash");
    }

    /// Idempotent: everything that must not outlive us (hosts, web views, a stale frame).
    public void Cleanup(string reason)
    {
        if (cleaned) return;
        cleaned = true;
        Log.Info($"cleanup reason={reason}");
        Layer.Dispose();
    }
}
