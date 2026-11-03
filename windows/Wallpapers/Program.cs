using System.Windows.Forms;

namespace Wallpapers;

/// Modes (SPEC §10.25.4): the app · --quit · --settings · --dump-displays · --selftest (Task 9).
static class Program
{
    [STAThread]
    static int Main(string[] args)
    {
        var paths = AppPaths.Resolve(args);
        Log.Init(paths);

        if (args.Contains("--quit"))
        {
            Log.Info($"--quit: {(SingleInstance.Send(paths.Flavor, "quit") ? "asked the running app to quit" : "nothing running")}");
            return 0;
        }
        if (args.Contains("--dump-displays"))
        {
            File.WriteAllText(Path.Combine(paths.Root, "displays.json"), Displays.ToJson(N.Monitors()));
            File.WriteAllText(Path.Combine(paths.Root, "tree.json"), DesktopShape.TreeToJson(DesktopLayer.Anonymised(DesktopLayer.Snapshot())));
            Log.Info($"--dump-displays: wrote displays.json and tree.json to {paths.Root}");
            return 0;
        }
        if (!SingleInstance.TryBecomeFirst(paths.Flavor))
        {
            // A second launch (the Start menu, make win-run twice) opens the first one's settings.
            Log.Info($"second instance: {(SingleInstance.Send(paths.Flavor, "settings") ? "asked the first to open settings" : "the first didn't answer")}");
            return 0;
        }

        ApplicationConfiguration.Initialize();
        // App starts the pipe listener, which posts commands to this thread before Application.Run.
        SynchronizationContext.SetSynchronizationContext(new WindowsFormsSynchronizationContext());
        var app = new App(paths);
        if (args.Contains("--settings")) app.OpenSettings();
        Application.Run(app);
        return 0;
    }
}
