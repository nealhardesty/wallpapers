using System.Diagnostics;
using System.Drawing;
using System.Text.Json;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;

namespace Spike;

/// W0.3: two processes (the app, and a stand-in saver, ideally run as Spike.scr) on one WebView2
/// user data folder. The writer sets wp:spike-share every 2 s; the reader logs the storage events
/// it receives and their latency, and keeps proving its own page is alive (plan Task 5).
public static class Share
{
    static string role = "reader", args = Web.DefaultArgs;
    static bool once;
    static int writes, received, alive;
    static readonly List<double> Latency = [];
    static CoreWebView2Controller? c;

    public static int Run(Opts o)
    {
        role = o.Get("role") ?? "reader";
        args = o.Get("args") ?? Web.DefaultArgs;
        if (args == "none") args = "";
        once = o.Has("once");
        var seconds = o.Int("seconds", 60);
        var exe = Path.GetFileName(Environment.ProcessPath ?? "?");
        Log.Line($"share role={role} exe={exe} pid={Environment.ProcessId} args=\"{args}\" seconds={seconds} once={once}");
        SynchronizationContext.SetSynchronizationContext(new WindowsFormsSynchronizationContext());
        var f = new Form { Text = $"W0.3 {role} ({exe})", ClientSize = new Size(480, 270), StartPosition = FormStartPosition.Manual,
            Location = new Point(role == "writer" ? 60 : 600, 60), BackColor = Color.DimGray };
        f.Shown += (_, _) => { f.WindowState = FormWindowState.Minimized; f.WindowState = FormWindowState.Normal; _ = Start(f); };
        var end = new System.Windows.Forms.Timer { Interval = seconds * 1000 };
        end.Tick += (_, _) => f.Close();
        end.Start();
        Application.Run(f);
        Log.Line($"summary role={role} exe={exe} writes={writes} received={received} aliveChecks={alive}" +
            (Latency.Count > 0 ? $" latency median={Latency.OrderBy(x => x).ElementAt(Latency.Count / 2):F0}ms max={Latency.Max():F0}ms" : ""));
        return 0;
    }

    static async Task Start(Form f)
    {
        CoreWebView2Environment env;
        try
        {
            env = await CoreWebView2Environment.CreateAsync(null, Path.GetFullPath("WebView2"), new CoreWebView2EnvironmentOptions(args));
            c = await env.CreateCoreWebView2ControllerAsync(f.Handle);
        }
        catch (Exception e)
        {
            // Mismatched options on a shared folder fail here (plan Task 5 step 5).
            Log.Line($"share: environment failed {e.GetType().Name} 0x{e.HResult:X8}: {e.Message}");
            f.Close();
            return;
        }
        c.Bounds = new Rectangle(0, 0, f.ClientSize.Width, f.ClientSize.Height);
        var wv = c.CoreWebView2;
        wv.SetVirtualHostNameToFolderMapping("wallpapers.example", Path.GetFullPath("web"), CoreWebView2HostResourceAccessKind.Deny);
        wv.ProcessFailed += (_, e) => Log.Line($"share: process failed kind={e.ProcessFailedKind} reason={e.Reason}");
        wv.NavigationCompleted += async (_, e) =>
        {
            Log.Line($"share: navigation ok={e.IsSuccess} browserPid={wv.BrowserProcessId} runtime={env.BrowserVersionString}");
            if (role == "writer") Every(2000, async () =>
            {
                await wv.ExecuteScriptAsync("localStorage.setItem('wp:spike-share', String(Date.now()))");
                writes++;
                if (writes % 5 == 0) Log.Line($"writer: {writes} writes");
            });
            else
            {
                var first = await wv.ExecuteScriptAsync(
                    "window.__ev = []; addEventListener('storage', e => { if (e.key === 'wp:spike-share') __ev.push([e.newValue, Date.now()]); });" +
                    " localStorage.getItem('wp:spike-share')");
                Log.Line($"reader: value on start {first} (age {Age(first)})");
                if (once) { f.Close(); return; }
                Every(2000, async () =>
                {
                    var raw = JsonSerializer.Deserialize<string>(await wv.ExecuteScriptAsync("JSON.stringify(__ev.splice(0))"));
                    using var doc = JsonDocument.Parse(raw!);   // [[newValue (string), receivedAt (number)], …]
                    foreach (var ev in doc.RootElement.EnumerateArray())
                    {
                        if (!double.TryParse(ev[0].GetString(), out var sent)) continue;
                        var got = ev[1].GetDouble();
                        received++;
                        Latency.Add(got - sent);
                        Log.Line($"reader: got #{received} latency={got - sent:F0}ms");
                    }
                });
                Every(10000, async () =>
                {
                    var now = await wv.ExecuteScriptAsync("Math.round(performance.now())");
                    alive++;
                    Log.Line($"reader: page alive (performance.now={now}) browserPid={wv.BrowserProcessId}");
                });
            }
        };
        wv.Navigate("https://wallpapers.example/index.html?w=blank");
    }

    static string Age(string json)
    {
        var v = JsonSerializer.Deserialize<string?>(json);
        return v != null && double.TryParse(v, out var t) ? $"{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - t:F0}ms" : "none";
    }

    static void Every(int ms, Func<Task> a)
    {
        var t = new System.Windows.Forms.Timer { Interval = ms };
        t.Tick += async (_, _) => { try { await a(); } catch (Exception e) { Log.Line($"share: {e.GetType().Name}: {e.Message}"); } };
        t.Start();
    }
}
