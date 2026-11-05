using System.Diagnostics;
using System.Windows.Forms;

namespace Wallpapers;

/// The screen saver's process (SPEC §10.25.12): Program hands every saver mode here. /s shows a page on
/// every monitor until input, /p draws in Windows' little monitor, /c opens the options in the app.
static class SaverMain
{
    public static int Run(AppPaths paths, SaverArgs saver, string[] args)
    {
        Log.Init(paths, saver: true);
        Log.Info($"saver {App.Version} ({paths.Flavor}): {saver.Mode}{(saver.Window != 0 ? $" {saver.Window}" : "")}");
        if (saver.Mode == SaverMode.Preview) return SaverPreview.Run(paths, (IntPtr)saver.Window);
        if (saver.Mode == SaverMode.Configure) return Configure(paths);

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

    /// /c: the options live in the app. Asked over the pipe when it runs; otherwise started with --saver-options.
    static int Configure(AppPaths paths)
    {
        N.AllowSetForegroundWindow(N.ASFW_ANY);   // the app may take the foreground we have
        if (SingleInstance.Send(paths.Flavor, "saver-options")) { Log.Info("saver: asked the app to open the options"); return 0; }
        var exe = Path.Combine(AppContext.BaseDirectory, "Wallpapers.exe");
        if (!File.Exists(exe) && Environment.ProcessPath is { } self && self.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)) exe = self;
        var args = paths.Flavor == "test" ? "--saver-options --selftest" : "--saver-options";
        try
        {
            Process.Start(exe, args)?.Dispose();
            Log.Info($"saver: started {exe} {args}");
            return 0;
        }
        catch (Exception e) when (e is System.ComponentModel.Win32Exception or InvalidOperationException)
        {
            Log.Error($"saver: couldn't start {exe}: {e.Message}");
            return 1;
        }
    }
}
