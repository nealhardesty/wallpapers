using System.Diagnostics.CodeAnalysis;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Reflection;
using System.Text.Json;
using System.Windows.Forms;

namespace Wallpapers;

/// The notification-area icon and its menu: the app's only always-there UI (SPEC §10.25.10). The
/// catalog and what's showing live in the pages, so the menu asks every surface each time it opens.
/// In Different mode the header and the Wallpaper items become one row and one submenu per monitor.
/// Screen Saver ▸ is SaverControl's choices (§10.25.12).
sealed class Tray : IDisposable
{
    /// Thumbnail size in the Wallpaper menu, in logical px (16:9, about one text line tall, so 36
    /// rows still fit a 1080p-at-200% screen).
    static readonly Size ThumbLogical = new(32, 18);

    readonly App app;
    readonly NotifyIcon icon;
    readonly ContextMenuStrip menu = new();
    readonly ToolStripMenuItem header, wallpaper, surprise, next, previous, pause, follow, clicks, play, same, different, identify, settings, reload, drawAbove, devTools, startWithWindows, install, about, quit;
    readonly Dictionary<string, Bitmap> thumbs = [];          // 128×72 from the page, by id
    readonly Dictionary<string, Bitmap> scaledThumbs = [];    // at the menu's device size
    readonly HashSet<string> balloonsShown = [];
    /// Each surface's answer, by display key; `catalog` is monitor 1's (the catalog itself, and Same mode's choice).
    readonly Dictionary<string, CatalogInfo> catalogs = [];
    CatalogInfo? catalog;
    /// Monitor 1's performance answer; a pick or toggle goes to that surface and the others follow its storage event.
    PerformanceInfo? performance;
    readonly Dictionary<string, ToolStripMenuItem> modeRows = [];
    readonly ToolStripMenuItem batteryAware, performanceStatus, performanceMenu;
    /// Different mode's per-monitor rows and submenus, and the monitors they were made for.
    readonly List<MonitorItems> perMonitor = [];
    string perMonitorShape = "";
    /// Screen Saver ▸ and its rows (SaverMenu).
    ToolStripMenuItem saverMenu, saverUse, showSame, showDifferent, showOne, changeEvery, saverClock;
    readonly Dictionary<int, ToolStripMenuItem> startAfterRows = [], changeRows = [];
    Size scaledSize;
    Task? refreshing;
    bool thumbsAsked, disposed;
    DateTime lastHover;

    public Tray(App app)
    {
        this.app = app;
        header = new ToolStripMenuItem("Wallpapers") { Enabled = false };
        header.Font = new Font(header.Font, FontStyle.Bold);
        wallpaper = WallpaperMenu();
        surprise = Item("Surprise Me", () => SurpriseAsync(null));
        next = Item("Next", () => app.Desktop.CycleAsync(1));
        previous = Item("Previous", () => app.Desktop.CycleAsync(-1));
        pause = Item("Pause", () => app.Desktop.SetPausedAsync(!app.Desktop.Paused));
        follow = Item("Wallpaper Follows the Mouse", () => { app.SetFollowMouse(!app.Settings.FollowMouse); Sync(); return Task.CompletedTask; });
        clicks = Item("Clicks on the Desktop Play", () => { app.SetDesktopClicks(!app.Settings.DesktopClicks); Sync(); return Task.CompletedTask; });
        // In Different mode: monitor 1's (App.OpenPlay picks it).
        play = Item("Play in a Window…", () => { app.OpenPlay(); return Task.CompletedTask; });
        same = Item("Same on All", () => app.SetMonitorModeAsync(MonitorMode.Same));
        different = Item("Different per Monitor", () => app.SetMonitorModeAsync(MonitorMode.Different));
        same.Tag = different.Tag = RadioRenderer.Radio;
        identify = Item("Identify Monitors", () =>
        {
            IdentifyWindow.ShowAll(app.Desktop.Surfaces.Select(s => (s.Plan, s.Placement.Screen)).ToList());
            return Task.CompletedTask;
        });
        var monitors = new ToolStripMenuItem("Monitors");
        monitors.DropDownItems.AddRange([same, different, new ToolStripSeparator(), identify]);
        performanceMenu = new ToolStripMenuItem("Performance");
        foreach (var (mode, name) in new[] { ("auto", "Auto"), ("low", "Low"), ("medium", "Medium"), ("high", "High") })
        {
            var row = Item(name, () => RunOnFirst($"WP.player.setMode('{mode}')"));
            row.Tag = RadioRenderer.Radio;
            modeRows[mode] = row;
            performanceMenu.DropDownItems.Add(row);
        }
        batteryAware = Item("Save Power on Battery", () => RunOnFirst("WP.player.setBatteryAware((WP.store.get('wp:performance') || {}).batteryAware === false)"));   // flips what the page has now, not what we last heard
        performanceStatus = new ToolStripMenuItem("now: …") { Enabled = false };
        performanceMenu.DropDownItems.AddRange([new ToolStripSeparator(), batteryAware, new ToolStripSeparator(), performanceStatus]);
        // In Different mode: monitor 1's (App.OpenSettings picks it).
        settings = Item("Settings…", () => { app.OpenSettings(); return Task.CompletedTask; });
        SaverMenu();
        reload = Item("Reload Wallpapers", () => { app.Desktop.ReloadAll(); return Task.CompletedTask; });
        drawAbove = Item("Draw Above Icons", () => { ToggleDrawAbove(); return Task.CompletedTask; });
        devTools = Item("Developer Tools", () => { app.Desktop.Surfaces.FirstOrDefault()?.Web?.OpenDevToolsWindow(); return Task.CompletedTask; });
        devTools.Visible = Log.Verbose;
        // Installed: Start with Windows. Not installed (the run flavor): Install…, the offer again.
        startWithWindows = Item("Start with Windows", () =>
        {
            app.Installer?.SetStartWithWindows(!app.Installer.StartsWithWindows());
            SyncInstall();
            return Task.CompletedTask;
        });
        install = Item("Install…", () =>
        {
            if (app.Installer?.ShowOffer(Offer.Install, app.Settings, app.SaveSettings, start: false) == true)
            {
                app.StartAfterQuit = app.Installer;
                app.Quit();
            }
            return Task.CompletedTask;
        });
        about = Item($"About Wallpapers {App.Version.Split('+')[0]}", () => { About(); return Task.CompletedTask; });
        quit = Item("Quit", () => { app.Quit(); return Task.CompletedTask; });

        var troubleshooting = new ToolStripMenuItem("Troubleshooting");
        troubleshooting.DropDownItems.AddRange([
            Item("Open Log Folder", () => { Shell.Open(app.Paths.Root); return Task.CompletedTask; }),
            reload, drawAbove, devTools,
        ]);
        menu.Items.AddRange([
            header, wallpaper, surprise, next, previous, new ToolStripSeparator(),
            pause, follow, clicks, play, new ToolStripSeparator(),
            monitors, performanceMenu, settings, saverMenu, new ToolStripSeparator(),
            startWithWindows, install, troubleshooting, about, quit,
        ]);
        menu.Renderer = new RadioRenderer();   // its submenus draw with their owner's renderer
        menu.Opening += (_, _) => { Sync(); SyncInstall(); SyncSaver(); Run("refresh", RefreshAsync); };

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
        SyncInstall();
        SayProblems();
    }

    /// The install row, from the registry and where we run (read when the menu opens, not on every Sync).
    void SyncInstall()
    {
        var installer = app.Installer;
        var here = installer?.InstalledHere == true;
        startWithWindows.Visible = here;
        startWithWindows.Checked = here && installer!.StartsWithWindows();
        install.Visible = !here && app.Paths.Flavor == "run";
    }

    public bool Visible => !disposed && icon.Visible;

    /// Monitor 1's catalog (what One Wallpaper lists), or null until a page has answered.
    public CatalogInfo? Catalog => catalog;

    /// Screen Saver ▸ (SPEC §10.25.12). The choices are settings (Sync keeps them); whether ours is selected,
    /// when Windows starts it and why it can't be are read from Windows when the menu opens (SyncSaver).
    [MemberNotNull(nameof(saverMenu), nameof(saverUse), nameof(showSame), nameof(showDifferent), nameof(showOne), nameof(changeEvery), nameof(saverClock))]
    void SaverMenu()
    {
        var saver = app.Saver;
        Task Then(Action action) { action(); SyncSaver(); Sync(); return Task.CompletedTask; }
        saverUse = Item("Use Wallpapers as the Screen Saver…", () => Then(saver.ToggleUse));
        saverUse.AutoToolTip = false;
        var startAfter = new ToolStripMenuItem("Start After");
        foreach (var minutes in SaverChoices.StartAfterMinutes)
        {
            var row = startAfterRows[minutes] = Item($"{minutes} min", () => Then(() => saver.SetStartAfter(minutes)));
            row.Tag = RadioRenderer.Radio;
            startAfter.DropDownItems.Add(row);
        }
        showSame = Item("Same as the Desktop", () => Then(() => saver.Set(saver.Settings with { Show = SaverShow.Same })));
        showDifferent = Item("A Different One Each Time", () => Then(() => saver.Set(saver.Settings with { Show = SaverShow.Different })));
        showOne = WallpaperMenu();
        showOne.Text = "One Wallpaper";
        showSame.Tag = showDifferent.Tag = showOne.Tag = RadioRenderer.Radio;
        var show = new ToolStripMenuItem("Show");
        show.DropDownItems.AddRange([showSame, showDifferent, showOne]);
        changeEvery = new ToolStripMenuItem("Change Every");
        foreach (var minutes in SaverChoices.ChangeMinutes)
        {
            var row = changeRows[minutes] = Item($"{minutes} min", () => Then(() => saver.Set(saver.Settings with { ChangeMinutes = minutes })));
            row.Tag = RadioRenderer.Radio;
            changeEvery.DropDownItems.Add(row);
        }
        saverClock = Item("Show a Clock", () => Then(() => saver.Set(saver.Settings with { Clock = !saver.Settings.Clock })));
        saverMenu = new ToolStripMenuItem("Screen Saver");
        saverMenu.DropDown.ShowItemToolTips = true;   // the disabled Use row says why
        saverMenu.DropDownItems.AddRange([
            saverUse, startAfter, show, changeEvery, saverClock, new ToolStripSeparator(),
            Item("Preview Now", () => Then(saver.PreviewNow)),
            Item("Open Windows Screen Saver Settings…", () => Then(saver.OpenWindowsSettings)),
        ]);
    }

    /// What Windows says now: ours selected, its timeout, and whether ours could be selected.
    void SyncSaver()
    {
        if (disposed) return;
        var saver = app.Saver;
        var why = saver.WhyNot();
        var selected = saver.Selected;
        saverUse.Checked = selected;
        saverUse.Enabled = why == null || selected;   // ours selected can always be unticked
        saverUse.ToolTipText = why;
        var after = saver.StartAfter;
        foreach (var (minutes, row) in startAfterRows) row.Checked = after == minutes;
    }

    /// The saver's own choices (settings.json), and One Wallpaper's list from monitor 1's catalog.
    void SyncSaverChoices()
    {
        var s = app.Saver.Settings;
        showSame.Checked = s.Show == SaverShow.Same;
        showDifferent.Checked = s.Show == SaverShow.Different;
        showOne.Checked = s.Show == SaverShow.One;
        foreach (var (minutes, row) in changeRows) row.Checked = s.ChangeMinutes == minutes;
        changeEvery.Enabled = s.Show == SaverShow.Different;
        saverClock.Checked = s.Clock;

        var list = (ToolStripDropDownMenu)showOne.DropDown;
        var entries = catalog?.Entries.Where(e => !e.Pseudo).ToList();
        if (entries == null)
        {
            if (list.Items.Count != 1 || list.Items[0].Tag != null)
            {
                list.Items.Clear();
                list.Items.Add(new ToolStripMenuItem("Loading…") { Enabled = false });
            }
            return;
        }
        if (!list.Items.Cast<ToolStripItem>().Select(i => i.Tag as string).SequenceEqual(entries.Select(e => e.Id)))
        {
            list.Items.Clear();
            foreach (var entry in entries)
            {
                var id = entry.Id;
                list.Items.Add(Item($"{entry.Icon}  {entry.Name}", () =>
                {
                    app.Saver.Set(app.Saver.Settings with { Show = SaverShow.One, Wallpaper = id });
                    Sync();
                    return Task.CompletedTask;
                }));
                list.Items[^1].Tag = id;
            }
        }
        foreach (ToolStripMenuItem row in list.Items) row.Checked = s.Show == SaverShow.One && (string?)row.Tag == s.Wallpaper;
    }

    /// The self-test reads Screen Saver ▸ as the menu would show it on opening (SPEC §10.25.16): each row's
    /// text, whether it's enabled, its submenu's rows; and whether it sits right after Settings….
    internal (bool AfterSettings, List<(string Text, bool Enabled, List<string> Sub)> Rows) SaverMenuForTest()
    {
        Sync();
        SyncSaver();
        return (menu.Items.IndexOf(saverMenu) == menu.Items.IndexOf(settings) + 1,
            saverMenu.DropDownItems.Cast<ToolStripItem>().Select(i => i is ToolStripSeparator
                ? ("—", true, new List<string>())
                : (i.Text ?? "", i.Enabled, ((ToolStripMenuItem)i).DropDownItems.Cast<ToolStripItem>().Select(r => r.Text ?? "").ToList())).ToList());
    }

    static ToolStripMenuItem WallpaperMenu()
    {
        var item = new ToolStripMenuItem("Wallpaper");
        var list = (ToolStripDropDownMenu)item.DropDown;
        list.ShowCheckMargin = true;   // a separate tick column, so a ticked row keeps its thumbnail
        list.ShowImageMargin = true;
        return item;
    }

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

    /// Asks every surface for its catalog and choice (one round in flight at a time), then monitor 1
    /// for the thumbnails once.
    Task RefreshAsync() => refreshing is { IsCompleted: false } ? refreshing : refreshing = Refresh();

    async Task Refresh()
    {
        var live = app.Desktop.Surfaces.ToList();
        if (live.Count == 0) return;
        var answers = await Task.WhenAll(live.Select(AskAsync));
        for (var i = 0; i < live.Count; i++)
        {
            if (answers[i] is not { } json) continue;   // that page isn't ready yet: keep what it said last
            try { catalogs[live[i].Plan.Key] = CatalogInfo.Parse(json); }
            catch (FormatException e) { Log.Warn($"tray: {live[i].Plan.Key}'s catalog: {e.Message}"); }
        }
        var keys = app.Desktop.Surfaces.Select(s => s.Plan.Key).ToHashSet();
        foreach (var gone in catalogs.Keys.Where(k => !keys.Contains(k)).ToList()) catalogs.Remove(gone);
        // Monitor 1 now: a reconcile while the pages answered can have renumbered them. Until the new
        // monitor 1 answers, another current monitor's catalog beats a gone one's.
        var firstKey = app.Desktop.Surfaces.FirstOrDefault()?.Plan.Key;
        catalog = (firstKey == null ? null : catalogs.GetValueOrDefault(firstKey)) ?? catalogs.Values.FirstOrDefault() ?? catalog;
        if (await AskAsync(live[0], PerformanceInfo.Script) is { } perf)
        {
            try { performance = PerformanceInfo.Parse(perf); }
            catch (FormatException e) { Log.Warn($"tray: performance: {e.Message}"); }
        }
        Sync();
        if (thumbsAsked || catalog == null) return;
        thumbsAsked = true;
        await LoadThumbnailsAsync(live[0], catalog);
    }

    /// One surface's answer, or null (not ready, or closing): one page can't hold up the others.
    static Task<string?> AskAsync(Surface s) => AskAsync(s, CatalogInfo.Script);

    static async Task<string?> AskAsync(Surface s, string script)
    {
        try { return JsonSerializer.Deserialize<string?>(await s.EvalAsync(script)); }
        catch (Exception e) when (e is COMException or InvalidOperationException or ObjectDisposedException or JsonException)
        {
            Log.Warn($"tray: {s.Plan.Key}: {e.GetType().Name}: {e.Message}");
            return null;
        }
    }

    /// What that monitor's page last said it shows (null until it has answered).
    public CatalogInfo? CatalogFor(string key) => catalogs.GetValueOrDefault(key);

    /// The self-test clicks the real rows (SPEC §10.25.16).
    internal void ClickPerformanceForTest(string? mode) => (mode == null ? batteryAware : modeRows[mode]).PerformClick();
    internal void ClickPointerForTest(string which) => (which == "follow" ? follow : clicks).PerformClick();
    internal string PerformanceStatusForTest => performanceStatus.Text ?? "";

    /// Runs script on monitor 1's page (a performance pick: the other pages follow through storage).
    async Task RunOnFirst(string script)
    {
        if (app.Desktop.Surfaces.FirstOrDefault() is { } first) await first.EvalAsync(script);
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
        var known = desktop.Surfaces.Select(s => catalogs.GetValueOrDefault(s.Plan.Key)).OfType<CatalogInfo>().ToList();
        var shown = paused ? " · Paused" : "";

        if (problem != null)
        {
            header.Text = "⚠ Not drawing: see Open Log Folder";
            SetTooltip("Wallpapers: not drawing (see the log)");
        }
        else if (catalog != null)
        {
            header.Text = catalog.Label + shown;
            SetTooltip(CatalogInfo.Tooltip(known.Count > 0 ? known : [catalog], paused));
        }
        else
        {
            header.Text = live ? "Wallpapers" : "Wallpapers: starting…";
            SetTooltip(paused ? "Wallpapers · paused" : "Wallpapers");
        }

        // Different mode: a row and a submenu per monitor in place of the header and the Wallpaper items.
        SyncPerMonitor(desktop.Mode == MonitorMode.Different ? desktop.Surfaces.Select(s => s.Plan).ToList() : []);
        var split = perMonitor.Count > 0;
        header.Visible = !split || problem != null;
        wallpaper.Visible = surprise.Visible = next.Visible = previous.Visible = !split;
        SyncWallpaperList(wallpaper, catalog, null, live);
        surprise.Enabled = next.Enabled = previous.Enabled = live && catalog != null;
        foreach (var m in perMonitor)
        {
            var info = catalogs.GetValueOrDefault(m.Key);
            m.Row.Visible = problem == null;
            m.Row.Text = $"{m.Number}  {info?.Label ?? "Loading…"}{shown}";
            SyncWallpaperList(m.Wallpaper, info, m.Key, live);
            m.Surprise.Enabled = m.Next.Enabled = m.Previous.Enabled = live && info != null;
            m.Settings.Enabled = app.Problem == null;
            m.Play.Enabled = live && info != null;
        }
        foreach (var (mode, row) in modeRows) row.Checked = performance?.Mode == mode;
        batteryAware.Checked = performance?.BatteryAware ?? true;
        performanceStatus.Text = performance?.Status ?? "now: …";
        performanceMenu.Enabled = live && performance != null;
        same.Checked = desktop.Mode == MonitorMode.Same;
        different.Checked = desktop.Mode == MonitorMode.Different;
        identify.Enabled = live;
        pause.Enabled = reload.Enabled = live;
        pause.Text = paused ? "Resume" : "Pause";
        follow.Checked = app.Settings.FollowMouse;
        clicks.Checked = app.Settings.DesktopClicks;
        play.Enabled = live && app.Problem == null && catalog != null;
        drawAbove.Checked = app.Settings.DrawAboveIcons;
        devTools.Enabled = live;
        settings.Enabled = app.Problem == null;   // without web/ there's no panel to show
        SyncSaverChoices();
    }

    void SetTooltip(string text)
    {
        if (icon != null && icon.Text != text) icon.Text = text;
    }

    /// One Wallpaper ▸ list: the catalog with `info`'s choice ticked; a pick goes to `key`'s monitor (null: all).
    void SyncWallpaperList(ToolStripMenuItem wallpaper, CatalogInfo? info, string? key, bool live)
    {
        var list = (ToolStripDropDownMenu)wallpaper.DropDown;
        if (info == null || !live)
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
        if (list.ImageScalingSize != size) list.ImageScalingSize = size;
        if (scaledSize != size) { ClearScaled(); scaledSize = size; }

        // Rebuild the rows only when the catalog's ids changed (normally just the first time).
        var ids = info.Entries.Select(e => e.Id).ToList();
        if (!list.Items.Cast<ToolStripItem>().Select(i => i.Tag as string).SequenceEqual(ids))
        {
            list.Items.Clear();
            foreach (var entry in info.Entries)
            {
                var id = entry.Id;
                var row = new ToolStripMenuItem($"{entry.Icon}  {entry.Name}") { Tag = id };
                row.Click += (_, _) => Run($"pick {id}{(key != null ? $" on {key}" : "")}", async () => { await app.Desktop.ShowAsync(id, key); await RefreshAsync(); });
                list.Items.Add(row);
            }
        }
        foreach (ToolStripMenuItem row in list.Items)
        {
            var id = (string)row.Tag!;
            row.Checked = id == info.Current;
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

    /// The scaled thumbnails are shared by every Wallpaper list; none may keep one that's disposed.
    void ClearScaled()
    {
        foreach (var list in perMonitor.Select(m => m.Wallpaper).Prepend(wallpaper)) Unimage(list);
        foreach (var b in scaledThumbs.Values) b.Dispose();
        scaledThumbs.Clear();
    }

    static void Unimage(ToolStripMenuItem list)
    {
        foreach (ToolStripItem row in list.DropDownItems) row.Image = null;
    }

    async Task SurpriseAsync(string? key)
    {
        await RefreshAsync();
        var info = key == null ? catalog : catalogs.GetValueOrDefault(key);
        if (info == null || Picker.Surprise(info, Random.Shared) is not { } id) return;
        Log.Info($"tray: surprise{(key != null ? $" on {key}" : "")} → {id}");
        await app.Desktop.ShowAsync(id, key);
    }

    /// One monitor's items in Different mode: its row under the header, and its submenu.
    sealed record MonitorItems(string Key, int Number, ToolStripMenuItem Row, ToolStripMenuItem Menu,
        ToolStripMenuItem Wallpaper, ToolStripMenuItem Surprise, ToolStripMenuItem Next, ToolStripMenuItem Previous, ToolStripMenuItem Settings,
        ToolStripMenuItem Play);

    /// Makes the per-monitor items again when the monitors (or their numbers and names) change; none in Same mode.
    void SyncPerMonitor(IReadOnlyList<SurfacePlan> plans)
    {
        var shape = string.Join("|", plans.Select(p => $"{p.Key} {p.Number} {p.Primary} {p.Name}"));
        if (shape == perMonitorShape) return;
        perMonitorShape = shape;
        foreach (var m in perMonitor)
        {
            Unimage(m.Wallpaper);   // the thumbnails are shared: disposing the items mustn't take them
            menu.Items.Remove(m.Row);
            menu.Items.Remove(m.Menu);
            m.Row.Dispose();
            m.Menu.Dispose();
        }
        perMonitor.Clear();
        foreach (var plan in plans)
        {
            var key = plan.Key;
            var row = new ToolStripMenuItem($"{plan.Number}") { Enabled = false };
            row.Font = new Font(row.Font, FontStyle.Bold);
            var list = WallpaperMenu();
            var items = new MonitorItems(key, plan.Number, row,
                new ToolStripMenuItem($"Monitor {plan.Number} · {plan.Name}{(plan.Primary ? " (main)" : "")}"), list,
                Item("Surprise Me", () => SurpriseAsync(key)),
                Item("Next", () => app.Desktop.CycleAsync(1, key)),
                Item("Previous", () => app.Desktop.CycleAsync(-1, key)),
                Item("Settings…", () =>
                {
                    app.OpenSettings(app.Desktop.Surfaces.FirstOrDefault(s => s.Plan.Key == key)?.Plan);
                    return Task.CompletedTask;
                }),
                Item("Play in a Window…", () =>
                {
                    app.OpenPlay(app.Desktop.Surfaces.FirstOrDefault(s => s.Plan.Key == key)?.Plan);
                    return Task.CompletedTask;
                }));
            items.Menu.DropDownItems.AddRange([list, items.Surprise, items.Next, items.Previous, items.Settings, items.Play]);
            menu.Items.Insert(menu.Items.IndexOf(header) + 1 + perMonitor.Count, row);
            menu.Items.Insert(menu.Items.IndexOf(previous) + 1 + perMonitor.Count, items.Menu);
            perMonitor.Add(items);
        }
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
        var installer = app.Installer;
        var installed = installer?.InstalledHere == true;
        var close = TaskDialogButton.Close;
        var uninstall = new TaskDialogButton("&Uninstall…");
        // The project page opens in the browser and leaves About open.
        var homepage = new TaskDialogButton("&Project Page") { AllowCloseDialog = false };
        homepage.Click += (_, _) => Shell.Open(App.Homepage!);
        using var appIcon = LoadIcon();
        var page = new TaskDialogPage
        {
            Caption = "About Wallpapers",
            Heading = $"Wallpapers {App.Version.Split('+')[0]}",
            Text = $"Version {App.Version}\nWebView2 runtime {runtime}\nData folder: {app.Paths.Root}\nWallpapers folder: {app.Paths.WebRoot}\n\n" +
                (installed ? $"Installed in {installer!.Layout.Root}" : $"Running from {AppContext.BaseDirectory.TrimEnd('\\')} (not installed)"),
            Buttons = { close },
            DefaultButton = close,
            AllowCancel = true,
            Icon = new TaskDialogIcon(appIcon),
        };
        if (installed) page.Buttons.Add(uninstall);
        if (App.Homepage != null) page.Buttons.Add(homepage);
        if (TaskDialog.ShowDialog(page, TaskDialogStartupLocation.CenterScreen) != uninstall) return;
        // Stage 2 asks keep or delete, then asks this app to quit.
        if (installer!.StartUninstall(null) is { } why)
            TaskDialog.ShowDialog(new TaskDialogPage
            {
                Caption = "About Wallpapers",
                Heading = "Couldn't uninstall",
                Text = $"{why}.",
                AllowCancel = true,
                Icon = TaskDialogIcon.Warning,
            }, TaskDialogStartupLocation.CenterScreen);
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

/// A menu's renderer that draws a dot instead of a tick for one-of-several rows (Tag = Radio), as
/// Windows' own menus do; everything else as WinForms' default.
sealed class RadioRenderer : ToolStripProfessionalRenderer
{
    public static readonly object Radio = new();

    protected override void OnRenderItemCheck(ToolStripItemImageRenderEventArgs e)
    {
        if (e.Item.Tag != Radio || e.ImageRectangle.Width <= 0 || e.ImageRectangle.Height <= 0) { base.OnRenderItemCheck(e); return; }
        var r = e.ImageRectangle;
        using var dot = new Bitmap(r.Width, r.Height);
        using (var g = Graphics.FromImage(dot))
        using (var brush = new SolidBrush(e.Item.ForeColor))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            var d = Math.Min(r.Width, r.Height) * 0.4f;
            g.FillEllipse(brush, (r.Width - d) / 2, (r.Height - d) / 2, d, d);
        }
        base.OnRenderItemCheck(new ToolStripItemImageRenderEventArgs(e.Graphics, e.Item, dot, r));
    }
}
