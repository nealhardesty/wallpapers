using System.Windows.Forms;

namespace Wallpapers;

/// Modes (SPEC §10.25.4): the app [--just-run] · --install · --uninstall [--keep-settings|--delete-settings] · --quit ·
/// --reload · --settings · --saver-options · --dump-displays · --selftest [--bad-web-root] (and --cover-for-test, the self-test's covering
/// window: coverage ignores our own process's; --uninstall-stage2 <root>, the %TEMP% copy that removes the install).
/// The screen saver (§10.25.12): /s, /p <hwnd>, /c (as Wallpapers.scr, no argument is /c); with --selftest, its harness.
static class Program
{
    [STAThread]
    static int Main(string[] args)
    {
        if (args is ["--cover-for-test", var rect]) return SelfTest.Cover(rect);
        var install = InstallArgs.Parse(args);
        // Before paths, the log and the mutex: it runs from %TEMP%, logs there, and may delete the data folder.
        if (install.Mode == InstallMode.UninstallStage2) return Install.Stage2(install);
        // The saver keeps its own log and lock; --selftest among its arguments makes it the test flavour
        // without the self-test's mutex or wipe.
        var saver = SaverArgs.Parse(args, Path.GetExtension(Environment.ProcessPath ?? "").Equals(".scr", StringComparison.OrdinalIgnoreCase));
        if (saver.Mode != SaverMode.None) return SaverMain.Run(AppPaths.Resolve(args), saver, args);
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
            Log.Info($"--dump-displays: wrote displays.json (with paths, names and keys) and tree.json to {paths.Root}");
            return 0;
        }
        if (install.Mode is InstallMode.Install or InstallMode.Uninstall)
        {
            // Quiet install: make win-install, or a script. Uninstall: Settings → Apps, make win-uninstall. Only the
            // normal flavor installs or uninstalls.
            var verb = install.Mode == InstallMode.Install ? "install" : "uninstall";
            if (App.LayoutFor(paths.Flavor) is not { } layout || selfTest) Log.Info($"{verb}: ignored ({paths.Flavor})");
            else if (install.Mode == InstallMode.Uninstall)
            {
                if (new Install(layout, Log.Info).StartUninstall(install.KeepSettings) is { } why) { Log.Error($"uninstall: failed: {why}"); return 1; }
                return 0;
            }
            else
            {
                var installer = new Install(layout, Log.Info);
                if (installer.Apply(AppContext.BaseDirectory, fresh: true) is { } why) { Log.Error($"install: failed: {why}"); return 1; }
                return installer.Start() ? 0 : 1;
            }
        }

        ApplicationConfiguration.Initialize();
        // The offer comes before the single-instance check: a newer download offers Update while the
        // installed app runs, and Install or Update quits whichever copy holds the mutex.
        if (paths.Flavor == "run" && App.LayoutFor(paths.Flavor) is { } runLayout)
        {
            // Opened inside the zip: no Install and no Just Run (it would remember the choice), only "unzip first".
            if (Install.ShowUnzipFirst(Log.Info)) return 0;
            var installer = new Install(runLayout, Log.Info);
            var settings = AppSettings.Load(paths.SettingsFile);
            var offer = installer.OfferToShow(settings, install.JustRun);
            if (offer != Offer.None && installer.ShowOffer(offer, settings)) return 0;
        }

        if (!selfTest && !SingleInstance.TryBecomeFirst(paths.Flavor))
        {
            // A second launch (the Start menu, make win-run twice) opens the first one's settings; a /c that
            // started us just as the app did, the saver's options.
            N.AllowSetForegroundWindow(N.ASFW_ANY);
            var command = args.Contains("--saver-options") ? "saver-options" : "settings";
            Log.Info($"second instance: {(SingleInstance.Send(paths.Flavor, command) ? $"asked the first to open {command}" : "the first didn't answer")}");
            return 0;
        }

        // App starts the pipe listener, which posts commands to this thread before Application.Run.
        SynchronizationContext.SetSynchronizationContext(new WindowsFormsSynchronizationContext());
        var app = new App(paths);
        if (args.Contains("--settings")) app.OpenSettings();
        if (args.Contains("--saver-options")) app.OpenSaverOptions();
        if (selfTest) SelfTest.Start(app, badWebRoot: args.Contains("--bad-web-root"));
        Application.Run(app);
        // The tray's Install…: the installed exe starts once this one has cleaned up (hosts, web views).
        app.StartAfterQuit?.Start();
        return selfTest ? SelfTest.ExitCode : 0;
    }
}
