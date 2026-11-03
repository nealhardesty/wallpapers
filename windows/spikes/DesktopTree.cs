using System.Text;

namespace Spike;

public record WinInfo(IntPtr Hwnd, IntPtr Parent, string Class, string Text, uint Style, uint ExStyle, RECT Rect, int Depth, int ZIndex, int Pid, bool Visible);

public sealed class TreeSnapshot
{
    public IntPtr Progman, DefView, DefViewParent, ListView, WallpaperWorkerW;
    public string Layout = "not-split";
    public List<WinInfo> Windows = [];
}

/// Explorer's desktop windows: Progman, top-level WorkerWs, and all their descendants.
public static class DesktopTree
{
    public static TreeSnapshot Snapshot()
    {
        var s = new TreeSnapshot { Progman = N.FindWindow("Progman", null) };
        var roots = new List<IntPtr>();
        if (s.Progman != IntPtr.Zero) roots.Add(s.Progman);
        roots.AddRange(N.TopLevel("WorkerW"));
        foreach (var r in roots) Walk(s, r, 0, 0);

        var dv = s.Windows.FirstOrDefault(w => w.Class == "SHELLDLL_DefView");
        if (dv != null)
        {
            s.DefView = dv.Hwnd;
            s.DefViewParent = N.GetParent(dv.Hwnd);
            s.ListView = N.FindWindowEx(dv.Hwnd, IntPtr.Zero, "SysListView32", null);
            if (s.DefViewParent == s.Progman)
            {
                s.Layout = "raised";
                s.WallpaperWorkerW = N.Children(s.Progman).FirstOrDefault(c => N.ClassOf(c) == "WorkerW");
            }
            else if (N.ClassOf(s.DefViewParent) == "WorkerW" && N.GetParent(s.DefViewParent) == IntPtr.Zero)
            {
                s.Layout = "classic";
                // Only Explorer's own visible WorkerWs: many processes own tiny hidden ones.
                var pid = N.PidOf(s.Progman);
                s.WallpaperWorkerW = N.TopLevel("WorkerW").FirstOrDefault(w => w != s.DefViewParent
                    && N.PidOf(w) == pid && N.IsWindowVisible(w)
                    && N.FindWindowEx(w, IntPtr.Zero, "SHELLDLL_DefView", null) == IntPtr.Zero);
            }
        }
        return s;
    }

    static void Walk(TreeSnapshot s, IntPtr h, int depth, int z)
    {
        s.Windows.Add(new WinInfo(h, N.GetParent(h), N.ClassOf(h), N.TextOf(h), N.Style(h), N.ExStyle(h), N.RectOf(h), depth, z, N.PidOf(h), N.IsWindowVisible(h)));
        var i = 0;
        foreach (var c in N.Children(h)) Walk(s, c, depth + 1, i++);
    }

    public static bool LayerReady(TreeSnapshot s) =>
        s.Layout == "classic" ? s.WallpaperWorkerW != IntPtr.Zero
        : s.Layout == "raised" && s.WallpaperWorkerW != IntPtr.Zero;

    /// Send 0x052C (0xD, 1) only if the wallpaper layer is missing, then wait up to 2 s for it.
    public static (TreeSnapshot snap, bool sent, int waitedMs) EnsureLayer()
    {
        var s = Snapshot();
        if (LayerReady(s) || s.Progman == IntPtr.Zero) return (s, false, 0);
        N.SendMessageTimeout(s.Progman, 0x052C, 0xD, 1, N.SMTO_NORMAL, 1000, out _);
        var sw = System.Diagnostics.Stopwatch.StartNew();
        while (sw.ElapsedMilliseconds < 2000)
        {
            Thread.Sleep(100);
            s = Snapshot();
            if (LayerReady(s)) break;
        }
        return (s, true, (int)sw.ElapsedMilliseconds);
    }

    public static void Print(TreeSnapshot s)
    {
        foreach (var w in s.Windows)
            Log.Line($"{new string(' ', w.Depth * 2)}{N.Hex(w.Hwnd)} {w.Class} \"{w.Text}\" style=0x{w.Style:X8} ex=0x{w.ExStyle:X8} rect={w.Rect} z={w.ZIndex} pid={w.Pid}{(w.Visible ? "" : " hidden")}");
        Log.Line($"layout={s.Layout} progman={N.Hex(s.Progman)} defview={N.Hex(s.DefView)} defviewParent={N.Hex(s.DefViewParent)} listview={N.Hex(s.ListView)} wallpaperWorkerW={N.Hex(s.WallpaperWorkerW)}");
    }

    public static void PrintEnvironment()
    {
        var v = new OSVERSIONINFOEX { dwOSVersionInfoSize = Marshal.SizeOf<OSVERSIONINFOEX>() };
        N.RtlGetVersion(ref v);
        Log.Line($"windows {v.dwMajorVersion}.{v.dwMinorVersion}.{v.dwBuildNumber} session={Environment.GetEnvironmentVariable("SESSIONNAME")} remote={N.GetSystemMetrics(N.SM_REMOTESESSION) != 0}");
        foreach (var m in MonitorInfo.All()) Log.Line($"monitor {m}");
        var sb = new StringBuilder(520);
        N.SystemParametersInfo(N.SPI_GETDESKWALLPAPER, 520, sb, 0);
        var p = sb.ToString();
        Log.Line($"wallpaper path={(p.Length == 0 ? "<empty>" : "<set>")} ext={(p.Length == 0 ? "" : Path.GetExtension(p))}");
    }

    public static int Run(Opts o)
    {
        PrintEnvironment();
        if (!o.Has("ensure")) { Print(Snapshot()); return 0; }
        Log.Line("before:");
        Print(Snapshot());
        var (s, sent, waited) = EnsureLayer();
        Log.Line($"after: sent={sent} waited={waited}ms");
        Print(s);
        return 0;
    }
}
