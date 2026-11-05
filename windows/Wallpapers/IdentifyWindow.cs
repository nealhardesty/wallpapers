using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

namespace Wallpapers;

/// Identify Monitors (SPEC §10.25.10): each monitor's number, big, with its name under it, on a
/// translucent dark panel for 3 s. It never takes focus, lets every click through, and stays out of
/// the taskbar and Alt-Tab. It's sized in physical px from its own monitor's height (the process is
/// PerMonitorV2), so a 4K screen at 250% and a 1080p one beside it look alike. Coverage ignores it
/// (it's ours, and click-through).
sealed class IdentifyWindow : Form
{
    const int WM_DPICHANGED = 0x02E0, WM_MOUSEACTIVATE = 0x21, MA_NOACTIVATE = 3;
    static readonly List<IdentifyWindow> open = [];

    readonly GraphicsPath number = new(), name = new();
    readonly System.Windows.Forms.Timer timer = new() { Interval = 3000 };
    readonly Rectangle place;

    /// One per monitor, centred on its rect (the monitor, or a fake host's place). Asking again
    /// starts the 3 s over.
    public static void ShowAll(IReadOnlyList<(SurfacePlan Plan, Rect Screen)> where)
    {
        foreach (var w in open.ToList()) w.Close();
        foreach (var (plan, screen) in where)
        {
            var w = new IdentifyWindow(plan, screen);
            open.Add(w);
            w.Show();
        }
        Log.Info($"identify: {string.Join(", ", where.Select(w => $"{w.Plan.Number} {w.Plan.Name} at {w.Screen.Left},{w.Screen.Top} {w.Screen.Width}x{w.Screen.Height}"))}");
    }

    IdentifyWindow(SurfacePlan plan, Rect screen)
    {
        // The digit's own height is about a third of the monitor's (Segoe UI's figures are ~0.7 em).
        var h = screen.Height;
        using var family = new FontFamily("Segoe UI");
        number.AddString(plan.Number.ToString(System.Globalization.CultureInfo.InvariantCulture), family, (int)FontStyle.Bold, h / 3f / 0.7f, Point.Empty, StringFormat.GenericTypographic);
        name.AddString(plan.Name + (plan.Primary ? " (main)" : ""), family, (int)FontStyle.Regular, Math.Max(12, h / 28f), Point.Empty, StringFormat.GenericTypographic);

        // Tight boxes from the glyphs themselves, then the panel around them.
        var nb = number.GetBounds();
        var tb = name.GetBounds();
        var pad = Math.Max(8, h / 24);
        var gap = pad / 2;
        var width = (int)Math.Ceiling(Math.Max(nb.Width, tb.Width)) + 2 * pad;
        var height = (int)Math.Ceiling(nb.Height + gap + tb.Height) + 2 * pad;
        Centre(number, nb, width, pad);
        Centre(name, tb, width, pad + (int)Math.Ceiling(nb.Height) + gap);

        place = new Rectangle(screen.Left + (screen.Width - width) / 2, screen.Top + (screen.Height - height) / 2, width, height);
        FormBorderStyle = FormBorderStyle.None;
        AutoScaleMode = AutoScaleMode.None;
        StartPosition = FormStartPosition.Manual;
        ShowInTaskbar = false;
        BackColor = Color.FromArgb(20, 22, 28);
        Opacity = 0.85;
        DoubleBuffered = true;
        Bounds = place;
        Text = $"Wallpapers · Monitor {plan.Number}";
        timer.Tick += (_, _) => Close();
        timer.Start();
    }

    static void Centre(GraphicsPath path, RectangleF bounds, int width, int top)
    {
        using var m = new Matrix();
        m.Translate((width - bounds.Width) / 2 - bounds.Left, top - bounds.Top);
        path.Transform(m);
    }

    protected override bool ShowWithoutActivation => true;

    protected override CreateParams CreateParams
    {
        get
        {
            var cp = base.CreateParams;
            cp.ExStyle |= (int)(N.WS_EX_NOACTIVATE | N.WS_EX_TRANSPARENT | N.WS_EX_LAYERED | N.WS_EX_TOOLWINDOW | N.WS_EX_TOPMOST);
            return cp;
        }
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        // Exactly its physical rect, whatever WinForms made of it on a monitor of another DPI.
        N.SetWindowPos(Handle, N.HWND_TOPMOST, place.Left, place.Top, place.Width, place.Height, N.SWP_NOACTIVATE);
    }

    protected override void WndProc(ref Message m)
    {
        switch (m.Msg)
        {
            case WM_DPICHANGED: return;   // sized for its monitor already: no rescale
            case WM_MOUSEACTIVATE: m.Result = MA_NOACTIVATE; return;
        }
        base.WndProc(ref m);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.FillPath(Brushes.White, number);
        using var grey = new SolidBrush(Color.FromArgb(200, 204, 212));
        g.FillPath(grey, name);
    }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        open.Remove(this);
        timer.Dispose();
        number.Dispose();
        name.Dispose();
        base.OnFormClosed(e);
    }
}
