using System.Collections.Concurrent;
using System.Diagnostics;
using System.Windows.Automation;
using System.Windows.Forms;

namespace Spike;

/// W0.4 (plan Task 7, SPEC §10.25.8): watch the mouse with Raw Input (RIDEV_INPUTSINK: no hook,
/// delivered while unfocused), and tell bare desktop from icons and apps at each left click.
public sealed class Input : NativeWindow
{
    [StructLayout(LayoutKind.Sequential)]
    struct RAWINPUTDEVICE { public ushort UsagePage, Usage; public uint Flags; public IntPtr Target; }
    [DllImport("user32.dll", SetLastError = true)] static extern bool RegisterRawInputDevices(RAWINPUTDEVICE[] d, uint n, uint size);
    [DllImport("user32.dll")] static extern uint GetRawInputData(IntPtr h, uint cmd, IntPtr data, ref uint size, uint header);
    const int WM_INPUT = 0x00FF;
    const uint RID_INPUT = 0x10000003, RIDEV_INPUTSINK = 0x100, RIDEV_REMOVE = 0x1;
    const ushort LEFT_DOWN = 0x1, LEFT_UP = 0x2;
    const int HeaderSize = 24;   // RAWINPUTHEADER on x64: dwType, dwSize, hDevice, wParam

    public record Verdict(string Kind, string Wfp, string Root, string Uia, string Name, double UiaMs);

    /// Moves (physical px, at most every 16 ms) and left button changes, after classification.
    public event Action<POINT>? Moved;
    public event Action<int, bool, POINT, Verdict>? Button;   // seq, down, point, verdict

    readonly SynchronizationContext ui;
    readonly BlockingCollection<(int seq, bool down, POINT p)> queue = new();
    readonly Thread worker;
    long lastMove;
    int seq, moves, movesThisSecond;
    readonly Stopwatch clock = Stopwatch.StartNew();
    POINT lastPos;
    public int Moves => moves;

    public Input()
    {
        ui = SynchronizationContext.Current ?? new WindowsFormsSynchronizationContext();
        // A hidden top-level window: raw input with INPUTSINK needs a target window, not a hook.
        CreateHandle(new CreateParams { Caption = "WallpapersSpikeInput", Style = unchecked((int)N.WS_POPUP), ExStyle = (int)N.WS_EX_TOOLWINDOW });
        var dev = new[] { new RAWINPUTDEVICE { UsagePage = 1, Usage = 2, Flags = RIDEV_INPUTSINK, Target = Handle } };
        if (!RegisterRawInputDevices(dev, 1, (uint)Marshal.SizeOf<RAWINPUTDEVICE>()))
            throw new InvalidOperationException($"RegisterRawInputDevices {Marshal.GetLastWin32Error()}");
        Log.Line($"input: raw input registered (mouse, INPUTSINK) on {N.Hex(Handle)}");
        // UI Automation off the message thread: a UIA client on a UI thread can deadlock on our own windows.
        worker = new Thread(Work) { IsBackground = true, Name = "uia" };
        worker.SetApartmentState(ApartmentState.MTA);
        worker.Start();
    }

    public void Stop()
    {
        var dev = new[] { new RAWINPUTDEVICE { UsagePage = 1, Usage = 2, Flags = RIDEV_REMOVE, Target = IntPtr.Zero } };
        RegisterRawInputDevices(dev, 1, (uint)Marshal.SizeOf<RAWINPUTDEVICE>());
        queue.CompleteAdding();
        DestroyHandle();
    }

    /// Once a second: how many raw moves arrived, and where the cursor is.
    public void Report()
    {
        N.GetCursorPos(out var p);
        var fg = N.GetForegroundWindow();
        Log.Line($"input: moves/s={movesThisSecond} pos={p} fg={N.ClassOf(fg)} \"{N.TextOf(fg)}\"{(N.PidOf(fg) == Environment.ProcessId ? " (OURS)" : "")}");
        movesThisSecond = 0;
    }

    protected override unsafe void WndProc(ref Message m)
    {
        if (m.Msg == WM_INPUT)
        {
            uint size = 0;
            GetRawInputData(m.LParam, RID_INPUT, IntPtr.Zero, ref size, HeaderSize);
            var buf = stackalloc byte[(int)Math.Max(size, 64)];
            if (GetRawInputData(m.LParam, RID_INPUT, (IntPtr)buf, ref size, HeaderSize) != uint.MaxValue && *(uint*)buf == 0)   // RIM_TYPEMOUSE
            {
                var flags = *(ushort*)(buf + HeaderSize + 4);   // RAWMOUSE.usButtonFlags
                long dx = *(int*)(buf + HeaderSize + 12), dy = *(int*)(buf + HeaderSize + 16);
                N.GetCursorPos(out var p);
                if (dx != 0 || dy != 0 || p.X != lastPos.X || p.Y != lastPos.Y)
                {
                    moves++; movesThisSecond++;
                    lastPos = p;
                    var now = clock.ElapsedMilliseconds;
                    if (now - lastMove >= 16) { lastMove = now; Moved?.Invoke(p); }   // coalesce to ≤ 60/s
                }
                if ((flags & LEFT_DOWN) != 0) queue.Add((++seq, true, p));
                if ((flags & LEFT_UP) != 0) queue.Add((++seq, false, p));
            }
        }
        base.WndProc(ref m);
    }

    void Work()
    {
        foreach (var (s, down, p) in queue.GetConsumingEnumerable())
        {
            var v = Classify(p);
            Log.Line($"click #{s} {(down ? "down" : "up  ")} pos={p} wfp={v.Wfp} root={v.Root} uia={v.Uia} \"{v.Name}\" -> {v.Kind} uiaMs={v.UiaMs:F1}");
            ui.Post(_ => Button?.Invoke(s, down, p, v), null);
        }
    }

    static readonly HashSet<string> DesktopClasses = ["SysListView32", "SHELLDLL_DefView", "Progman", "WorkerW", Host.ClassName];

    /// §10.25.8: bare desktop = the window under the point is the desktop (or our host) and UI
    /// Automation's element there isn't a ListItem (an icon). Call off the UI thread.
    public static Verdict Classify(POINT p)
    {
        var h = N.WindowFromPoint(p);
        var cls = N.ClassOf(h);
        var root = N.ClassOf(N.GetAncestor(h, N.GA_ROOT));
        var sw = Stopwatch.StartNew();
        string uia = "?", name = "";
        try
        {
            var e = AutomationElement.FromPoint(new System.Windows.Point(p.X, p.Y));
            uia = e.Current.ControlType.ProgrammaticName.Replace("ControlType.", "");
            name = e.Current.Name ?? "";
            if (name.Length > 20) name = name[..20];
        }
        catch (Exception ex) { uia = "error:" + ex.GetType().Name; }
        var ms = sw.Elapsed.TotalMilliseconds;
        var desktop = DesktopClasses.Contains(cls);
        var kind = !desktop ? "other" : uia == "ListItem" ? "icon" : "bare";
        return new Verdict(kind, cls, root, uia, name, ms);
    }

    /// `input`: log moves and classified clicks for N seconds; `input --selftest`: classify every
    /// icon's centre (must be icon) and a grid of bare points (must be bare), no clicks needed.
    public static int Run(Opts o)
    {
        DesktopTree.PrintEnvironment();
        if (o.Has("selftest")) return SelfTest();
        var seconds = o.Int("seconds", 90);
        SynchronizationContext.SetSynchronizationContext(new WindowsFormsSynchronizationContext());
        var input = new Input();
        var counts = new Dictionary<string, int>();
        input.Button += (_, down, _, v) => { if (down) counts[v.Kind] = counts.GetValueOrDefault(v.Kind) + 1; };
        var report = new System.Windows.Forms.Timer { Interval = 1000 };
        report.Tick += (_, _) => input.Report();
        report.Start();
        var end = new System.Windows.Forms.Timer { Interval = seconds * 1000 };
        end.Tick += (_, _) => Application.ExitThread();
        end.Start();
        Log.Line($"input: listening {seconds}s");
        Application.Run();
        input.Stop();
        Log.Line($"input summary: moves={input.Moves} downs: {string.Join(" ", counts.Select(kv => $"{kv.Key}={kv.Value}"))}");
        return 0;
    }

    static string ProcessName(int pid) { try { using var p = Process.GetProcessById(pid); return p.ProcessName; } catch { return ""; } }

    static int SelfTest()
    {
        var verdicts = new List<(string want, Verdict v, POINT p)>();
        var t = new Thread(() =>
        {
            var s = DesktopTree.Snapshot();
            var items = AutomationElement.FromHandle(s.ListView).FindAll(TreeScope.Children,
                new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.ListItem));
            var icons = new List<RECT>();
            foreach (AutomationElement e in items)
            {
                var b = e.Current.BoundingRectangle;
                var r = new RECT { L = (int)b.Left, T = (int)b.Top, R = (int)b.Right, B = (int)b.Bottom };
                icons.Add(r);
                var c = new POINT((r.L + r.R) / 2, (r.T + r.B) / 2);
                verdicts.Add(("icon", Classify(c), c));
            }
            foreach (var m in MonitorInfo.All())
                for (var i = 0; i < 5; i++)
                    for (var j = 0; j < 4; j++)
                    {
                        var p = new POINT(m.Work.L + (2 * i + 1) * m.Work.W / 10, m.Work.T + (2 * j + 1) * m.Work.H / 8);
                        if (icons.Any(r => p.X >= r.L - 8 && p.X < r.R + 8 && p.Y >= r.T - 8 && p.Y < r.B + 8)) continue;
                        // Bare desktop to the eye: the desktop's own windows, or WebView2's alpha-0 input
                        // overlay sitting over them (which the classifier must not be fooled by).
                        var rootH = N.GetAncestor(N.WindowFromPoint(p), N.GA_ROOT);
                        var root = N.ClassOf(rootH);
                        var overlay = root == "Chrome_WidgetWin_1" && ProcessName(N.PidOf(rootH)) == "msedgewebview2";
                        verdicts.Add((root is "Progman" or "WorkerW" || overlay ? "bare" : "other-or-overlay", Classify(p), p));
                    }
        });
        t.SetApartmentState(ApartmentState.MTA);
        t.Start();
        t.Join();
        var bad = 0;
        foreach (var (want, v, p) in verdicts)
        {
            var ok = want == v.Kind || (want == "other-or-overlay" && v.Kind == "other");
            if (!ok) bad++;
            Log.Line($"{(ok ? "PASS" : "FAIL")}  classify {p} want={want} got={v.Kind} wfp={v.Wfp} root={v.Root} uia={v.Uia} \"{v.Name}\" {v.UiaMs:F1}ms");
        }
        var ms = verdicts.Select(x => x.v.UiaMs).OrderBy(x => x).ToList();
        Log.Line($"selftest: {verdicts.Count - bad} of {verdicts.Count} right; uia median={ms[ms.Count / 2]:F1}ms p95={ms[(int)(ms.Count * 0.95)]:F1}ms max={ms[^1]:F1}ms");
        return bad == 0 ? 0 : 1;
    }
}
