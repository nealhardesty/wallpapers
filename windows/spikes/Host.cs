using System.Drawing;
using System.Windows.Forms;

namespace Spike;

/// One host window per monitor, inside Explorer's desktop: a colour fill and a ticking clock
/// (a frozen clock in a screenshot means a stale frame). Plan Task 2.
public sealed class Host : NativeWindow
{
    public const string ClassName = "WallpapersSpikeHost";
    static bool registered;

    public readonly MonitorInfo Monitor;
    public readonly string Mode;
    public readonly Color Color;
    public IntPtr Parent { get; private set; }
    public bool Alive => Handle != IntPtr.Zero && N.IsWindow(Handle);

    public Host(MonitorInfo m, string mode, Color c) { Monitor = m; Mode = mode; Color = c; }

    static void Register()
    {
        if (registered) return;
        var wc = new WNDCLASSEX
        {
            cbSize = Marshal.SizeOf<WNDCLASSEX>(),
            lpfnWndProc = NativeLibrary.GetExport(NativeLibrary.Load("user32.dll"), "DefWindowProcW"),
            hInstance = N.GetModuleHandle(null),
            lpszClassName = ClassName,
        };
        if (N.RegisterClassEx(ref wc) == 0) throw new InvalidOperationException($"RegisterClassEx {Marshal.GetLastWin32Error()}");
        registered = true;
    }

    RECT InParent(IntPtr parent)
    {
        var r = Monitor.Rect;
        N.MapWindowPoints(IntPtr.Zero, parent, ref r, 2);
        return r;
    }

    public bool Attach(IntPtr parent, IntPtr insertAfter, bool layered, bool noRedirection = false)
    {
        Register();
        Parent = parent;
        var ex = N.WS_EX_NOACTIVATE | (layered ? N.WS_EX_LAYERED : 0) | (noRedirection ? N.WS_EX_NOREDIRECTIONBITMAP : 0);
        var style = N.WS_CHILD | N.WS_VISIBLE | N.WS_CLIPCHILDREN | N.WS_CLIPSIBLINGS;
        var r = InParent(parent);
        var title = $"spike:{Mode}:{Color.R:X2}{Color.G:X2}{Color.B:X2}";
        var h = N.CreateWindowEx(ex, ClassName, title, style, r.L, r.T, r.W, r.H, parent, IntPtr.Zero, N.GetModuleHandle(null), IntPtr.Zero);
        var via = "create";
        if (h == IntPtr.Zero)
        {
            Log.Line($"CreateWindowEx with parent {N.Hex(parent)} failed: {Marshal.GetLastWin32Error()}; trying top-level + SetParent");
            h = N.CreateWindowEx(ex | N.WS_EX_TOOLWINDOW, ClassName, title, N.WS_POPUP, Monitor.Rect.L, Monitor.Rect.T, Monitor.Rect.W, Monitor.Rect.H,
                IntPtr.Zero, IntPtr.Zero, N.GetModuleHandle(null), IntPtr.Zero);
            if (h == IntPtr.Zero) { Log.Line($"CreateWindowEx top-level failed: {Marshal.GetLastWin32Error()}"); return false; }
            N.SetWindowLongPtr(h, N.GWL_STYLE, (IntPtr)style);
            if (N.SetParent(h, parent) == IntPtr.Zero) Log.Line($"SetParent failed: {Marshal.GetLastWin32Error()}");
            via = "setparent";
        }
        AssignHandle(h);
        if (layered && !N.SetLayeredWindowAttributes(h, 0, 255, N.LWA_ALPHA))
            Log.Line($"SetLayeredWindowAttributes failed: {Marshal.GetLastWin32Error()}");
        Place(insertAfter);
        Log.Line($"host={N.Hex(h)} parent={N.Hex(parent)} {N.ClassOf(parent)} mode={Mode} layered={layered} noredir={noRedirection} via={via} rect={N.RectOf(h)}");
        return true;
    }

    public void Place(IntPtr insertAfter)
    {
        var r = InParent(Parent);
        if (!N.SetWindowPos(Handle, insertAfter, r.L, r.T, r.W, r.H, N.SWP_NOACTIVATE | N.SWP_SHOWWINDOW))
            Log.Line($"SetWindowPos failed: {Marshal.GetLastWin32Error()}");
    }

    /// After an Explorer restart, if the window survived: move it into the new layer.
    public void Reparent(IntPtr parent, IntPtr insertAfter)
    {
        if (N.SetParent(Handle, parent) == IntPtr.Zero) Log.Line($"SetParent failed: {Marshal.GetLastWin32Error()}");
        Parent = parent;
        Place(insertAfter);
    }

    public void Tick() { if (Alive) N.InvalidateRect(Handle, IntPtr.Zero, false); }

    public void Destroy()
    {
        var h = Handle;
        if (h == IntPtr.Zero) return;
        ReleaseHandle();
        if (N.IsWindow(h)) N.DestroyWindow(h);
    }

    protected override void WndProc(ref Message m)
    {
        switch (m.Msg)
        {
            case N.WM_ERASEBKGND:
                m.Result = 1;
                return;
            case N.WM_MOUSEACTIVATE:
                m.Result = N.MA_NOACTIVATE;
                return;
            case N.WM_PAINT:
                var hdc = N.BeginPaint(m.HWnd, out var ps);
                N.GetClientRect(m.HWnd, out var rc);
                using (var g = Graphics.FromHdc(hdc))
                using (var brush = new SolidBrush(Color))
                using (var font = new Font("Segoe UI", 48, FontStyle.Bold, GraphicsUnit.Pixel))
                {
                    g.FillRectangle(brush, 0, 0, rc.W, rc.H);
                    var text = $"W0.1 {Mode}  {DateTime.Now:HH:mm:ss}";
                    var size = g.MeasureString(text, font);
                    g.DrawString(text, font, Brushes.White, (rc.W - size.Width) / 2, (rc.H - size.Height) / 2);
                }
                N.EndPaint(m.HWnd, ref ps);
                m.Result = IntPtr.Zero;
                return;
        }
        base.WndProc(ref m);
    }
}
