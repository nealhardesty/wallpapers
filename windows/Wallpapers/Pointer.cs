using System.Collections.Concurrent;
using System.Diagnostics;
using System.Windows.Automation;
using System.Windows.Forms;

namespace Wallpapers;

/// The mouse, replayed into the wallpaper (SPEC §10.25.8). Raw Input (no hook) on a hidden top-level
/// window says when it moves and when the left button changes; the position is always GetCursorPos.
/// Moves go to the visible surface under the cursor, over app windows too, by SendMouseInput, at most
/// one per 16 ms. A left press is classified on a worker thread (the desktop's window, and only then
/// UI Automation: an icon or bare desktop); one on bare desktop goes in by script, through its release.
/// An elevated foreground starves raw input, so a 33 ms GetCursorPos poll carries the moves then
/// (never a click). Off, raw input unregistered, while no surface is visible or both toggles are off.
sealed class Pointer : IDisposable
{
    const int PollMs = 33, ReportMs = 60_000;

    /// Wallpaper Follows the Mouse: moves.
    public bool Follow { get; set; } = true;
    /// Clicks on the Desktop Play: presses on bare desktop.
    public bool Clicks { get; set; } = true;
    /// Raw input is registered and the poll runs.
    public bool Active { get; private set; }

    /// A left button change waiting for its verdict (Probe: ClassifyForTest's, nothing is pressed).
    readonly record struct Job(int Click, bool Down, int X, int Y, long T, HitKind? Kind, TaskCompletionSource<(HitKind, double)>? Probe = null);

    readonly Func<IReadOnlyList<Surface>> surfaces;
    readonly SynchronizationContext ui;
    readonly Stopwatch clock = Stopwatch.StartNew();
    readonly MoveThrottle throttle = new(16);
    readonly CursorSource source = new();
    readonly System.Windows.Forms.Timer poll = new() { Interval = PollMs };
    readonly System.Windows.Forms.Timer flush = new();
    readonly System.Windows.Forms.Timer report = new() { Interval = ReportMs };
    /// Downs and ups in arrival order, so a down's slow verdict can't be overtaken by its up.
    readonly BlockingCollection<Job> queue = new();
    /// Kept in fields: the window gets messages, and the worker runs, long after the constructor.
    readonly MessageWindow window;
    readonly Thread worker;
    GestureTracker tracker = new(DoubleClickRule.WindowsDefault);
    /// The surface the last move went to (it gets a Leave when the cursor goes elsewhere).
    string? over;
    (int X, int Y) last = (int.MinValue, int.MinValue);
    int clicks, rawMoves, pollMoves, sent;
    bool disposed;

    public Pointer(Func<IReadOnlyList<Surface>> surfaces)
    {
        this.surfaces = surfaces;
        ui = SynchronizationContext.Current ?? new WindowsFormsSynchronizationContext();
        window = new MessageWindow(this);
        poll.Tick += (_, _) => OnPoll();
        flush.Tick += (_, _) =>
        {
            flush.Stop();
            if (throttle.Flush(clock.ElapsedMilliseconds) is { } p) Deliver(p.X, p.Y);
        };
        report.Tick += (_, _) => Report();
        report.Start();
        // UI Automation off the message thread: a UIA client on a UI thread can deadlock on our own windows.
        worker = new Thread(Work) { IsBackground = true, Name = "pointer-uia" };
        worker.SetApartmentState(ApartmentState.MTA);
        worker.Start();
    }

    /// On when a toggle is on and some surface is visible; call after anything that changes either.
    public void Update()
    {
        if (disposed) return;
        var why = !Follow && !Clicks ? "both toggles off" : !surfaces().Any(s => s.Target.Visible) ? "no visible surface" : null;
        if (why == null && !Active) Start();
        else if (why != null && Active) Stop(why);
        if (!Clicks) EndGesture();
    }

    void Start()
    {
        var device = new N.RAWINPUTDEVICE { UsagePage = 1, Usage = 2, Flags = N.RIDEV_INPUTSINK, Target = window.Handle };
        if (!N.RegisterRawInputDevices([device], 1, (uint)Marshal.SizeOf<N.RAWINPUTDEVICE>()))
        {
            Log.Warn($"pointer: couldn't register raw input (error {Marshal.GetLastWin32Error()}); off");
            return;
        }
        // The system's double-click time and box, as they are now.
        var rule = new DoubleClickRule((int)N.GetDoubleClickTime(), N.GetSystemMetrics(N.SM_CXDOUBLECLK), N.GetSystemMetrics(N.SM_CYDOUBLECLK));
        tracker = new GestureTracker(rule);
        Active = true;
        poll.Start();
        Log.Info($"pointer: on (raw input registered, double-click {rule.TimeMs} ms {rule.Width}x{rule.Height})");
    }

    void Stop(string why)
    {
        Active = false;
        Unregister();
        poll.Stop();
        flush.Stop();
        throttle.Flush(clock.ElapsedMilliseconds);
        EndGesture();
        if (over != null) SurfaceFor(over)?.SendLeave();
        over = null;
        Log.Info($"pointer: off ({why})");
    }

    static void Unregister()
    {
        var device = new N.RAWINPUTDEVICE { UsagePage = 1, Usage = 2, Flags = N.RIDEV_REMOVE, Target = IntPtr.Zero };
        N.RegisterRawInputDevices([device], 1, (uint)Marshal.SizeOf<N.RAWINPUTDEVICE>());
    }

    /// A gesture in flight gets its release where the cursor is: a page never keeps a press with no up.
    void EndGesture()
    {
        if (tracker.Pressed == null) return;
        N.GetCursorPos(out var p);
        Release(tracker.Up(p.X, p.Y, clock.ElapsedMilliseconds), clicks, "ended");
    }

    Surface? SurfaceFor(string key) => surfaces().FirstOrDefault(s => s.Plan.Key == key);

    // ---- Moves ------------------------------------------------------------------------------

    void OnRaw(ushort buttons)
    {
        if (!Active) return;
        var now = clock.ElapsedMilliseconds;
        N.GetCursorPos(out var p);
        source.Raw(p.X, p.Y, now);
        // The position, not lLastX/Y: Remote Desktop's mouse is absolute, so those aren't deltas there.
        if ((p.X, p.Y) != last)
        {
            rawMoves++;
            Move(p.X, p.Y, now);
        }
        if (!Clicks) return;
        if ((buttons & N.RI_MOUSE_LEFT_BUTTON_DOWN) != 0) queue.Add(new Job(++clicks, true, p.X, p.Y, now, null));
        if ((buttons & N.RI_MOUSE_LEFT_BUTTON_UP) != 0) queue.Add(new Job(clicks, false, p.X, p.Y, now, null));
    }

    void OnPoll()
    {
        N.GetCursorPos(out var p);
        var now = clock.ElapsedMilliseconds;
        if (!source.UsePoll(p.X, p.Y, now)) return;
        pollMoves++;
        Move(p.X, p.Y, now);
    }

    void Move(int x, int y, long now)
    {
        last = (x, y);
        // A drag's moves belong to its gesture even with Follow off.
        if (!Follow && tracker.Pressed == null) return;
        if (throttle.Offer(x, y, now) is { } p) { flush.Stop(); Deliver(p.X, p.Y); }
        else if (!flush.Enabled && throttle.DueInMs is { } due)
        {
            flush.Interval = Math.Max(1, due);
            flush.Start();
        }
    }

    void Deliver(int x, int y)
    {
        if (!Active) return;
        // While a gesture is in flight its surface gets the moves, even off it.
        if (tracker.Move(x, y) is { } drag)
        {
            if (SurfaceFor(drag.Key) is not { } pressed) return;
            if (over != null && over != drag.Key) SurfaceFor(over)?.SendLeave();
            over = drag.Key;
            pressed.SendMove(drag.At.LocalX, drag.At.LocalY, leftDown: true);
            sent++;
            return;
        }
        if (!Follow) return;
        var all = surfaces();
        var target = PointerMap.Find(all.Select(s => s.Target).ToList(), x, y);
        if (over != null && over != target?.Key) SurfaceFor(over)?.SendLeave();
        over = target?.Key;
        if (target == null || all.FirstOrDefault(s => s.Plan.Key == target.Key) is not { } surface) return;
        var hit = PointerMap.Into(target, x, y);
        surface.SendMove(hit.LocalX, hit.LocalY, leftDown: false);
        sent++;
    }

    void Report()
    {
        if (rawMoves + pollMoves + sent > 0)
            Log.Info($"pointer: moves/s raw={rawMoves * 1000.0 / ReportMs:0.#} poll={pollMoves * 1000.0 / ReportMs:0.#} sent={sent * 1000.0 / ReportMs:0.#}");
        rawMoves = pollMoves = sent = 0;
    }

    // ---- Presses ----------------------------------------------------------------------------

    /// The worker: classifies each down (the up just keeps its place in line) and hands it back to the UI thread.
    void Work()
    {
        foreach (var job in queue.GetConsumingEnumerable())
        {
            if (job.Probe is { } probe) { probe.TrySetResult(Classify(job.X, job.Y)); continue; }
            var (kind, ms) = !job.Down ? (HitKind.Other, 0.0) : job.Kind is { } fed ? (fed, 0.0) : Classify(job.X, job.Y);
            ui.Post(_ => { if (job.Down) OnDown(job, kind, ms); else OnUp(job); }, null);
        }
    }

    /// On the worker (MTA). Bare desktop is one of the desktop's windows (or our host) under the point,
    /// and there UI Automation's element isn't a list item (an icon). A UIA failure there counts as bare.
    static (HitKind Kind, double UiaMs) Classify(int x, int y)
    {
        var cls = N.ClassOf(N.WindowFromPoint(new N.POINT { X = x, Y = y }));
        if (!HitTest.IsDesktop(cls)) return (HitKind.Other, 0);
        var clock = Stopwatch.StartNew();
        bool? listItem = null;
        // Anything UIA throws (an element gone, a COM failure, a timeout) means "don't know": never the app's end.
        try { listItem = AutomationElement.FromPoint(new System.Windows.Point(x, y)).Current.ControlType == ControlType.ListItem; }
        catch (Exception e) { Log.Debug($"pointer: UI Automation at ({x},{y}) failed ({e.GetType().Name}: {e.Message}); bare"); }
        return (HitTest.Kind(cls, listItem), clock.Elapsed.TotalMilliseconds);
    }

    void OnDown(Job job, HitKind kind, double uiaMs)
    {
        if (disposed || !Active || !Clicks) return;
        // A missed up (it went to an elevated window): the pressed page gets its release first.
        if (tracker.Pressed != null) Release(tracker.Up(job.X, job.Y, job.T), job.Click - 1, "missed");
        var target = PointerMap.Find(surfaces().Select(s => s.Target).ToList(), job.X, job.Y);
        var press = tracker.Down(target, kind, job.X, job.Y, job.T);
        var verdict = kind.ToString().ToLowerInvariant();
        var uia = uiaMs > 0 ? $" uia {uiaMs:0} ms" : "";
        if (press == null)
        {
            Log.Debug($"pointer: click #{job.Click} down {verdict} ({(kind == HitKind.Bare ? "no visible surface" : "not forwarded")}){uia}");
            return;
        }
        Log.Debug($"pointer: click #{job.Click} down {verdict} → {press.Key} ({press.At.CssX:0},{press.At.CssY:0}){uia}");
        if (SurfaceFor(press.Key) is { } s) _ = s.SendPressAsync(true, press.At.CssX, press.At.CssY, false);
    }

    void OnUp(Job job)
    {
        if (disposed) return;
        Release(tracker.Up(job.X, job.Y, job.T), job.Click, null);
    }

    void Release(Release? r, int click, string? why)
    {
        if (r == null) return;
        Log.Debug($"pointer: click #{click} up → {r.Key} ({r.At.CssX:0},{r.At.CssY:0}){(r.DoubleClick ? " dblclick" : "")}{(why != null ? $" ({why})" : "")}");
        if (SurfaceFor(r.Key) is { } s) _ = s.SendPressAsync(false, r.At.CssX, r.At.CssY, r.DoubleClick);
    }

    // ---- For the self-test ------------------------------------------------------------------

    /// The same path as the mouse from the throttle and the tracker on, without Raw Input or UIA: a move
    /// (down null; kind ignored), or a left press or release whose verdict is `kind`. Nothing while off.
    internal void FeedForTest(bool? down, int x, int y, HitKind kind = HitKind.Bare)
    {
        if (!Active) return;
        var now = clock.ElapsedMilliseconds;
        if (down is not { } d) { Move(x, y, now); return; }
        if (!Clicks) return;
        queue.Add(d ? new Job(++clicks, true, x, y, now, kind) : new Job(clicks, false, x, y, now, null));
    }

    /// The real classifier, on the worker, at a real point (nothing is clicked).
    internal Task<(HitKind Kind, double UiaMs)> ClassifyForTest(int x, int y)
    {
        var probe = new TaskCompletionSource<(HitKind, double)>(TaskCreationOptions.RunContinuationsAsynchronously);
        queue.Add(new Job(0, false, x, y, 0, null, probe));
        return probe.Task;
    }

    public void Dispose()
    {
        if (disposed) return;
        disposed = true;
        if (Active) Unregister();
        Active = false;
        queue.CompleteAdding();
        poll.Dispose();
        flush.Dispose();
        report.Dispose();
        window.DestroyHandle();
    }

    /// A hidden top-level window: RIDEV_INPUTSINK needs a target window to deliver WM_INPUT to.
    sealed class MessageWindow : NativeWindow
    {
        readonly Pointer owner;

        public MessageWindow(Pointer owner)
        {
            this.owner = owner;
            CreateHandle(new CreateParams { Caption = "WallpapersPointer", Style = unchecked((int)N.WS_POPUP), ExStyle = (int)(N.WS_EX_TOOLWINDOW | N.WS_EX_NOACTIVATE) });
        }

        protected override unsafe void WndProc(ref Message m)
        {
            if (m.Msg == N.WM_INPUT)
            {
                // RAWINPUTHEADER then RAWMOUSE: usFlags, (pad), usButtonFlags at +4, usButtonData, ulRawButtons, lLastX, lLastY.
                const int size = N.RawInputHeaderSize + 24;
                var buf = stackalloc byte[size];
                var got = (uint)size;
                if (N.GetRawInputData(m.LParam, N.RID_INPUT, (IntPtr)buf, ref got, N.RawInputHeaderSize) != uint.MaxValue && *(uint*)buf == N.RIM_TYPEMOUSE)
                    owner.OnRaw(*(ushort*)(buf + N.RawInputHeaderSize + 4));
            }
            base.WndProc(ref m);   // DefWindowProc cleans up after WM_INPUT
        }
    }
}
