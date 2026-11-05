using System.Reflection;
using System.Windows.Forms;

namespace Wallpapers;

/// The running app: startup order, commands from a second launch, and cleanup on every way out
/// (Quit, a crash, logoff; SPEC §10.25.5).
sealed class App : ApplicationContext
{
    public static string Version { get; } =
        typeof(App).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion ?? "?";

    /// The project's page, stamped in by build.sh from web/manifest.json; null in a build without it.
    public static string? Homepage { get; } =
        typeof(App).Assembly.GetCustomAttributes<AssemblyMetadataAttribute>().FirstOrDefault(a => a.Key == "Homepage")?.Value is { Length: > 0 } url ? url : null;

    /// Where this flavor installs (SPEC §10.25.13): run and test; dev never installs.
    public static InstallLayout? LayoutFor(string flavor) => flavor is "run" or "test"
        ? InstallLayout.For(flavor, Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData))
        : null;

    public AppPaths Paths { get; }
    public AppSettings Settings { get; private set; }
    public DesktopLayer Layer { get; }
    public Power Power { get; } = new();
    public Desktop Desktop { get; }
    public Tray Tray { get; }
    public InstallLayout? Layout { get; }
    /// The installer for this flavor's layout; null for dev.
    public Install? Installer { get; }
    /// Set by the tray's Install…: Program starts the installed exe after Application.Run returns.
    public Install? StartAfterQuit { get; set; }
    SettingsWindow? settingsWindow;
    PlayWindow? playWindow;
    /// Why nothing can be shown (no web root), or null.
    public string? Problem { get; }
    bool cleaned;

    public App(AppPaths paths)
    {
        Paths = paths;
        Settings = AppSettings.Load(paths.SettingsFile);
        Layout = LayoutFor(paths.Flavor);
        if (Layout != null) Installer = new Install(Layout, Log.Info);
        Log.Info($"Wallpapers {Version} ({paths.Flavor}) data={paths.Root} web={paths.WebRoot}");
        Application.ThreadException += (_, e) => Crash(e.Exception);
        AppDomain.CurrentDomain.UnhandledException += (_, e) => Crash(e.ExceptionObject as Exception);
        Layer = new DesktopLayer(Log.Info) { DrawAboveIcons = Settings.DrawAboveIcons };
        Layer.EndSession += () => Cleanup("logoff");
        Power.Start();
        Desktop = new Desktop(paths, Layer, Settings.Monitors, Power, Settings.FollowMouse, Settings.DesktopClicks);
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
        if (command != "saver-on") Log.Info($"command: {command}");   // every 4 s while the saver runs
        switch (command)
        {
            case "quit": Quit(); break;
            case "saver-on": Power.SaverPing(); break;
            case "saver-off": Power.SaverEnded(); break;
            case "settings": OpenSettings(); break;
            case "reload": Desktop.ReloadAll(); break;
            default: Log.Warn($"unknown command {command}"); break;
        }
    }

    /// The panel; in Different mode for one monitor (monitor 1 when none is named).
    public void OpenSettings(SurfacePlan? monitor = null)
    {
        if (Problem != null) { Log.Warn($"settings: can't open ({Problem})"); return; }
        settingsWindow ??= new SettingsWindow(this);
        _ = settingsWindow.ShowOrFocusAsync(monitor);
    }

    /// Play in a Window: that surface's current wallpaper (monitor 1's, or Same mode's), as the tray last
    /// heard it, in a window on the real monitor under it (a fake layout's monitors are windows on one).
    public void OpenPlay(SurfacePlan? monitor = null)
    {
        if (Problem != null) { Log.Warn($"play: can't open ({Problem})"); return; }
        var surface = monitor == null ? Desktop.Surfaces.FirstOrDefault() : Desktop.Surfaces.FirstOrDefault(s => s.Plan.Key == monitor.Key);
        if (surface == null || Tray.CatalogFor(surface.Plan.Key) is not { } info)
        {
            Log.Info("play: nothing to play yet (that monitor's page hasn't said what it shows)");
            return;
        }
        var id = info.Current;
        var name = info.NameOf(id);
        var screen = surface.Placement.Screen;
        var real = N.Monitors();
        var under = real.FirstOrDefault(m => m.Bounds.Contains(screen.Left + screen.Width / 2, screen.Top + screen.Height / 2))
            ?? real.FirstOrDefault(m => m.Primary) ?? real.FirstOrDefault();
        Log.Info($"play: {name} ({id}) on monitor {surface.Plan.Number}");
        if (playWindow == null)
        {
            var window = playWindow = new PlayWindow(this);
            window.FormClosed += (_, _) => { if (playWindow == window) playWindow = null; };
        }
        _ = playWindow.ShowAsync(id, name, under?.Work ?? surface.Plan.Work);
    }

    /// Same or Different (the tray's Monitors menu): saved, then every page follows, and so does an
    /// open settings window.
    public async Task SetMonitorModeAsync(MonitorMode mode)
    {
        if (mode == Desktop.Mode) return;
        SaveSettings(Settings with { Monitors = mode });
        await Desktop.SetModeAsync(mode);
        settingsWindow?.FollowMode();
    }

    /// The tray's two mouse rows: saved, then the pointer re-decides whether raw input is needed.
    public void SetFollowMouse(bool on)
    {
        SaveSettings(Settings with { FollowMouse = on });
        Desktop.Pointer.Follow = on;
        Desktop.Pointer.Update();
        Log.Info($"tray: follows the mouse {(on ? "on" : "off")}");
    }

    public void SetDesktopClicks(bool on)
    {
        SaveSettings(Settings with { DesktopClicks = on });
        Desktop.Pointer.Clicks = on;
        Desktop.Pointer.Update();
        Log.Info($"tray: clicks on the desktop {(on ? "on" : "off")}");
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
        try { playWindow?.Close(); }
        catch (Exception e) { Log.Error($"cleanup: play window: {e.Message}"); }
        try { Desktop.Dispose(); }
        catch (Exception e) { Log.Error($"cleanup: {e.Message}"); }
        Layer.Dispose();
        Power.Dispose();
    }
}
