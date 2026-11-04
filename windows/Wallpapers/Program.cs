using System.Windows.Forms;

namespace Wallpapers;

/// Modes (SPEC §10.25.4): the app · --quit · --reload · --settings · --dump-displays · --selftest [--bad-web-root].
static class Program
{
    [STAThread]
    static int Main(string[] args)
    {
        var paths = AppPaths.Resolve(args);
        var selfTest = paths.Flavor == "test";
        if (selfTest)
        {
            // One at a time (never wipe a running test's folder); then it starts from nothing, and
            // --bad-web-root points it at a folder that isn't there.
            if (!SingleInstance.TryBecomeFirst(paths.Flavor)) return 2;
            SelfTest.Wipe(paths.Root);
            if (args.Contains("--bad-web-root")) paths = paths.WithWebRoot(Path.Combine(paths.Root, "no-such-web"));
        }
        Log.Init(paths);

        if (args.Contains("--quit"))
        {
            Log.Info($"--quit: {(SingleInstance.Send(paths.Flavor, "quit") ? "asked the running app to quit" : "nothing running")}");
            return 0;
        }
        if (args.Contains("--reload"))
        {
            // make win-dev's partner: after a web/ edit, reload the running app's pages.
            Log.Info($"--reload: {(SingleInstance.Send(paths.Flavor, "reload") ? "asked the running app to reload" : "nothing running")}");
            return 0;
        }
        if (args.Contains("--dump-displays"))
        {
            File.WriteAllText(Path.Combine(paths.Root, "displays.json"), Displays.ToJson(N.Monitors()));
            File.WriteAllText(Path.Combine(paths.Root, "tree.json"), DesktopShape.TreeToJson(DesktopLayer.Anonymised(DesktopLayer.Snapshot())));
            Log.Info($"--dump-displays: wrote displays.json and tree.json to {paths.Root}");
            return 0;
        }
        if (!selfTest && !SingleInstance.TryBecomeFirst(paths.Flavor))
        {
            // A second launch (the Start menu, make win-run twice) opens the first one's settings.
            N.AllowSetForegroundWindow(N.ASFW_ANY);
            Log.Info($"second instance: {(SingleInstance.Send(paths.Flavor, "settings") ? "asked the first to open settings" : "the first didn't answer")}");
            return 0;
        }

        ApplicationConfiguration.Initialize();
        // App starts the pipe listener, which posts commands to this thread before Application.Run.
        SynchronizationContext.SetSynchronizationContext(new WindowsFormsSynchronizationContext());
        var app = new App(paths);
        if (args.Contains("--settings")) app.OpenSettings();
        if (selfTest) SelfTest.Start(app, badWebRoot: args.Contains("--bad-web-root"));
        Application.Run(app);
        return selfTest ? SelfTest.ExitCode : 0;
    }
}
