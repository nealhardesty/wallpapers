using System.Diagnostics;
using System.Windows.Forms;

namespace Wallpapers;

/// Explorer's wallpaper layer and our host windows in it (SPEC §10.25.5; W0.1 in §10.25.21).
/// Hosts are plain windows of class WallpapersHost; a Surface draws into each through DirectComposition.
sealed class DesktopLayer : IDisposable
{
    public const string HostClass = "WallpapersHost";
    static bool registered;

    readonly Action<string> log;
    readonly MessageWindow messages;

    public Shape Shape { get; private set; } = new(ShapeKind.NoShell, 0, 0, 0);
    /// The escape hatch (tray → Troubleshooting): hosts above the icons, for a Windows build that has no layer.
    public bool DrawAboveIcons { get; set; }
    public event Action? ShellRestarted;
    public event Action? DisplayChanged;
    public event Action? EndSession;

    public DesktopLayer(Action<string> log)
    {
        this.log = log;
        messages = new MessageWindow(this);
    }

    /// Finds (or asks Explorer to build) the wallpaper layer. True when hosts can be created.
    public bool Prepare()
    {
        var shape = DesktopShape.Detect(Snapshot(), messageSent: false);
        var waited = 0;
        if (DesktopShape.NeedsLayerMessage(shape))
        {
            // 24H2+ needs wParam 0xD, lParam 1; with 0, 0 the shell silently does nothing (§10.25.3).
            N.SendMessageTimeout((IntPtr)shape.Progman, 0x052C, 0xD, 1, N.SMTO_NORMAL, 1000, out _);
            var clock = Stopwatch.StartNew();
            do
            {
                Thread.Sleep(100);
                shape = DesktopShape.Detect(Snapshot(), messageSent: true);
            } while (shape.Layer == 0 && shape.Kind != ShapeKind.NoShell && clock.ElapsedMilliseconds < 2000);
            waited = (int)clock.ElapsedMilliseconds;
        }
        Shape = shape;
        log($"layer: {shape.Kind} progman={shape.Progman:X} defview={shape.DefView:X} layer={shape.Layer:X}{(waited > 0 ? $" (sent 0x052C, waited {waited} ms)" : "")}{(DrawAboveIcons ? " draw-above-icons" : "")}");
        return DrawAboveIcons ? shape.Progman != 0 : DesktopShape.AttachTarget(shape).Parent != 0;
    }

    static void Register()
    {
        if (registered) return;
        var wc = new N.WNDCLASSEX
        {
            cbSize = Marshal.SizeOf<N.WNDCLASSEX>(),
            lpfnWndProc = NativeLibrary.GetExport(NativeLibrary.Load("user32.dll"), "DefWindowProcW"),
            hInstance = N.GetModuleHandle(null),
            hbrBackground = N.GetStockObject(N.BLACK_BRUSH),   // black until the page's first frame, like the web view
            lpszClassName = HostClass,
        };
        if (N.RegisterClassEx(ref wc) == 0) throw new InvalidOperationException($"RegisterClassEx failed: {Marshal.GetLastWin32Error()}");
        registered = true;
    }

    public IntPtr CreateHost(SurfacePlan plan)
    {
        Register();
        IntPtr host;
        if (DrawAboveIcons)
        {
            // A top-level window just above Progman: over the icons (they can't be seen), click-through to them.
            host = N.CreateWindowEx(N.WS_EX_NOACTIVATE | N.WS_EX_TOOLWINDOW | N.WS_EX_LAYERED | N.WS_EX_TRANSPARENT, HostClass, "Wallpapers",
                N.WS_POPUP | N.WS_VISIBLE, plan.Bounds.Left, plan.Bounds.Top, plan.Bounds.Width, plan.Bounds.Height,
                IntPtr.Zero, IntPtr.Zero, N.GetModuleHandle(null), IntPtr.Zero);
            if (host == IntPtr.Zero) throw new InvalidOperationException($"CreateWindowEx (above icons) failed: {Marshal.GetLastWin32Error()}");
            N.SetLayeredWindowAttributes(host, 0, 255, N.LWA_ALPHA);
            PlaceAboveProgman(host);
        }
        else
        {
            var (parent, after) = DesktopShape.AttachTarget(Shape);
            var r = InClient((IntPtr)parent, plan.Bounds);
            host = N.CreateWindowEx(N.WS_EX_LAYERED | N.WS_EX_NOACTIVATE, HostClass, "Wallpapers",
                N.WS_CHILD | N.WS_VISIBLE | N.WS_CLIPCHILDREN | N.WS_CLIPSIBLINGS, r.L, r.T, r.R - r.L, r.B - r.T,
                (IntPtr)parent, IntPtr.Zero, N.GetModuleHandle(null), IntPtr.Zero);
            if (host == IntPtr.Zero) throw new InvalidOperationException($"CreateWindowEx in {parent:X} failed: {Marshal.GetLastWin32Error()}");
            N.SetLayeredWindowAttributes(host, 0, 255, N.LWA_ALPHA);   // layered children need alpha 255 to draw
            N.SetWindowPos(host, (IntPtr)after, 0, 0, 0, 0, N.SWP_NOMOVE | N.SWP_NOSIZE | N.SWP_NOACTIVATE);
        }
        log($"host {host:X} for {plan.Device} at {plan.Bounds.Left},{plan.Bounds.Top} {plan.Bounds.Width}x{plan.Bounds.Height} scale {plan.Scale} insets {plan.Insets.ToParam()}{(DrawAboveIcons ? " (above icons)" : "")}");
        return host;
    }

    void PlaceAboveProgman(IntPtr host)
    {
        var above = N.GetWindow((IntPtr)Shape.Progman, N.GW_HWNDPREV);
        if (above == host) return;
        N.SetWindowPos(host, above == IntPtr.Zero ? N.HWND_TOP : above, 0, 0, 0, 0, N.SWP_NOMOVE | N.SWP_NOSIZE | N.SWP_NOACTIVATE);
    }

    static N.RECT InClient(IntPtr parent, Rect screen)
    {
        var r = new N.RECT { L = screen.Left, T = screen.Top, R = screen.Right, B = screen.Bottom };
        N.MapWindowPoints(IntPtr.Zero, parent, ref r, 2);   // the virtual screen's origin can be negative
        return r;
    }

    /// The z-order check and repair (every 5 s and after display changes). True when right, now or after repair.
    public bool CheckAndRepair(IntPtr host)
    {
        if (DrawAboveIcons) { PlaceAboveProgman(host); return true; }
        var (parent, after) = DesktopShape.AttachTarget(Shape);
        bool Ok() => DesktopShape.ZOk(Shape, N.Children((IntPtr)parent).Select(h => (long)h).ToList(), host);
        if (Ok()) return true;
        N.SetWindowPos(host, (IntPtr)after, 0, 0, 0, 0, N.SWP_NOMOVE | N.SWP_NOSIZE | N.SWP_NOACTIVATE);
        var fixedNow = Ok();
        log($"z-order of {host:X} was wrong; repaired={fixedNow}");
        return fixedNow;
    }

    /// The layer's parent window still exists (it dies with Explorer).
    public bool ParentAlive => DrawAboveIcons ? N.IsWindow((IntPtr)Shape.Progman) : N.IsWindow((IntPtr)DesktopShape.AttachTarget(Shape).Parent);

    public void DestroyHost(IntPtr host)
    {
        if (N.IsWindow(host)) N.DestroyWindow(host);
    }

    /// Progman, every top-level WorkerW, and all their descendants.
    public static List<WindowNode> Snapshot()
    {
        var nodes = new List<WindowNode>();
        void Walk(IntPtr h, int z)
        {
            nodes.Add(new WindowNode((long)h, (long)N.GetParent(h), N.ClassOf(h), N.PidOf(h), N.IsWindowVisible(h), N.RectOf(h), z));
            var i = 0;
            foreach (var child in N.Children(h)) Walk(child, i++);
        }
        var progman = N.FindWindow("Progman", null);
        if (progman != IntPtr.Zero) Walk(progman, 0);
        foreach (var w in N.TopLevel("WorkerW")) Walk(w, 0);
        return nodes;
    }

    /// The same tree with handles and pids replaced by small ordinals: publishable as a test fixture.
    public static List<WindowNode> Anonymised(List<WindowNode> tree)
    {
        var handles = new Dictionary<long, long> { [0] = 0 };
        var pids = new Dictionary<int, int>();
        long H(long h) => handles.TryGetValue(h, out var v) ? v : handles[h] = handles.Count;
        int P(int p) => pids.TryGetValue(p, out var v) ? v : pids[p] = 100 * (pids.Count + 1);
        foreach (var n in tree) H(n.Handle);
        return tree.Select(n => n with { Handle = H(n.Handle), Parent = H(n.Parent), Pid = P(n.Pid) }).ToList();
    }

    public void Dispose() => messages.DestroyHandle();

    /// A hidden top-level window: TaskbarCreated, display and session changes are broadcast to
    /// top-level windows only (an HWND_MESSAGE window never sees them).
    sealed class MessageWindow : NativeWindow
    {
        const int WM_DISPLAYCHANGE = 0x7E, WM_SETTINGCHANGE = 0x1A, WM_DPICHANGED = 0x2E0, WM_ENDSESSION = 0x16, SPI_SETWORKAREA = 0x2F;
        readonly DesktopLayer owner;
        readonly uint taskbarCreated = N.RegisterWindowMessage("TaskbarCreated");

        public MessageWindow(DesktopLayer owner)
        {
            this.owner = owner;
            CreateHandle(new CreateParams { Caption = "WallpapersMessages", Style = unchecked((int)N.WS_POPUP), ExStyle = (int)N.WS_EX_TOOLWINDOW });
        }

        protected override void WndProc(ref Message m)
        {
            if (m.Msg == taskbarCreated) { owner.log("shell: TaskbarCreated (Explorer started or restarted)"); owner.ShellRestarted?.Invoke(); }
            else if (m.Msg is WM_DISPLAYCHANGE or WM_DPICHANGED || (m.Msg == WM_SETTINGCHANGE && (int)m.WParam == SPI_SETWORKAREA)) owner.DisplayChanged?.Invoke();
            else if (m.Msg == WM_ENDSESSION && m.WParam != IntPtr.Zero) owner.EndSession?.Invoke();
            base.WndProc(ref m);
        }
    }
}
