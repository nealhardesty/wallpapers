using System.Drawing;
using System.Windows.Forms;

namespace Wallpapers;

/// The screen saver's options (SPEC §10.25.12): what Windows' Settings… button (/c) opens, the tray's
/// Screen Saver menu as a small dialog. Every control applies at once through SaverControl; Close only
/// closes. One window: asking again brings it forward.
sealed class SaverOptionsWindow : Form
{
    readonly App app;
    readonly CheckBox use = new() { Text = "&Use Wallpapers as the screen saver", AutoSize = true, AutoCheck = false };
    readonly Label whyNot = new() { AutoSize = true, ForeColor = SystemColors.GrayText };
    readonly ComboBox startAfter = Combo(), wallpaper = Combo(), changeEvery = Combo();
    readonly RadioButton same = Radio("&Same as the desktop"), different = Radio("A &different one each time"), one = Radio("&One wallpaper:");
    readonly CheckBox clock = new() { Text = "Show a &clock", AutoSize = true };
    readonly Button preview = Button("&Preview"), windows = Button("&Windows Screen Saver Settings…"), close = Button("Close");
    /// Until the tray knows the catalog, the wallpaper list says "Loading…" and this looks again.
    readonly System.Windows.Forms.Timer waitForCatalog = new() { Interval = 1000 };
    bool filling;

    public SaverOptionsWindow(App app)
    {
        this.app = app;
        Text = "Wallpapers Screen Saver";
        Icon = Tray.LoadIcon();
        Font = SystemFonts.MessageBoxFont;   // sizes below come from it, so they follow the DPI
        AutoScaleMode = AutoScaleMode.Dpi;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = MinimizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        AutoSize = true;
        AutoSizeMode = AutoSizeMode.GrowAndShrink;
        TopMost = true;   // over whatever Windows' dialog is doing, until it's up (OnShown)

        foreach (var m in SaverChoices.StartAfterMinutes) startAfter.Items.Add(new Choice<int>(Minutes(m), m));
        foreach (var m in SaverChoices.ChangeMinutes) changeEvery.Items.Add(new Choice<int>(Minutes(m), m));
        var em = Font.Height;
        startAfter.Width = changeEvery.Width = TextRenderer.MeasureText("30 minutes", Font).Width + 2 * em;
        wallpaper.Width = 9 * em;
        whyNot.Margin = new Padding(em * 3 / 2, 0, 3, em / 2);

        var grid = new TableLayoutPanel { AutoSize = true, AutoSizeMode = AutoSizeMode.GrowAndShrink, ColumnCount = 2, Padding = new Padding(12) };
        void Row(Control? label, Control control)
        {
            if (label == null) { grid.Controls.Add(control); grid.SetColumnSpan(control, 2); return; }
            grid.Controls.Add(label);
            grid.Controls.Add(control);
        }
        Row(null, use);
        Row(null, whyNot);
        Row(Label("Start after:"), startAfter);
        Row(Label("Show:"), same);
        Row(new Label(), different);
        var oneRow = new FlowLayoutPanel { AutoSize = true, AutoSizeMode = AutoSizeMode.GrowAndShrink, WrapContents = false, Margin = Padding.Empty };
        oneRow.Controls.AddRange([one, wallpaper]);
        Row(new Label(), oneRow);
        Row(Label("Change every:"), changeEvery);
        Row(null, clock);
        var buttons = new FlowLayoutPanel { AutoSize = true, AutoSizeMode = AutoSizeMode.GrowAndShrink, FlowDirection = FlowDirection.RightToLeft, Anchor = AnchorStyles.Right, Margin = new Padding(0, 12, 0, 0), WrapContents = false };
        buttons.Controls.AddRange([close, windows, preview]);
        Row(null, buttons);
        Controls.Add(grid);
        AcceptButton = CancelButton = close;

        var saver = app.Saver;
        use.Click += (_, _) => Do("use", saver.ToggleUse);
        startAfter.SelectionChangeCommitted += (_, _) => Do("start after", () => { if (startAfter.SelectedItem is Choice<int> c) saver.SetStartAfter(c.Value); });
        same.CheckedChanged += (_, _) => { if (same.Checked) Do("show", () => saver.Set(saver.Settings with { Show = SaverShow.Same })); };
        different.CheckedChanged += (_, _) => { if (different.Checked) Do("show", () => saver.Set(saver.Settings with { Show = SaverShow.Different })); };
        one.CheckedChanged += (_, _) => { if (one.Checked) Do("show", ShowOne); };
        wallpaper.SelectionChangeCommitted += (_, _) => Do("wallpaper", ShowOne);
        changeEvery.SelectionChangeCommitted += (_, _) => Do("change every", () => { if (changeEvery.SelectedItem is Choice<int> c) saver.Set(saver.Settings with { ChangeMinutes = c.Value }); });
        clock.CheckedChanged += (_, _) => Do("clock", () => saver.Set(saver.Settings with { Clock = clock.Checked }));
        preview.Click += (_, _) => Do("preview", saver.PreviewNow);
        windows.Click += (_, _) => Do("windows settings", saver.OpenWindowsSettings);
        close.Click += (_, _) => Close();
        waitForCatalog.Tick += (_, _) => { if (app.Tray.Catalog != null) Do("catalog", () => { }); };
        Fill();
    }

    /// Brings it to the front (it's already open, or has just been shown).
    public void Bring()
    {
        if (WindowState == FormWindowState.Minimized) WindowState = FormWindowState.Normal;
        TopMost = true;
        Activate();
        TopMost = false;
    }

    protected override void OnShown(EventArgs e)
    {
        base.OnShown(e);
        Bring();
    }

    /// One Wallpaper with the list's pick (with nothing to pick yet, it can't be One: the settings say so).
    void ShowOne()
    {
        var id = (wallpaper.SelectedItem as Choice<string>)?.Value;
        app.Saver.Set(app.Saver.Settings with { Show = SaverShow.One, Wallpaper = id ?? app.Saver.Settings.Wallpaper });
    }

    /// A change, then every control again from what's true now (a refused change shows as it was).
    void Do(string what, Action action)
    {
        if (filling) return;
        try { action(); }
        catch (Exception e) { Log.Warn($"saver options: {what}: {e.GetType().Name}: {e.Message}"); }
        if (!IsDisposed) Fill();
    }

    void Fill()
    {
        filling = true;
        try
        {
            var saver = app.Saver;
            var s = saver.Settings;
            var why = saver.WhyNot();
            use.Checked = saver.Selected;
            use.Enabled = why == null;
            whyNot.Text = why ?? "";
            whyNot.Visible = why != null;
            Pick(startAfter, saver.StartAfter);
            same.Checked = s.Show == SaverShow.Same;
            different.Checked = s.Show == SaverShow.Different;
            one.Checked = s.Show == SaverShow.One;
            FillWallpapers(s);
            Pick(changeEvery, s.ChangeMinutes);
            changeEvery.Enabled = s.Show == SaverShow.Different;
            clock.Checked = s.Clock;
        }
        finally { filling = false; }
    }

    /// From monitor 1's catalog: the saved One Wallpaper, else what the desktop shows, else the first.
    void FillWallpapers(SaverSettings s)
    {
        var entries = app.Tray.Catalog?.Entries.Where(e => !e.Pseudo).ToList();
        if (entries == null)
        {
            wallpaper.Items.Clear();
            wallpaper.Items.Add("Loading…");
            wallpaper.SelectedIndex = 0;
            wallpaper.Enabled = one.Enabled = false;
            waitForCatalog.Start();
            return;
        }
        waitForCatalog.Stop();
        if (!wallpaper.Items.OfType<Choice<string>>().Select(c => c.Value).SequenceEqual(entries.Select(e => e.Id)))
        {
            wallpaper.Items.Clear();
            foreach (var e in entries) wallpaper.Items.Add(new Choice<string>($"{e.Icon}  {e.Name}", e.Id));
            wallpaper.DropDownWidth = Math.Max(wallpaper.Width, wallpaper.Items.Cast<object>().Select(i => TextRenderer.MeasureText(i.ToString(), wallpaper.Font).Width + 2 * Font.Height).DefaultIfEmpty(0).Max());
        }
        wallpaper.Enabled = one.Enabled = true;
        var want = s.Wallpaper ?? app.Tray.Catalog!.Resolved;
        var at = entries.FindIndex(e => e.Id == want);
        if (wallpaper.SelectedIndex < 0 || s.Show == SaverShow.One) wallpaper.SelectedIndex = Math.Max(0, at);
    }

    static void Pick(ComboBox combo, int? value) =>
        combo.SelectedIndex = combo.Items.Cast<Choice<int>>().ToList().FindIndex(c => c.Value == value);

    static string Minutes(int n) => n == 1 ? "1 minute" : $"{n} minutes";

    static ComboBox Combo() => new() { DropDownStyle = ComboBoxStyle.DropDownList, Anchor = AnchorStyles.Left };
    static RadioButton Radio(string text) => new() { Text = text, AutoSize = true, Anchor = AnchorStyles.Left };
    static Label Label(string text) => new() { Text = text, AutoSize = true, Anchor = AnchorStyles.Left };
    static Button Button(string text) => new() { Text = text, AutoSize = true, MinimumSize = new Size(80, 0) };

    protected override void Dispose(bool disposing)
    {
        if (disposing) waitForCatalog.Dispose();
        base.Dispose(disposing);
    }

    sealed record Choice<T>(string Text, T Value)
    {
        public override string ToString() => Text;
    }
}
