using System.Windows.Forms;

namespace Wallpapers;

/// The screen saver's process (SPEC §10.25.12): Program hands every saver mode here. /s shows a page on
/// every monitor until input; /p and /c come in a later step.
static class SaverMain
{
    public static int Run(AppPaths paths, SaverArgs saver, string[] args)
    {
        Log.Init(paths, saver: true);
        Log.Info($"saver {App.Version} ({paths.Flavor}): {saver.Mode}{(saver.Window != 0 ? $" {saver.Window}" : "")}");
        if (saver.Mode is SaverMode.Preview or SaverMode.Configure)
        {
            Log.Info($"saver: {saver.Mode} isn't built yet");
            return 0;
        }

        // Windows can start a second /s over a first one; that one just goes.
        using var mutex = new Mutex(true, $@"Local\Wallpapers-{paths.Flavor}-saver", out var first);
        if (!first) { Log.Info("saver: already running"); return 0; }

        ApplicationConfiguration.Initialize();
        SynchronizationContext.SetSynchronizationContext(new WindowsFormsSynchronizationContext());
        SaverSession? session = null;
        // A saver must never linger: a topmost black window nothing ends would lock the user out of their screen.
        void Crash(Exception? e)
        {
            Log.Error($"saver: crash: {e}");
            session?.Crashed();
            Environment.Exit(1);
        }
        Application.ThreadException += (_, e) => Crash(e.Exception);
        AppDomain.CurrentDomain.UnhandledException += (_, e) => Crash(e.ExceptionObject as Exception);
        session = new SaverSession(paths, args);
        Application.Run(session);
        Log.Info("saver: ended");
        return 0;
    }
}
