namespace Wallpapers;

/// Which monitors other windows cover (SPEC §10.25.9): a monitor whose work area is at least 97% under
/// other windows hides its surface, 300 ms after it became covered, and shows it again at once. Read
/// after any win-event that can change it (coalesced over 150 ms) and every 2 s. Off for fake layouts.
sealed class Coverage : IDisposable
{
    static readonly (uint Min, uint Max)[] Events =
    [
        (N.EVENT_SYSTEM_FOREGROUND, N.EVENT_SYSTEM_FOREGROUND),
        (N.EVENT_SYSTEM_MOVESIZEEND, N.EVENT_SYSTEM_MOVESIZEEND),
        (N.EVENT_SYSTEM_MINIMIZESTART, N.EVENT_SYSTEM_MINIMIZEEND),
        (N.EVENT_OBJECT_SHOW, N.EVENT_OBJECT_HIDE),
        (N.EVENT_OBJECT_LOCATIONCHANGE, N.EVENT_OBJECT_LOCATIONCHANGE),
        (N.EVENT_OBJECT_CLOAKED, N.EVENT_OBJECT_UNCLOAKED),
    ];
    const int DebounceMs = 150;

    /// A key's surface was hidden or shown again.
    public event Action? Changed;

    readonly Func<IEnumerable<int>> helperPids;
    readonly int ownPid = Environment.ProcessId;
    readonly Dictionary<string, CoverageGate> gates = [];
    readonly List<IntPtr> hooks = [];
    readonly System.Windows.Forms.Timer poll = new() { Interval = 2000 };
    readonly System.Windows.Forms.Timer soon = new();
    /// Kept in a field: the hooks call it long after Start, and a collected delegate crashes the app.
    readonly N.WinEventProc onEvent;
    Func<IReadOnlyList<SurfacePlan>>? plans;
    long soonAt;

    /// helperPids: our WebView2 processes; their windows are ours too (the full-screen input overlay).
    public Coverage(Func<IEnumerable<int>> helperPids)
    {
        this.helperPids = helperPids;
        onEvent = (_, _, _, idObject, idChild, _, _) =>
        {
            // Location changes fire for every caret and cursor move: only whole windows count, and an
            // event only (re)arms a timer, never reads the windows.
            if (idObject == N.OBJID_WINDOW && idChild == N.CHILDID_SELF) Schedule(DebounceMs);
        };
        soon.Tick += (_, _) => Read();
        poll.Tick += (_, _) => Read();
    }

    public bool IsCovered(string key) => gates.TryGetValue(key, out var g) && g.Hidden;

    /// On the UI thread (out-of-context hooks call back on the thread that set them, through its messages).
    public void Start(Func<IReadOnlyList<SurfacePlan>> plans)
    {
        this.plans = plans;
        foreach (var (min, max) in Events)
        {
            var h = N.SetWinEventHook(min, max, IntPtr.Zero, onEvent, 0, 0, N.WINEVENT_OUTOFCONTEXT | N.WINEVENT_SKIPOWNPROCESS);
            if (h != IntPtr.Zero) hooks.Add(h);
            else Log.Warn($"coverage: can't hook events {min:X}-{max:X}; the 2 s poll still runs");
        }
        poll.Start();
        Read();
    }

    /// Read within `ms`: an earlier read already due is kept, so a burst of events costs one read.
    void Schedule(int ms)
    {
        var at = Environment.TickCount64 + ms;
        if (soon.Enabled && soonAt <= at) return;
        soon.Stop();
        soon.Interval = Math.Max(1, ms);
        soonAt = at;
        soon.Start();
    }

    void Read()
    {
        soon.Stop();
        if (plans == null) return;
        var now = Environment.TickCount64;
        var current = plans();
        var windows = Windows();
        var covered = CoverageMath.Covered(current, windows);
        var changed = false;
        foreach (var key in gates.Keys.Where(k => !covered.ContainsKey(k)).ToList())
        {
            changed |= gates[key].Hidden;   // a hidden monitor went away (or the layout went fake)
            gates.Remove(key);
        }
        foreach (var plan in current)
        {
            if (!gates.TryGetValue(plan.Key, out var gate)) gates[plan.Key] = gate = new CoverageGate();
            var was = gate.Hidden;
            if (gate.Update(covered[plan.Key], now) is { } again) Schedule(again);
            if (gate.Hidden == was) continue;
            changed = true;
            if (gate.Hidden)
            {
                var fraction = CoverageMath.Fraction(plan.Work, windows.Where(CoverageMath.IsCandidate).Select(w => w.Bounds));
                Log.Info($"coverage: {plan.Key} covered ({fraction * 100:0.0}%)");
            }
            else Log.Info($"coverage: {plan.Key} uncovered");
        }
        if (changed) Changed?.Invoke();
    }

    /// The visible top-level windows, as coverage sees them.
    List<WindowFacts> Windows()
    {
        HashSet<int> ours;
        // From a timer tick: a browser that's going away must not take the app with it.
        try { ours = helperPids().ToHashSet(); }
        catch (Exception e) when (e is COMException or InvalidOperationException) { ours = []; }
        ours.Add(ownPid);
        var list = new List<WindowFacts>();
        N.EnumWindows((h, _) =>
        {
            if (!N.IsWindowVisible(h)) return true;   // most top-level windows: skip the rest of the reads
            var ex = N.ExStyle(h);
            list.Add(new WindowFacts(N.ClassOf(h), Visible: true, N.IsIconic(h), N.IsCloaked(h), ours.Contains(N.PidOf(h)),
                (ex & N.WS_EX_TRANSPARENT) != 0, N.IsLayeredAlphaZero(h, ex), N.FrameOf(h)));
            return true;
        }, IntPtr.Zero);
        return list;
    }

    public void Dispose()
    {
        plans = null;
        poll.Stop();
        poll.Dispose();
        soon.Stop();
        soon.Dispose();
        foreach (var h in hooks) N.UnhookWinEvent(h);
        hooks.Clear();
    }
}
