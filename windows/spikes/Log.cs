namespace Spike;

/// Timestamped lines to stdout and spike.log (in the working directory, the spike's folder).
static class Log
{
    static readonly object Gate = new();
    public static void Line(string s)
    {
        var line = $"{DateTime.Now:HH:mm:ss.fff} {s}";
        lock (Gate)
        {
            Console.WriteLine(line);
            try { File.AppendAllText("spike.log", line + Environment.NewLine); } catch { }
        }
    }
}
