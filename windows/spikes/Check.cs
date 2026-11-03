using System.Drawing;
using System.Drawing.Imaging;
using System.Windows.Automation;

namespace Spike;

/// W0.1's pass criteria, run as a separate process while `layer` runs (plan Task 1).
public static class Check
{
    static int fails;

    static void Result(string verdict, string name, string detail = "")
    {
        if (verdict == "FAIL") fails++;
        Log.Line($"{verdict,-4}  {name}  {detail}");
    }

    static void Is(bool ok, string name, string detail = "") => Result(ok ? "PASS" : "FAIL", name, detail);

    public static List<IntPtr> FindHosts(TreeSnapshot s) =>
        s.Windows.Where(w => w.Class == Host.ClassName).Select(w => w.Hwnd).ToList();

    public static (string mode, Color color) Parse(IntPtr host)
    {
        var parts = N.TextOf(host).Split(':');
        return parts.Length == 3 ? (parts[1], ColorTranslator.FromHtml("#" + parts[2])) : ("?", Color.Magenta);
    }

    public static int Run(Opts o)
    {
        var tag = o.Get("tag") ?? "check";
        DesktopTree.PrintEnvironment();
        var s = DesktopTree.Snapshot();
        var monitors = MonitorInfo.All();
        var hosts = FindHosts(s);
        Log.Line($"check tag={tag} layout={s.Layout} hosts={hosts.Count}");

        if (o.Has("after-quit"))
        {
            var c = ColorTranslator.FromHtml("#" + (o.Get("color") ?? "FF00C8"));
            Is(hosts.Count == 0, "no-hosts", $"{hosts.Count}");
            using var shot = Capture(tag);
            foreach (var m in monitors)
            {
                var f = Fraction(shot, m.Rect, c);
                Is(f < 0.01, "pixels-gone", $"{m.Device} {f:P1} host colour");
            }
            return Done();
        }

        Is(hosts.Count == monitors.Count, "hosts", $"{hosts.Count} of {monitors.Count}");
        if (hosts.Count == 0) { Capture(tag).Dispose(); return Done(); }

        var (mode, color) = Parse(hosts[0]);
        Log.Line($"mode={mode} color={ColorTranslator.ToHtml(color)}");
        var progmanKids = N.Children(s.Progman);
        foreach (var h in hosts)
        {
            var parent = N.GetParent(h);
            var want = mode switch { "raised" => s.Progman, "workerw" => s.WallpaperWorkerW, "defview" => s.DefView, _ => IntPtr.Zero };
            Is(parent == want && want != IntPtr.Zero, "parent", $"{N.Hex(h)} parent={N.Hex(parent)} {N.ClassOf(parent)}, want {N.Hex(want)}");

            switch (mode)
            {
                case "raised":
                    int iDef = progmanKids.IndexOf(s.DefView), iHost = progmanKids.IndexOf(h), iWork = progmanKids.IndexOf(s.WallpaperWorkerW);
                    Is(iDef >= 0 && iHost > iDef && (iWork < 0 || iHost < iWork), "z-order",
                        $"Progman children top→bottom: {string.Join(" > ", progmanKids.Select(N.ClassOf))}");
                    break;
                case "defview":
                    Is(N.GetWindow(h, N.GW_HWNDNEXT) == IntPtr.Zero, "z-order", $"DefView children top→bottom: {string.Join(" > ", N.Children(s.DefView).Select(N.ClassOf))}");
                    break;
                default:
                    Result("PASS", "z-order", "child of the layer");
                    break;
            }

            var r = N.RectOf(h);
            var mon = monitors.FirstOrDefault(m => m.Rect.L == r.L && m.Rect.T == r.T);
            Is(mon != null && mon.Rect.R == r.R && mon.Rect.B == r.B, "bounds", $"host={r} monitor={mon?.Rect.ToString() ?? "none at origin"}");

            var layered = (N.ExStyle(h) & N.WS_EX_LAYERED) != 0;
            byte alpha = 255;
            if (layered) N.GetLayeredWindowAttributes(h, out _, out alpha, out _);
            Is(N.IsWindowVisible(h) && alpha == 255, "visible", $"visible={N.IsWindowVisible(h)} layered={layered} alpha={alpha}");
        }

        using var bmp = Capture(tag);
        foreach (var m in monitors)
        {
            var f = Fraction(bmp, m.Rect, color);
            Is(f >= 0.5, "pixels", $"{m.Device} {f:P1} host colour");
        }

        var allIcons = Icons(s);
        // Only icons on bare desktop count: one under an app window proves nothing.
        var icons = allIcons?.Where(i => Exposed(new POINT((i.rect.L + i.rect.R) / 2, (i.rect.T + i.rect.B) / 2))).ToList();
        if (allIcons != null && icons!.Count < allIcons.Count) Log.Line($"icons: {allIcons.Count - icons.Count} of {allIcons.Count} are under app windows, not checked");
        if (icons == null) Result("SKIP", "icons-in-front", "icons hidden or no icon view");
        else if (icons.Count == 0) Result("SKIP", "icons-in-front", "no exposed icons on the desktop");
        else
        {
            var covered = icons.Where(i => !Grid(i.rect, 5).Any(p => !Near(Pixel(bmp, p), color))).ToList();
            Is(covered.Count == 0, "icons-in-front", $"{icons.Count - covered.Count} of {icons.Count} icons visible over the host"
                + (covered.Count > 0 ? $"; covered: {string.Join(", ", covered.Select(c => c.name))}" : ""));
        }

        var bare = BarePoint(s, monitors, icons);
        if (bare == null) Result("SKIP", "hit-test", "no bare-desktop point found");
        else
        {
            var w = N.WindowFromPoint(bare.Value);
            var cls = N.ClassOf(w);
            Is((cls == "SysListView32" || cls == "SHELLDLL_DefView") && !hosts.Contains(w), "hit-test", $"WindowFromPoint({bare}) = {cls}");
        }

        if (o.Has("interact"))
        {
            if (bare == null) Result("SKIP", "context-menu", "no bare point");
            else Is(ContextMenu(bare.Value, N.PidOf(s.Progman)), "context-menu", $"right-click at {bare}");
        }
        return Done();
    }

    static int Done()
    {
        Log.Line(fails == 0 ? "check: all passed" : $"check: {fails} failed");
        return fails == 0 ? 0 : 1;
    }

    static Bitmap Capture(string tag)
    {
        int x = N.GetSystemMetrics(N.SM_XVIRTUALSCREEN), y = N.GetSystemMetrics(N.SM_YVIRTUALSCREEN);
        int w = N.GetSystemMetrics(N.SM_CXVIRTUALSCREEN), h = N.GetSystemMetrics(N.SM_CYVIRTUALSCREEN);
        var bmp = new Bitmap(w, h, PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(bmp)) g.CopyFromScreen(x, y, 0, 0, new Size(w, h));
        bmp.Tag = new POINT(x, y);
        bmp.Save($"check-{tag}.png", ImageFormat.Png);
        return bmp;
    }

    static Color Pixel(Bitmap b, POINT p)
    {
        var o = (POINT)b.Tag!;
        int x = p.X - o.X, y = p.Y - o.Y;
        return x >= 0 && y >= 0 && x < b.Width && y < b.Height ? b.GetPixel(x, y) : Color.Black;
    }

    static bool Near(Color a, Color b) => Math.Abs(a.R - b.R) <= 10 && Math.Abs(a.G - b.G) <= 10 && Math.Abs(a.B - b.B) <= 10;

    static unsafe double Fraction(Bitmap b, RECT r, Color c)
    {
        var o = (POINT)b.Tag!;
        var area = Rectangle.Intersect(new Rectangle(r.L - o.X, r.T - o.Y, r.W, r.H), new Rectangle(0, 0, b.Width, b.Height));
        var data = b.LockBits(area, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
        long hit = 0;
        try
        {
            for (var y = 0; y < area.Height; y++)
            {
                var row = (byte*)data.Scan0 + y * data.Stride;
                for (var x = 0; x < area.Width; x++)
                {
                    byte bl = row[x * 4], g = row[x * 4 + 1], rd = row[x * 4 + 2];
                    if (Math.Abs(rd - c.R) <= 10 && Math.Abs(g - c.G) <= 10 && Math.Abs(bl - c.B) <= 10) hit++;
                }
            }
        }
        finally { b.UnlockBits(data); }
        return (double)hit / ((long)area.Width * area.Height);
    }

    static IEnumerable<POINT> Grid(RECT r, int n)
    {
        for (var i = 0; i < n; i++)
            for (var j = 0; j < n; j++)
                yield return new POINT(r.L + (2 * i + 1) * r.W / (2 * n), r.T + (2 * j + 1) * r.H / (2 * n));
    }

    /// The desktop's icons through UI Automation, or null if the icon view is hidden.
    static List<(string name, RECT rect)>? Icons(TreeSnapshot s)
    {
        if (s.ListView == IntPtr.Zero || !N.IsWindowVisible(s.ListView)) return null;
        var list = new List<(string, RECT)>();
        var items = AutomationElement.FromHandle(s.ListView).FindAll(TreeScope.Children,
            new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.ListItem));
        foreach (AutomationElement e in items)
        {
            var b = e.Current.BoundingRectangle;
            if (b.IsEmpty || b.Width <= 0) continue;
            list.Add((e.Current.Name, new RECT { L = (int)b.Left, T = (int)b.Top, R = (int)b.Right, B = (int)b.Bottom }));
        }
        return list;
    }

    /// A point on bare desktop: outside icons, inside a work area, not under an app window.
    public static POINT? BarePoint(TreeSnapshot s, List<MonitorInfo> monitors, List<(string name, RECT rect)>? icons)
    {
        foreach (var m in monitors)
            foreach (var p in Grid(m.Work, 7))
            {
                if (icons != null && icons.Any(i => i.rect.Contains(p))) continue;
                var root = N.GetAncestor(N.WindowFromPoint(p), N.GA_ROOT);
                var rc = N.ClassOf(root);
                if (rc == "Progman" || rc == "WorkerW") return p;
            }
        return null;
    }

    static bool Exposed(POINT p)
    {
        var rc = N.ClassOf(N.GetAncestor(N.WindowFromPoint(p), N.GA_ROOT));
        return rc == "Progman" || rc == "WorkerW";
    }

    /// W0.2: is the desktop moving? Two captures 1 s apart; per monitor, the share of pixels that
    /// changed, and how much host colour shows (host colour = the web view isn't drawing).
    public static unsafe int Motion(Opts o)
    {
        var tag = o.Get("tag") ?? "motion";
        var hostColor = ColorTranslator.FromHtml("#" + (o.Get("color") ?? "FF00C8"));
        using var a = Capture(tag + "-a");
        Thread.Sleep(1000);
        using var b = Capture(tag + "-b");
        var ok = true;
        foreach (var m in MonitorInfo.All())
        {
            var origin = (POINT)a.Tag!;
            var area = Rectangle.Intersect(new Rectangle(m.Rect.L - origin.X, m.Rect.T - origin.Y, m.Rect.W, m.Rect.H), new Rectangle(0, 0, a.Width, a.Height));
            var da = a.LockBits(area, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            var db = b.LockBits(area, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            long changed = 0;
            for (var y = 0; y < area.Height; y++)
            {
                byte* ra = (byte*)da.Scan0 + y * da.Stride, rb = (byte*)db.Scan0 + y * db.Stride;
                for (var x = 0; x < area.Width * 4; x += 4)
                    if (Math.Abs(ra[x] - rb[x]) > 16 || Math.Abs(ra[x + 1] - rb[x + 1]) > 16 || Math.Abs(ra[x + 2] - rb[x + 2]) > 16) changed++;
            }
            a.UnlockBits(da); b.UnlockBits(db);
            var moved = (double)changed / ((long)area.Width * area.Height);
            var magenta = Fraction(b, m.Rect, hostColor);
            var exposed = BarePoint(DesktopTree.Snapshot(), [m], null) != null;
            Log.Line($"motion {m.Device}: {moved:P2} of pixels changed in 1 s, host colour {magenta:P1}, desktop exposed={exposed}");
            ok &= moved > 0.001 && magenta < 0.05;
        }
        return ok ? 0 : 1;
    }

    /// The right-click test alone, with or without a host: the control for check 9.
    public static int MenuOnly()
    {
        var s = DesktopTree.Snapshot();
        var p = BarePoint(s, MonitorInfo.All(), Icons(s));
        if (p == null) { Log.Line("menu: no bare point"); return 1; }
        var ok = ContextMenu(p.Value, N.PidOf(s.Progman));
        Log.Line($"menu: {(ok ? "opened" : "did not open")} at {p}");
        return ok ? 0 : 1;
    }

    /// Win+D: show the desktop (again: bring the windows back).
    public static int ShowDesktop()
    {
        Send(new INPUT { type = N.INPUT_KEYBOARD, u = new InputUnion { ki = new KEYBDINPUT { wVk = 0x5B } } },
             new INPUT { type = N.INPUT_KEYBOARD, u = new InputUnion { ki = new KEYBDINPUT { wVk = 0x44 } } },
             new INPUT { type = N.INPUT_KEYBOARD, u = new InputUnion { ki = new KEYBDINPUT { wVk = 0x44, dwFlags = N.KEYEVENTF_KEYUP } } },
             new INPUT { type = N.INPUT_KEYBOARD, u = new InputUnion { ki = new KEYBDINPUT { wVk = 0x5B, dwFlags = N.KEYEVENTF_KEYUP } } });
        Thread.Sleep(800);
        Log.Line("show-desktop: sent Win+D");
        return 0;
    }

    static HashSet<IntPtr> VisibleTopLevel(int pid)
    {
        var set = new HashSet<IntPtr>();
        N.EnumWindows((h, _) => { if (N.IsWindowVisible(h) && (pid == 0 || N.PidOf(h) == pid)) set.Add(h); return true; }, IntPtr.Zero);
        return set;
    }

    /// Right-click bare desktop: Explorer must open a menu. Windows 11's is a XAML popup, not
    /// always #32768, so any new visible top-level Explorer window counts; its class is logged.
    static bool ContextMenu(POINT p, int explorerPid)
    {
        N.GetCursorPos(out var saved);
        var before = VisibleTopLevel(0);
        N.SetCursorPos(p.X, p.Y);
        Thread.Sleep(150);
        Send(new INPUT { type = N.INPUT_MOUSE, u = new InputUnion { mi = new MOUSEINPUT { dwFlags = N.MOUSEEVENTF_RIGHTDOWN } } },
             new INPUT { type = N.INPUT_MOUSE, u = new InputUnion { mi = new MOUSEINPUT { dwFlags = N.MOUSEEVENTF_RIGHTUP } } });
        var opened = new List<IntPtr>();
        var sw = System.Diagnostics.Stopwatch.StartNew();
        for (var i = 0; i < 50 && !opened.Any(w => N.PidOf(w) == explorerPid); i++)
        {
            Thread.Sleep(100);
            opened = VisibleTopLevel(0).Except(before).ToList();
        }
        foreach (var w in opened) Log.Line($"menu window: {N.ClassOf(w)} rect={N.RectOf(w)} explorer={N.PidOf(w) == explorerPid} pid={N.PidOf(w)}");
        Log.Line($"menu after {sw.ElapsedMilliseconds} ms");
        var fg = N.GetForegroundWindow();
        Log.Line($"foreground after right-click: {N.ClassOf(fg)} pid={N.PidOf(fg)} explorer={explorerPid} '{N.TextOf(fg)}'");
        Capture("menu-open").Dispose();
        var ok = opened.Any(w => N.PidOf(w) == explorerPid);   // before Esc destroys them
        Send(new INPUT { type = N.INPUT_KEYBOARD, u = new InputUnion { ki = new KEYBDINPUT { wVk = 0x1B } } },
             new INPUT { type = N.INPUT_KEYBOARD, u = new InputUnion { ki = new KEYBDINPUT { wVk = 0x1B, dwFlags = N.KEYEVENTF_KEYUP } } });
        Thread.Sleep(300);
        N.SetCursorPos(saved.X, saved.Y);
        var closed = opened.All(w => !N.IsWindowVisible(w));
        Log.Line($"menu closed by Esc: {closed}");
        return ok;
    }

    static void Send(params INPUT[] inputs) => N.SendInput((uint)inputs.Length, inputs, Marshal.SizeOf<INPUT>());
}
