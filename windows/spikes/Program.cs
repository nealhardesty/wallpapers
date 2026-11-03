// Phase W0 spikes: one subcommand per experiment (plan: docs/superpowers/plans/2026-11-03-windows-w0-spikes.md).
namespace Spike;

static class Program
{
    [STAThread]
    static int Main(string[] args)
    {
        var cmd = args.Length > 0 ? args[0] : "";
        var opts = new Opts(args.Skip(1).ToArray());
        try
        {
            return cmd switch
            {
                "tree" => DesktopTree.Run(opts),
                "check" => Check.Run(opts),
                "layer" => Layer.Run(opts),
                "repaint" => Repaint(),
                "stop" => Shell.Stop(),
                "show-desktop" => Check.ShowDesktop(),
                "menu" => Check.MenuOnly(),
                "motion" => Check.Motion(opts),
                "web" => Web.Run(opts),
                "cover" => Shell.Cover(opts),
                "restart-explorer" => Shell.RestartExplorer(),
                _ => Unknown(cmd),
            };
        }
        catch (Exception e)
        {
            Log.Line($"error {e}");
            return 1;
        }
    }

    static int Repaint() { Shell.Repaint(); return 0; }

    static int Unknown(string cmd)
    {
        Console.WriteLine($"unknown command: {cmd}");
        return 2;
    }
}

/// --name value / --flag options.
public sealed class Opts(string[] a)
{
    public string? Get(string name) { var i = Array.IndexOf(a, "--" + name); return i >= 0 && i + 1 < a.Length ? a[i + 1] : null; }
    public bool Has(string name) => a.Contains("--" + name);
    public int Int(string name, int def) => int.TryParse(Get(name), out var v) ? v : def;
}
