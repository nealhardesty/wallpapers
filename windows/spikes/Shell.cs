using System.Diagnostics;
using System.Text;

namespace Spike;

/// `repaint`, `stop`, `restart-explorer` (plan Task 3).
public static class Shell
{
    public const string StopEvent = @"Local\WallpapersSpikeStop";

    /// Re-apply the same wallpaper path (no SPIF_UPDATEINIFILE) so Explorer repaints its own picture.
    /// An empty path (solid colour, some slideshows) is skipped: setting "" would remove the picture.
    public static void Repaint()
    {
        var sb = new StringBuilder(520);
        N.SystemParametersInfo(N.SPI_GETDESKWALLPAPER, 520, sb, 0);
        var path = sb.ToString();
        if (path.Length == 0) { Log.Line("repaint skipped: empty path"); return; }
        var ok = N.SystemParametersInfo(N.SPI_SETDESKWALLPAPER, 0, path, 0);
        Log.Line($"repaint path=<set> ext={Path.GetExtension(path)} ok={ok}");
    }

    public static int Stop()
    {
        if (!EventWaitHandle.TryOpenExisting(StopEvent, out var e)) { Log.Line("stop: nothing running"); return 1; }
        e.Set();
        Log.Line("stop: signalled");
        return 0;
    }

    /// W0.2: a plain maximized window over the desktop for N seconds (a deterministic "covered").
    public static int Cover(Opts o)
    {
        var seconds = o.Int("seconds", 60);
        var f = new System.Windows.Forms.Form { Text = "W0.2 cover", WindowState = System.Windows.Forms.FormWindowState.Maximized, BackColor = System.Drawing.Color.DimGray };
        var t = new System.Windows.Forms.Timer { Interval = seconds * 1000 };
        t.Tick += (_, _) => f.Close();
        // Launched from WSL, the first show can come out minimized: force it up and in front.
        f.Shown += (_, _) =>
        {
            f.WindowState = System.Windows.Forms.FormWindowState.Normal;
            f.WindowState = System.Windows.Forms.FormWindowState.Maximized;
            f.TopMost = true; f.TopMost = false;
            f.Activate();
            t.Start();
            Log.Line($"cover: maximized for {seconds}s, state={f.WindowState}");
        };
        System.Windows.Forms.Application.Run(f);
        Log.Line("cover: closed");
        return 0;
    }

    public static int RestartExplorer()
    {
        var session = Process.GetCurrentProcess().SessionId;
        var old = Process.GetProcessesByName("explorer").Where(p => p.SessionId == session).ToList();
        var oldIds = old.Select(p => p.Id).ToHashSet();
        var sw = Stopwatch.StartNew();
        foreach (var p in old) { try { p.Kill(); } catch (Exception e) { Log.Line($"kill {p.Id}: {e.Message}"); } }
        Log.Line($"restart-explorer: killed {old.Count}");
        while (sw.ElapsedMilliseconds < 10000)
        {
            Thread.Sleep(200);
            var progman = N.FindWindow("Progman", null);
            if (progman != IntPtr.Zero && !oldIds.Contains(N.PidOf(progman)))
            {
                Log.Line($"restart-explorer: back after {sw.ElapsedMilliseconds} ms (auto-restart)");
                return 0;
            }
        }
        Process.Start(new ProcessStartInfo("explorer.exe") { UseShellExecute = true });
        Log.Line($"restart-explorer: not back after 10 s; started explorer.exe");
        return 0;
    }
}
