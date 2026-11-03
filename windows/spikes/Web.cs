using System.Diagnostics;
using System.Drawing;
using System.Text.Json;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;

namespace Spike;

/// W0.2: a WebView2 page in the W0.1 host, windowed or visual (DirectComposition), with frame,
/// visibility, CPU and memory probes, surviving Explorer restarts (plan Task 4).
public static class Web
{
    public const string DefaultArgs = "--disable-features=CalculateNativeWinOcclusion --disable-background-timer-throttling";
    const string Probe = "(() => { const f = [...document.querySelectorAll('iframe.stage')].pop(); const w = f && f.contentWindow;" +
        " return JSON.stringify({ n: w?.WP?.host?.frames?.count ?? -1, vis: f?.contentDocument?.visibilityState ?? 'none'," +
        " top: document.visibilityState, origin: Math.round(performance.timeOrigin), q: w?.WP?.host?.quality?.tier ?? null," +
        " qfps: w?.WP?.host?.quality?.fps ?? null, raf: window.__raf ?? -1, rm: matchMedia('(prefers-reduced-motion: reduce)').matches }); })()";
    // The display's own rAF rate, in the top document, untouched by the stage's pacing.
    const string RafCounter = "window.__raf = 0; (function f() { window.__raf++; requestAnimationFrame(f); })();";

    sealed class Surface
    {
        public IntPtr Hwnd;
        public int Index;
        public CoreWebView2Controller? C;
        public CoreWebView2CompositionController? CC;
        public Dcomp? D;
        public long LastN = -1, LastRaf = -1;
        public double LastT;
        public long Origin;
        public readonly List<(double t, double fps, string vis, bool exposed)> Samples = [];
        public readonly List<double> Raf = [];
        public int Reloads, Recreated;
    }

    static readonly List<Surface> Surfaces = [];
    static CoreWebView2Environment? env;
    static string hosting = "windowed", url = "", mode = "raised", args = DefaultArgs, webDir = "";
    static readonly Stopwatch Clock = new();
    static int ticks;
    static readonly Dictionary<int, TimeSpan> CpuPrev = [];
    static double cpuWallPrev;
    static readonly List<(double app, double web, double mem)> Cpu = [];
    static Form? window;
    static double refFps;
    static bool fullMotion;
    static int hideAt, hideFor;
    static bool ownParent, inputOn, fixOverlay, refocus;
    static IntPtr fgBefore;
    static string clickVia = "input";
    // The Mac's way (§10.25.8 fallback): synthetic pointer + mouse events at a CSS point in the stage document.
    static string ScriptPress(bool down, double x, double y) =>
        "(() => { const f = [...document.querySelectorAll('iframe.stage')].pop(); const d = f && f.contentDocument; if (!d) return 'no stage';" +
        $" const x = {x:F1}, y = {y:F1}, t = d.elementFromPoint(x, y) || d.documentElement, w = d.defaultView;" +
        " const o = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true, view: w };" +
        (down ? " t.dispatchEvent(new w.PointerEvent('pointerdown', { ...o, buttons: 1 })); t.dispatchEvent(new w.MouseEvent('mousedown', { ...o, buttons: 1 }));"
              : " t.dispatchEvent(new w.PointerEvent('pointerup', { ...o, buttons: 0 })); t.dispatchEvent(new w.MouseEvent('mouseup', { ...o, buttons: 0 })); t.dispatchEvent(new w.MouseEvent('click', { ...o, buttons: 0 }));") +
        " return t.tagName; })()";
    static Input? input;
    static Surface? pointerIn;
    static bool gesture;
    static int sentMoves, sentDowns, sentUps;
    // Counts the pointer events that reach the wallpaper's own document (iframe.stage), and the last one.
    const string PageCounter = "(() => { const f = [...document.querySelectorAll('iframe.stage')].pop(); const d = f && f.contentDocument; if (!d) return 'no stage';" +
        " if (!d.__pc) { d.__pc = { move: 0, down: 0, up: 0, trusted: 0, last: null }; for (const t of ['pointermove', 'pointerdown', 'pointerup'])" +
        " d.addEventListener(t, e => { d.__pc[t.slice(7)]++; if (e.isTrusted) d.__pc.trusted++; d.__pc.last = [t, Math.round(e.clientX), Math.round(e.clientY)]; }, true); }" +
        " return JSON.stringify(d.__pc); })()";
    static NativeWindow? keeper;

    public static int Run(Opts o)
    {
        mode = o.Get("mode") ?? "raised";
        hosting = o.Get("hosting") ?? "windowed";
        args = o.Get("args") ?? DefaultArgs;
        if (args == "none") args = "";
        url = "https://wallpapers.example/" + (o.Get("url") ?? "index.html?w=fishtank&tier=high");
        fullMotion = o.Get("motion") == "full";
        hideAt = o.Int("hide-at", 0);
        ownParent = o.Has("own-parent");
        inputOn = o.Has("input");
        fixOverlay = o.Has("fix-overlay");
        refocus = o.Has("refocus");
        clickVia = o.Get("click-via") ?? "input";
        hideFor = o.Int("hide-for", 30);
        refFps = double.TryParse(o.Get("ref"), System.Globalization.CultureInfo.InvariantCulture, out var r) ? r : 0;
        var seconds = (int)(double.Parse(o.Get("minutes") ?? "10", System.Globalization.CultureInfo.InvariantCulture) * 60);
        webDir = Path.GetFullPath("web");
        DesktopTree.PrintEnvironment();
        var power = SystemInformation.PowerStatus;
        Log.Line($"web mode={mode} hosting={hosting} args=\"{args}\" url={url} motion={(fullMotion ? "full (reduced motion emulated off)" : "as the system says")} seconds={seconds} power={power.PowerLineStatus} battery={power.BatteryLifePercent:P0}");
        SynchronizationContext.SetSynchronizationContext(new WindowsFormsSynchronizationContext());

        if (mode == "window")
        {
            window = new Form { Text = $"W0.2 reference ({hosting})", ClientSize = new Size(1280, 720), StartPosition = FormStartPosition.CenterScreen, BackColor = Layer.ColorFor("window") };
            window.FormClosed += (_, _) => Application.ExitThread();
            window.Resize += (_, _) => { foreach (var s in Surfaces) Fit(s); };
            window.Show();
            window.WindowState = FormWindowState.Minimized;   // launched from WSL it may start minimized: normalise it
            window.WindowState = FormWindowState.Normal;
            window.Activate();
            Surfaces.Add(new Surface { Hwnd = window.Handle });
        }
        else
        {
            if (!Layer.AttachAll(o)) return 1;
            for (var i = 0; i < Layer.Hosts.Count; i++) Surfaces.Add(new Surface { Hwnd = Layer.Hosts[i].Handle, Index = i });
        }

        _ = StartAsync();
        Clock.Start();
        if (inputOn)
        {
            input = new Input();
            input.Moved += Move;
            input.Button += Press;
        }
        return Layer.Loop(seconds,
            onTaskbarCreated: () => { if (mode != "window") Layer.Reattach(); },
            onCheck: () => { if (mode != "window") Layer.Watch(); },
            onTick: Tick,
            onExit: Summary);
    }

    static async Task StartAsync()
    {
        try
        {
            var udf = Path.GetFullPath("WebView2");
            env = await CoreWebView2Environment.CreateAsync(null, udf, new CoreWebView2EnvironmentOptions(args));
            Log.Line($"webview2 runtime={env.BrowserVersionString} sdk={typeof(CoreWebView2Environment).Assembly.GetName().Version} udf=Wallpapers-spike\\WebView2");
            foreach (var s in Surfaces) await Create(s);
        }
        catch (Exception e) { Log.Line($"start failed: {e}"); Application.ExitThread(); }
    }

    static async Task Create(Surface s)
    {
        var sw = Stopwatch.StartNew();
        if (hosting == "visual")
        {
            // --own-parent: the controller hangs off a hidden window of ours that Explorer can't take down;
            // only the DirectComposition target lives on the host (and is re-bound when it's recreated).
            if (ownParent && keeper == null)
            {
                keeper = new NativeWindow();
                keeper.CreateHandle(new CreateParams { Caption = "WallpapersSpikeKeeper", Style = unchecked((int)N.WS_POPUP), ExStyle = (int)(N.WS_EX_TOOLWINDOW | N.WS_EX_NOACTIVATE) });
                Log.Line($"keeper window {N.Hex(keeper.Handle)} (controller parent)");
            }
            s.CC = await env!.CreateCoreWebView2CompositionControllerAsync(ownParent ? keeper!.Handle : s.Hwnd);
            s.D ??= new Dcomp();
            s.D.BindTo(s.Hwnd);
            s.CC.RootVisualTarget = s.D.Visual;
            s.D.Device.Commit();
            s.C = s.CC;
        }
        else s.C = await env!.CreateCoreWebView2ControllerAsync(s.Hwnd);

        s.C.DefaultBackgroundColor = Color.Black;
        Fit(s);
        s.C.IsVisible = true;
        var wv = s.C.CoreWebView2;
        wv.SetVirtualHostNameToFolderMapping("wallpapers.example", webDir, CoreWebView2HostResourceAccessKind.Deny);
        // As the Mac app does: the first-run hint is wrong on a desktop that ignores keys.
        await wv.AddScriptToExecuteOnDocumentCreatedAsync("try { localStorage.setItem('wp:hinted', 'true'); } catch (e) {}");
        await wv.AddScriptToExecuteOnDocumentCreatedAsync("if (window === top) { " + RafCounter + " }");
        wv.NavigationCompleted += async (_, e) =>
        {
            Log.Line($"surface {s.Index}: navigation ok={e.IsSuccess} status={e.WebErrorStatus} after {Clock.Elapsed.TotalSeconds:F1}s");
            // Which GPU (or software rasterizer) Chromium got: over RDP it may not be the real one.
            var gpu = await wv.ExecuteScriptAsync("(() => { const g = document.createElement('canvas').getContext('webgl'); const x = g && g.getExtension('WEBGL_debug_renderer_info'); return x ? g.getParameter(x.UNMASKED_RENDERER_WEBGL) : 'no webgl'; })()");
            Log.Line($"surface {s.Index}: gpu {gpu}");
        };
        wv.ProcessFailed += (_, e) => Log.Line($"surface {s.Index}: process failed kind={e.ProcessFailedKind} reason={e.Reason} exit={e.ExitCode}");
        if (fullMotion)
            await wv.CallDevToolsProtocolMethodAsync("Emulation.setEmulatedMedia",
                "{\"features\":[{\"name\":\"prefers-reduced-motion\",\"value\":\"no-preference\"}]}");
        wv.Navigate(url);
        Log.Line($"surface {s.Index}: {hosting} controller on {N.Hex(s.Hwnd)} in {sw.ElapsedMilliseconds} ms, scale={s.C.RasterizationScale}, bounds={s.C.Bounds}");
    }

    static void Fit(Surface s)
    {
        if (s.C == null) return;
        N.GetClientRect(s.Hwnd, out var rc);
        s.C.Bounds = new Rectangle(0, 0, rc.W, rc.H);
    }

    static void Tick()
    {
        if (mode != "window") Layer.Hosts.ForEach(h => h.Tick());
        // An Explorer restart (or a dead parent) recreated a host: follow it.
        if (mode != "window")
            foreach (var s in Surfaces)
                if (s.Index < Layer.Hosts.Count && Layer.Hosts[s.Index].Handle != s.Hwnd && Layer.Hosts[s.Index].Alive)
                    _ = Follow(s, Layer.Hosts[s.Index].Handle);
        ticks++;
        // §10.25.9's claim: IsVisible = false stops rendering outright.
        if (hideAt > 0 && ticks == hideAt) foreach (var s in Surfaces) { if (s.C != null) s.C.IsVisible = false; Log.Line($"surface {s.Index}: IsVisible=false"); }
        if (hideAt > 0 && ticks == hideAt + hideFor) foreach (var s in Surfaces) { if (s.C != null) s.C.IsVisible = true; Log.Line($"surface {s.Index}: IsVisible=true"); }
        if (ticks % 10 == 0) foreach (var s in Surfaces) _ = Sample(s);
        if (inputOn && ticks % 5 == 0) input!.Report();
        if (fixOverlay && ticks % 5 == 0) FixOverlay();
        if (ticks % 60 == 0) SampleCpu();
    }

    /// Move a surface's web view into a recreated host: re-parent it if the controller survived,
    /// else make a new one (a reload, which the probe's timeOrigin shows).
    static async Task Follow(Surface s, IntPtr hwnd)
    {
        var old = s.Hwnd;
        s.Hwnd = hwnd;
        var sw = Stopwatch.StartNew();
        Log.Line($"surface {s.Index}: host changed {N.Hex(old)} -> {N.Hex(hwnd)}; trying to keep the web view");
        try
        {
            if (!(ownParent && s.D != null)) s.C!.ParentWindow = hwnd;
            if (s.D != null && s.D.BindTo(hwnd) && s.CC != null) { s.CC.RootVisualTarget = s.D.Visual; s.D.Device.Commit(); Log.Line($"surface {s.Index}: new root visual"); }
            Fit(s);
            s.C.IsVisible = true;
            var alive = await s.C.CoreWebView2.ExecuteScriptAsync("1");
            Log.Line($"surface {s.Index}: re-parented, page answers ({alive}) in {sw.ElapsedMilliseconds} ms");
        }
        catch (Exception e)
        {
            Log.Line($"surface {s.Index}: re-parent failed ({e.GetType().Name}: {e.Message}); recreating");
            try { s.C?.Close(); } catch { }
            s.C = null; s.CC = null; s.D = null;
            s.Recreated++;
            await Create(s);
            Log.Line($"surface {s.Index}: recreated in {sw.ElapsedMilliseconds} ms");
        }
    }

    static async Task Sample(Surface s)
    {
        if (s.C == null) return;
        string raw;
        try { raw = await s.C.CoreWebView2.ExecuteScriptAsync(Probe); }
        catch (Exception e) { Log.Line($"surface {s.Index}: probe failed {e.GetType().Name}: {e.Message}"); return; }
        var json = JsonSerializer.Deserialize<string>(raw);
        if (json == null) return;
        using var d = JsonDocument.Parse(json);
        var n = d.RootElement.GetProperty("n").GetInt64();
        var vis = d.RootElement.GetProperty("vis").GetString() + "/" + d.RootElement.GetProperty("top").GetString();
        var origin = d.RootElement.GetProperty("origin").GetInt64();
        var tier = d.RootElement.GetProperty("q").ToString();
        var qfps = d.RootElement.GetProperty("qfps").ToString();
        var raf = d.RootElement.GetProperty("raf").GetInt64();
        var rm = d.RootElement.GetProperty("rm").GetBoolean();
        var t = Clock.Elapsed.TotalSeconds;
        if (s.Origin != 0 && origin != s.Origin) { s.Reloads++; s.LastN = -1; Log.Line($"surface {s.Index}: page reloaded (timeOrigin changed)"); }
        s.Origin = origin;
        var exposed = mode == "window" || Check.BarePoint(DesktopTree.Snapshot(), MonitorInfo.All(), null) != null;
        if (s.LastN >= 0 && n >= s.LastN)
        {
            var fps = (n - s.LastN) / (t - s.LastT);
            s.Samples.Add((t, fps, vis, exposed));
            var rafFps = s.LastRaf >= 0 && raf >= s.LastRaf ? (raf - s.LastRaf) / (t - s.LastT) : -1;
            if (rafFps >= 0) s.Raf.Add(rafFps);
            Log.Line($"fps surface={s.Index} t={t:F0} frames={n} fps={fps:F1} rawRaf={rafFps:F1} vis={vis} exposed={exposed} tier={tier} capFps={qfps} reducedMotion={rm}");
        }
        else Log.Line($"fps surface={s.Index} t={t:F0} frames={n} vis={vis} exposed={exposed} tier={tier} (first sample)");
        if (n >= 0) { s.LastN = n; s.LastT = t; s.LastRaf = raf; }
        if (inputOn)
        {
            var pc = JsonSerializer.Deserialize<string>(await s.C.CoreWebView2.ExecuteScriptAsync(PageCounter));
            Log.Line($"pointer surface={s.Index} sent moves={sentMoves} downs={sentDowns} ups={sentUps}; page got {pc}");
        }
    }

    static Surface? SurfaceAt(POINT p) =>
        Surfaces.FirstOrDefault(s => s.Index < Layer.Hosts.Count && Layer.Hosts[s.Index].Monitor.Rect.Contains(p));

    static Point Local(Surface s, POINT p) { var r = Layer.Hosts[s.Index].Monitor.Rect; return new Point(p.X - r.L, p.Y - r.T); }

    /// §10.25.8: moves go to the surface under the cursor even over app windows; leaving sends Leave.
    static void Move(POINT p)
    {
        var s = SurfaceAt(p);
        if (pointerIn != null && pointerIn != s && pointerIn.CC != null)
            pointerIn.CC.SendMouseInput(CoreWebView2MouseEventKind.Leave, CoreWebView2MouseEventVirtualKeys.None, 0, new Point(0, 0));
        pointerIn = s;
        if (s?.CC == null || !s.C!.IsVisible) return;
        s.CC.SendMouseInput(CoreWebView2MouseEventKind.Move, gesture ? CoreWebView2MouseEventVirtualKeys.LeftButton : CoreWebView2MouseEventVirtualKeys.None, 0, Local(s, p));
        sentMoves++;
    }

    /// Left button only, and only a press that starts on bare desktop; its release always follows.
    static void Press(int seq, bool down, POINT p, Input.Verdict v)
    {
        var s = SurfaceAt(p);
        if (s?.CC == null) { Log.Line($"click #{seq}: no visual surface there, not delivered"); return; }
        if (down && v.Kind == "bare")
        {
            gesture = true;
            fgBefore = N.GetForegroundWindow();   // Explorer, which the real click just went to
            if (clickVia == "script") _ = s.C!.CoreWebView2.ExecuteScriptAsync(ScriptPress(true, Local(s, p).X / s.C.RasterizationScale, Local(s, p).Y / s.C.RasterizationScale));
            else s.CC.SendMouseInput(CoreWebView2MouseEventKind.LeftButtonDown, CoreWebView2MouseEventVirtualKeys.LeftButton, 0, Local(s, p));
            sentDowns++;
            Log.Line($"click #{seq}: delivered down at {Local(s, p)} (CSS {Local(s, p).X / s.C!.RasterizationScale:F0},{Local(s, p).Y / s.C.RasterizationScale:F0})");
        }
        else if (!down && gesture)
        {
            gesture = false;
            if (clickVia == "script") _ = s.C!.CoreWebView2.ExecuteScriptAsync(ScriptPress(false, Local(s, p).X / s.C.RasterizationScale, Local(s, p).Y / s.C.RasterizationScale));
            else s.CC.SendMouseInput(CoreWebView2MouseEventKind.LeftButtonUp, CoreWebView2MouseEventVirtualKeys.None, 0, Local(s, p));
            sentUps++;
            Log.Line($"click #{seq}: delivered up at {Local(s, p)}");
            // WebView2 takes focus on a delivered press, activating our window: §10.25.2 anti-goal.
            var t = new System.Windows.Forms.Timer { Interval = 60 };
            t.Tick += (_, _) =>
            {
                t.Stop(); t.Dispose();
                var fg = N.GetForegroundWindow();
                var ours = N.PidOf(fg) == Environment.ProcessId || (env != null && env.GetProcessInfos().Any(i => i.ProcessId == N.PidOf(fg)));
                if (ours && refocus && fgBefore != IntPtr.Zero)
                {
                    var ok = N.SetForegroundWindow(fgBefore);
                    Log.Line($"click #{seq}: focus was taken by {N.ClassOf(fg)} \"{N.TextOf(fg)}\"; gave it back to {N.ClassOf(fgBefore)} ok={ok} now={N.ClassOf(N.GetForegroundWindow())}");
                }
                else Log.Line($"click #{seq}: foreground after delivery: {N.ClassOf(fg)} \"{N.TextOf(fg)}\"{(ours ? " (OURS)" : "")}");
            };
            t.Start();
        }
        else Log.Line($"click #{seq}: {(down ? "down" : "up")} on {v.Kind}, not delivered");
    }

    /// WebView2's visual-hosting input window (top-level Chrome_WidgetWin_1, layered alpha 0) swallows
    /// the desktop's first right-click until it's click-through (§10.25.8). Ours = in our environment's processes.
    static void FixOverlay()
    {
        if (env == null) return;
        var pids = env.GetProcessInfos().Select(p => p.ProcessId).ToHashSet();
        N.EnumWindows((h, _) =>
        {
            if (N.IsWindowVisible(h) && pids.Contains(N.PidOf(h)) && N.ClassOf(h) == "Chrome_WidgetWin_1")
            {
                var ex = N.ExStyle(h);
                if ((ex & N.WS_EX_LAYERED) != 0 && (ex & N.WS_EX_TRANSPARENT) == 0)
                {
                    N.SetWindowLongPtr(h, N.GWL_EXSTYLE, (IntPtr)(ex | N.WS_EX_TRANSPARENT));
                    Log.Line($"overlay: made {N.Hex(h)} click-through (ex 0x{ex:X8} -> 0x{N.ExStyle(h):X8})");
                }
            }
            return true;
        }, IntPtr.Zero);
    }

    static void SampleCpu()
    {
        if (env == null) return;
        var wall = Clock.Elapsed.TotalSeconds;
        var self = Environment.ProcessId;
        var pids = env.GetProcessInfos().Select(p => p.ProcessId).Append(self).Distinct().ToList();
        double app = 0, web = 0, mem = 0;
        foreach (var pid in pids)
        {
            try
            {
                using var p = Process.GetProcessById(pid);
                var cpu = p.TotalProcessorTime;
                if (CpuPrev.TryGetValue(pid, out var prev) && cpuWallPrev > 0)
                {
                    var pct = (cpu - prev).TotalSeconds / (wall - cpuWallPrev) * 100;
                    if (pid == self) app += pct; else web += pct;
                }
                if (pid != self) mem += p.PrivateMemorySize64 / 1048576.0;
                CpuPrev[pid] = cpu;
            }
            catch { }
        }
        if (cpuWallPrev > 0)
        {
            Cpu.Add((app, web, mem));
            Log.Line($"cpu t={wall:F0} app={app:F1}% webview={web:F1}% (of one core; {Environment.ProcessorCount} logical) webviewPrivateMB={mem:F0} procs={pids.Count}");
        }
        cpuWallPrev = wall;
    }

    static double Median(IEnumerable<double> xs)
    {
        var a = xs.OrderBy(x => x).ToArray();
        return a.Length == 0 ? 0 : a.Length % 2 == 1 ? a[a.Length / 2] : (a[a.Length / 2 - 1] + a[a.Length / 2]) / 2;
    }

    static void Summary()
    {
        foreach (var s in Surfaces)
        {
            var f = s.Samples.Select(x => x.fps).ToList();
            if (f.Count == 0) { Log.Line($"summary surface={s.Index}: no samples"); continue; }
            var med = Median(f);
            var baseline = refFps > 0 ? refFps : med;
            var low = s.Samples.FirstOrDefault(x => x.fps < 0.5 * baseline);
            var notVisible = s.Samples.Count(x => !x.vis.StartsWith("visible/visible"));
            var exposedMed = Median(s.Samples.Where(x => x.exposed).Select(x => x.fps));
            var coveredMed = Median(s.Samples.Where(x => !x.exposed).Select(x => x.fps));
            Log.Line($"summary surface={s.Index} hosting={hosting} args=\"{args}\" samples={f.Count} median={med:F1} min={f.Min():F1} max={f.Max():F1}" +
                $" exposedMedian={exposedMed:F1} ({s.Samples.Count(x => x.exposed)}) coveredMedian={coveredMed:F1} ({s.Samples.Count(x => !x.exposed)})" +
                $" notVisible={notVisible} reloads={s.Reloads} recreated={s.Recreated} rawRafMedian={Median(s.Raf):F1}" +
                (low.t > 0 ? $" firstBelowHalf=t{low.t:F0}" : ""));
            if (refFps > 0)
            {
                var pass = med >= 0.9 * refFps && f.Min() >= 0.5 * refFps && notVisible == 0;
                Log.Line($"verdict surface={s.Index}: {(pass ? "PASS" : "FAIL")} (median {med:F1} vs 0.9×R={0.9 * refFps:F1}, min {f.Min():F1} vs 0.5×R={0.5 * refFps:F1}, not visible {notVisible})");
            }
        }
        if (Cpu.Count > 0)
            Log.Line($"summary cpu app median={Median(Cpu.Select(c => c.app)):F1}% webview median={Median(Cpu.Select(c => c.web)):F1}% of one core, webview private MB median={Median(Cpu.Select(c => c.mem)):F0}");
        if (input != null)
            Log.Line($"summary input: raw moves={input.Moves} sent moves={sentMoves} downs={sentDowns} ups={sentUps}");
        input?.Stop();
        foreach (var s in Surfaces) try { s.C?.Close(); } catch { }
    }
}
