using System.Text;

namespace Wallpapers.Core;

/// Appends whole lines; past maxBytes the file becomes log.old.txt (replacing any older one) and a
/// new one starts (SPEC §10.25.4: rolls at 1 MB, keeps one old). Safe to call from any thread.
public sealed class RollingLog(string path, long maxBytes = 1_048_576)
{
    readonly object gate = new();
    readonly string old = Path.Combine(Path.GetDirectoryName(path) ?? ".", Path.GetFileNameWithoutExtension(path) + ".old" + Path.GetExtension(path));

    public void Write(string line)
    {
        var bytes = Encoding.UTF8.GetBytes(line + Environment.NewLine);
        lock (gate)
        {
            var size = File.Exists(path) ? new FileInfo(path).Length : 0;
            if (size > 0 && size + bytes.Length > maxBytes) File.Move(path, old, overwrite: true);
            using var file = new FileStream(path, FileMode.Append, FileAccess.Write, FileShare.ReadWrite);
            file.Write(bytes);
        }
    }
}
