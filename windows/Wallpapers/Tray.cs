using System.Drawing;
using System.Drawing.Drawing2D;
using System.Reflection;
using System.Text.Json;
using System.Windows.Forms;

namespace Wallpapers;

/// The notification-area icon and its menu: the app's only always-there UI (SPEC §10.25.10). The
/// catalog and what's showing live in the page, so the menu asks the first surface each time it
/// opens. W1's items; the rest of §10.25.10 comes with W2–W5.
sealed class Tray : IDisposable
{
    /// Thumbnail size in the Wallpaper menu, in logical px (16:9, about one text line tall, so 36
    /// rows still fit a 1080p-at-200% screen).
    static readonly Size ThumbLogical = new(32, 18);

    readonly App app;
    readonly NotifyIcon icon;
    readonly ContextMenuStrip menu = new();
    readonly ToolStripMenuItem header, wallpaper, surprise, next, previous, pause, settings, reload, drawAbove, devTools, about, quit;
    readonly Dictionary<string, Bitmap> thumbs = [];          // 128×72 from the page, by id
    readonly Dictionary<string, Bitmap> scaledThumbs = [];    // at the menu's device size
    readonly HashSet<string> balloonsShown = [];
    CatalogInfo? catalog;
    Task? refreshing;
    bool thumbsAsked, disposed;
    DateTime lastHover;

    public Tray(App app)
    {
        this.app = app;
        header = new ToolStripMenuItem("Wallpapers") { Enabled = false };
        header.Font = new Font(header.Font, FontStyle.Bold);
        wallpaper = new ToolStripMenuItem("Wallpaper");
        var list = (ToolStripDropDownMenu)wallpaper.DropDown;
        list.ShowCheckMargin = true;   // a separate tick column, so a ticked row keeps its thumbnail
        list.ShowImageMargin = true;
        surprise = Item("Surprise Me", () => SurpriseAsync());
        next = Item("Next", () => app.Desktop.CycleAsync(1));
        previous = Item("Previous", () => app.Desktop.CycleAsync(-1));
        pause = Item("Pause", () => app.Desktop.SetPausedAsync(!app.Desktop.Paused));
        settings = Item("Settings…", () => { app.OpenSettings(); return Task.CompletedTask; });
        reload = Item("Reload Wallpapers", () => { app.Desktop.ReloadAll(); return Task.CompletedTask; });
        drawAbove = Item("Draw Above Icons", () => { ToggleDrawAbove(); return Task.CompletedTask; });
        devTools = Item("Developer Tools", () => { app.Desktop.Surfaces.FirstOrDefault()?.Web?.OpenDevToolsWindow(); return Task.CompletedTask; });
        devTools.Visible = Log.Verbose;
        about = Item($"About Wallpapers {App.Version.Split('+')[0]}", () => { About(); return Task.CompletedTask; });
        quit = Item("Quit", () => { app.Quit(); return Task.CompletedTask; });

        var troubleshooting = new ToolStripMenuItem("Troubleshooting");
        troubleshooting.DropDownItems.AddRange([
            Item("Open Log Folder", () => { Shell.Open(app.Paths.Root); return Task.CompletedTask; }),
            reload, drawAbove, devTools,
        ]);
        menu.Items.AddRange([
            header, wallpaper, surprise, next, previous, new ToolStripSeparator(),
            pause, new ToolStripSeparator(),
            settings, troubleshooting, about, quit,
        ]);
        menu.Opening += (_, _) => { Sync(); Run("refresh", RefreshAsync); };

        icon = new NotifyIcon { Icon = LoadIcon(SystemInformation.SmallIconSize), Text = "Wallpapers", ContextMenuStrip = menu, Visible = true };
        icon.MouseUp += (_, e) => { if (e.Button == MouseButtons.Left) ShowMenu(); };
        // Hovering asks the page again (at most every 3 s), so the tooltip follows picks made
        // elsewhere (the settings window) and Seasonal's rollovers without polling.
        icon.MouseMove += (_, _) =>
        {
            if (DateTime.UtcNow - lastHover < TimeSpan.FromSeconds(3)) return;
            lastHover = DateTime.UtcNow;
            Run("refresh", RefreshAsync);
        };

        app.Desktop.Changed += () => { Sync(); SayProblems(); };
        app.Desktop.PageReady += () => Run("refresh", RefreshAsync);
        Sync();
        SayProblems();
    }

    public bool Visible => !disposed && icon.Visible;

    ToolStripMenuItem Item(string text, Func<Task> action)
    {
        var item = new ToolStripMenuItem(text);
        item.Click += (_, _) => Run(text, async () => { await action(); await RefreshAsync(); });
        return item;
    }

    /// Every menu action goes through here: an exception from a page call (a surface torn down mid-
    /// rebuild, say) is logged, never left to Application.ThreadException, whose crash cleanup would
    /// take the wallpaper down over a menu click.
    async void Run(string what, Func<Task> action)
    {
        try { await action(); }
        catch (Exception e) when (!disposed) { Log.Warn($"tray: {what}: {e.GetType().Name}: {e.Message}"); }
        catch (Exception) { }
    }

    /// The app's icon: at one size (the tray's), or with every size in the .ico (a window's).
    internal static Icon LoadIcon(Size? size = null)
    {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("app.ico")
            ?? throw new InvalidOperationException("app.ico isn't embedded");
        return size is { } s ? new Icon(stream, s) : new Icon(stream);
    }

    /// Left click opens the same menu as right click. NotifyIcon's own ShowContextMenu also makes the
    /// menu close when you click elsewhere; it's private, so it's found by reflection.
    static readonly MethodInfo? ShowContextMenu = typeof(NotifyIcon).GetMethod("ShowContextMenu", BindingFlags.Instance | BindingFlags.NonPublic);

    void ShowMenu()
    {
        if (ShowContextMenu != null) { ShowContextMenu.Invoke(icon, null); return; }
        N.SetForegroundWindow(menu.Handle);
        menu.Show(Cursor.Position);
    }

    /// Asks the first surface for the catalog (one call in flight at a time), then the thumbnails once.
    Task RefreshAsync() => refreshing is { IsCompleted: false } ? refreshing : refreshing = Refresh();

    async Task Refresh()
    {
        var surface = app.Desktop.Surfaces.FirstOrDefault();
        if (surface == null) return;
        var raw = await surface.EvalAsync(CatalogInfo.Script);
        if (JsonSerializer.Deserialize<string?>(raw) is not { } json) return;   // the page isn't ready yet
        try { catalog = CatalogInfo.Parse(json); }
        catch (FormatException e) { Log.Warn($"tray: the page's catalog: {e.Message}"); return; }
        Sync();
        if (thumbsAsked) return;
        thumbsAsked = true;
        await LoadThumbnailsAsync(surface, catalog);
    }

    async Task LoadThumbnailsAsync(Surface surface, CatalogInfo c)
    {
        var json = await surface.EvaluateAsync(c.ThumbnailScript());
        if (json == null) { thumbsAsked = false; return; }
        foreach (var (id, url) in JsonSerializer.Deserialize<Dictionary<string, string>>(json) ?? [])
        {
            var comma = url.IndexOf(',');
            if (comma < 0) continue;
            try
            {
                using var stream = new MemoryStream(Convert.FromBase64String(url[(comma + 1)..]));
                using var image = Image.FromStream(stream);
                thumbs[id] = new Bitmap(image);   // a copy: Image.FromStream needs its stream for life
            }
            catch (Exception e) when (e is FormatException or ArgumentException) { Log.Warn($"tray: thumbnail {id}: {e.Message}"); }
        }
        Log.Info($"tray: {thumbs.Count} thumbnails");
        Sync();
    }

    /// The menu and tooltip from what's known now (the menu may be open: items change in place).
    void Sync()
    {
        if (disposed) return;
        var desktop = app.Desktop;
        var problem = app.Problem ?? desktop.Problem;
        var live = desktop.Surfaces.Count > 0;
        var paused = desktop.Paused;

        if (problem != null)
        {
            header.Text = "⚠ Not drawing: see Open Log Folder";
            SetTooltip("Wallpapers: not drawing (see the log)");
        }
        else if (catalog != null)
        {
            header.Text = catalog.Label + (paused ? " · Paused" : "");
            SetTooltip(catalog.Tooltip(paused));
        }
        else
        {
            header.Text = live ? "Wallpapers" : "Wallpapers: starting…";
            SetTooltip(paused ? "Wallpapers · paused" : "Wallpapers");
        }

        SyncWallpaperList(live);
        surprise.Enabled = next.Enabled = previous.Enabled = live && catalog != null;
        pause.Enabled = reload.Enabled = live;
        pause.Text = paused ? "Resume" : "Pause";
        drawAbove.Checked = app.Settings.DrawAboveIcons;
        devTools.Enabled = live;
        settings.Enabled = app.Problem == null;   // without web/ there's no panel to show
    }

    void SetTooltip(string text)
    {
        if (icon != null && icon.Text != text) icon.Text = text;
    }

    void SyncWallpaperList(bool live)
    {
        var list = (ToolStripDropDownMenu)wallpaper.DropDown;
        if (catalog == null || !live)
        {
            if (list.Items.Count != 1 || list.Items[0].Tag != null)
            {
                list.Items.Clear();
                list.Items.Add(new ToolStripMenuItem(live ? "Loading…" : "Not available") { Enabled = false });
            }
            wallpaper.Enabled = live;
            return;
        }
        wallpaper.Enabled = true;
        var size = list.LogicalToDeviceUnits(ThumbLogical);
        if (list.ImageScalingSize != size) { list.ImageScalingSize = size; ClearScaled(); }

        // Rebuild the rows only when the catalog's ids changed (normally just the first time).
        var ids = catalog.Entries.Select(e => e.Id).ToList();
        if (!list.Items.Cast<ToolStripItem>().Select(i => i.Tag as string).SequenceEqual(ids))
        {
            list.Items.Clear();
            foreach (var entry in catalog.Entries)
            {
                var id = entry.Id;
                var row = new ToolStripMenuItem($"{entry.Icon}  {entry.Name}") { Tag = id };
                row.Click += (_, _) => Run($"pick {id}", async () => { await app.Desktop.ShowAsync(id); await RefreshAsync(); });
                list.Items.Add(row);
            }
        }
        foreach (ToolStripMenuItem row in list.Items)
        {
            var id = (string)row.Tag!;
            row.Checked = id == catalog.Current;
            row.Image ??= Scaled(id, size);
        }
    }

    Bitmap? Scaled(string id, Size size)
    {
        if (scaledThumbs.TryGetValue(id, out var done)) return done;
        if (!thumbs.TryGetValue(id, out var source)) return null;
        var bitmap = new Bitmap(size.Width, size.Height);
        using (var g = Graphics.FromImage(bitmap))
        {
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.PixelOffsetMode = PixelOffsetMode.HighQuality;
            g.DrawImage(source, new Rectangle(Point.Empty, size));
        }
        return scaledThumbs[id] = bitmap;
    }

    void ClearScaled()
    {
        foreach (ToolStripItem row in ((ToolStripDropDownMenu)wallpaper.DropDown).Items) row.Image = null;
        foreach (var b in scaledThumbs.Values) b.Dispose();
        scaledThumbs.Clear();
    }

    async Task SurpriseAsync()
    {
        await RefreshAsync();
        if (catalog == null || Picker.Surprise(catalog, Random.Shared) is not { } id) return;
        Log.Info($"tray: surprise → {id}");
        await app.Desktop.ShowAsync(id);
    }

    void ToggleDrawAbove()
    {
        var on = !app.Settings.DrawAboveIcons;
        app.SaveSettings(app.Settings with { DrawAboveIcons = on });
        app.Layer.DrawAboveIcons = on;
        Log.Info($"tray: draw above icons {(on ? "on" : "off")}");
        app.Desktop.ScheduleRebuild();
        Sync();
    }

    void About()
    {
        var runtime = app.Desktop.Environment?.BrowserVersionString ?? "not loaded";
        MessageBox.Show(
            $"Wallpapers {App.Version}\n\nWebView2 runtime {runtime}\nData folder: {app.Paths.Root}\nWallpapers folder: {app.Paths.WebRoot}",
            "About Wallpapers", MessageBoxButtons.OK, MessageBoxIcon.Information);
    }

    /// A reason the desktop can't be drawn is said once, as a balloon (it's in the log too).
    void SayProblems()
    {
        var problem = app.Problem ?? app.Desktop.Problem;
        if (problem == null || !balloonsShown.Add(problem)) return;
        icon.ShowBalloonTip(10000, "Wallpapers can't draw the desktop", problem, ToolTipIcon.Warning);
    }

    public void Dispose()
    {
        if (disposed) return;
        disposed = true;
        icon.Visible = false;   // or a dead icon lingers in the tray until the mouse passes over it
        icon.Dispose();
        menu.Dispose();
        foreach (var b in thumbs.Values.Concat(scaledThumbs.Values)) b.Dispose();
    }
}
