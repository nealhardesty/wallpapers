using System.Reflection;

namespace Wallpapers;

// Stub until the app lands (plan Task 5): proves the build, the copy and the launch.
static class Program
{
    [STAThread]
    static int Main(string[] args)
    {
        var version = Assembly.GetExecutingAssembly().GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion ?? "?";
        var root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Wallpapers");
        Directory.CreateDirectory(root);
        File.AppendAllText(Path.Combine(root, "log.txt"), $"{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff} Wallpapers {version}{Environment.NewLine}");
        if (args.Contains("--dump-displays"))
            File.WriteAllText(Path.Combine(root, "displays.json"), Displays.ToJson(N.Monitors()));
        return 0;
    }
}
