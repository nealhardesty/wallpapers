using System.Reflection;

namespace Wallpapers;

// Stub until the app lands (plan Task 5): proves the build, the copy and the launch.
static class Program
{
    [STAThread]
    static int Main()
    {
        var version = Assembly.GetExecutingAssembly().GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion ?? "?";
        var root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Wallpapers");
        Directory.CreateDirectory(root);
        File.AppendAllText(Path.Combine(root, "log.txt"), $"{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff} Wallpapers {version}{Environment.NewLine}");
        return 0;
    }
}
