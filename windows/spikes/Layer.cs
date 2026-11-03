using System.Drawing;
using System.Windows.Forms;

namespace Spike;

/// `layer`: attach one host per monitor in a candidate position and keep it there (plan Tasks 2–3).
public static class Layer
{
    public static readonly List<Host> Hosts = [];
    static string mode = "raised";
    static bool layered, noRedir;
    static bool cleaned;
    static TreeSnapshot snap = new();

    public static Color ColorFor(string m) => m switch
    {
        "raised" => ColorTranslator.FromHtml("#FF00C8"),
        "workerw" => ColorTranslator.FromHtml("#00C8FF"),
        "defview" => ColorTranslator.FromHtml("#C8FF00"),
        _ => ColorTranslator.FromHtml("#FFAA00"),
    };

    /// The parent and the window to insert after, per candidate (plan Task 2 step 2).
    public static (IntPtr parent, IntPtr after) Target(TreeSnapshot s, string m) => m switch
    {
        "raised" => (s.Progman, s.DefView),
        "workerw" => (s.WallpaperWorkerW, N.HWND_TOP),
        "defview" => (s.DefView, N.HWND_BOTTOM),
        _ => (IntPtr.Zero, IntPtr.Zero),
    };

    public static bool ZOk(Host h)
    {
        if (mode == "raised")
        {
            var kids = N.Children(snap.Progman);
            int iDef = kids.IndexOf(snap.DefView), iHost = kids.IndexOf(h.Handle), iWork = kids.IndexOf(snap.WallpaperWorkerW);
            return iDef >= 0 && iHost > iDef && (iWork < 0 || iHost < iWork);
        }
        if (mode == "defview") return N.GetWindow(h.Handle, N.GW_HWNDNEXT) == IntPtr.Zero;
        return true;
    }

    static bool Prepare()
    {
        var (s, sent, waited) = DesktopTree.EnsureLayer();
        snap = s;
        Log.Line($"layer layout={s.Layout} sent052C={sent} waited={waited}ms progman={N.Hex(s.Progman)} defview={N.Hex(s.DefView)} wallpaperWorkerW={N.Hex(s.WallpaperWorkerW)}");
        var (parent, _) = Target(s, mode);
        if (parent == IntPtr.Zero) { Log.Line($"no parent for mode {mode}"); return false; }
        return true;
    }

    public static int Run(Opts o)
    {
        DesktopTree.PrintEnvironment();
        if (!AttachAll(o)) return 1;
        return Loop(o.Int("seconds", 120), onTaskbarCreated: Reattach, onCheck: Watch, onTick: () => Hosts.ForEach(h => h.Tick()));
    }

    /// One host per monitor in the mode from --mode/--layered/--noredir (shared with `web`).
    public static bool AttachAll(Opts o)
    {
        mode = o.Get("mode") ?? "raised";
        layered = (o.Get("layered") ?? (mode == "workerw" ? "off" : "on")) == "on";
        noRedir = o.Has("noredir");
        if (!Prepare()) return false;
        var (parent, after) = Target(snap, mode);
        foreach (var m in MonitorInfo.All())
        {
            var h = new Host(m, mode, ColorFor(mode));
            if (h.Attach(parent, after, layered, noRedir)) Hosts.Add(h);
        }
        foreach (var h in Hosts) Log.Line($"z ok={ZOk(h)}");
        return Hosts.Count > 0;
    }

    /// The message loop shared by `layer` and `web`: a hidden top-level window for TaskbarCreated
    /// (message-only windows don't get broadcasts), a 5 s watch timer, a 1 s tick, a deadline and the stop event.
    public static int Loop(int seconds, Action onTaskbarCreated, Action onCheck, Action onTick, Action? onExit = null)
    {
        using var stop = new EventWaitHandle(false, EventResetMode.ManualReset, Shell.StopEvent);
        stop.Reset();
        var msg = new MessageWindow(onTaskbarCreated);
        var deadline = DateTime.Now.AddSeconds(seconds);
        var reason = "deadline";
        var ui = SynchronizationContext.Current ?? new WindowsFormsSynchronizationContext();

        Console.CancelKeyPress += (_, e) => { e.Cancel = true; ui.Post(_ => { reason = "ctrl-c"; Application.ExitThread(); }, null); };
        Application.ThreadException += (_, e) => { Log.Line($"ui exception {e.Exception}"); reason = "exception"; Application.ExitThread(); };
        AppDomain.CurrentDomain.ProcessExit += (_, _) => Cleanup("process-exit");

        var watch = new System.Windows.Forms.Timer { Interval = 5000 };
        watch.Tick += (_, _) => onCheck();
        var tick = new System.Windows.Forms.Timer { Interval = 1000 };
        tick.Tick += (_, _) => onTick();
        var poll = new System.Windows.Forms.Timer { Interval = 250 };
        poll.Tick += (_, _) =>
        {
            if (stop.WaitOne(0)) { reason = "stop"; Application.ExitThread(); }
            else if (DateTime.Now > deadline) Application.ExitThread();
        };
        watch.Start(); tick.Start(); poll.Start();
        Log.Line($"running {seconds}s (make win-spike ARGS=stop to end early)");
        Application.Run();
        onExit?.Invoke();
        Cleanup(reason);
        msg.DestroyHandle();
        return 0;
    }

    public static void Watch()
    {
        foreach (var h in Hosts.ToList())
        {
            if (!h.Alive) { Log.Line($"watch: host {N.Hex(h.Handle)} is gone"); continue; }
            if (!N.IsWindow(h.Parent))
            {
                Log.Line($"watch: parent {N.Hex(h.Parent)} is gone; reattaching");
                Reattach();
                return;
            }
            if (!ZOk(h))
            {
                snap = DesktopTree.Snapshot();
                if (!ZOk(h)) { h.Place(Target(snap, mode).after); Log.Line($"watch: z repaired, now ok={ZOk(h)}"); }
            }
        }
    }

    /// Explorer restarted (TaskbarCreated) or our parent died: find the new layer, then
    /// move surviving hosts into it, or recreate the dead ones.
    public static void Reattach()
    {
        foreach (var h in Hosts) Log.Line($"reattach: host {N.Hex(h.Handle)} alive={h.Alive} parentAlive={N.IsWindow(h.Parent)}");
        for (var i = 0; i < 20 && !Prepare(); i++) Thread.Sleep(500);
        var (parent, after) = Target(snap, mode);
        for (var i = 0; i < Hosts.Count; i++)
        {
            var h = Hosts[i];
            if (h.Alive)
            {
                h.Reparent(parent, after);
                Log.Line($"reattach: reparented {N.Hex(h.Handle)} into {N.Hex(parent)}, z ok={ZOk(h)}");
            }
            else
            {
                h.Destroy();
                var n = new Host(h.Monitor, mode, h.Color);
                if (n.Attach(parent, after, layered, noRedir)) Hosts[i] = n;
                Log.Line($"reattach: recreated {N.Hex(n.Handle)}, z ok={ZOk(n)}");
            }
        }
    }

    /// Idempotent: destroy every host, then make Explorer repaint its own picture.
    public static void Cleanup(string reason)
    {
        if (cleaned) return;
        cleaned = true;
        Log.Line($"cleanup reason={reason} hosts={Hosts.Count}");
        foreach (var h in Hosts) h.Destroy();
        Shell.Repaint();
    }

    sealed class MessageWindow : NativeWindow
    {
        readonly uint taskbarCreated = N.RegisterWindowMessage("TaskbarCreated");
        readonly Action onTaskbarCreated;

        public MessageWindow(Action a)
        {
            onTaskbarCreated = a;
            CreateHandle(new CreateParams { Caption = "WallpapersSpikeMsg", Style = unchecked((int)N.WS_POPUP), ExStyle = (int)N.WS_EX_TOOLWINDOW });
        }

        protected override void WndProc(ref Message m)
        {
            if (m.Msg == taskbarCreated)
            {
                Log.Line("taskbar-created");
                onTaskbarCreated();
            }
            base.WndProc(ref m);
        }
    }
}
