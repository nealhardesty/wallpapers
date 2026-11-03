using System.IO.Pipes;

namespace Wallpapers;

/// One app per data folder (SPEC §10.25.13): a named mutex, and a pipe a second launch (or
/// --quit, --settings, a reload from make win-dev) uses to talk to the first.
static class SingleInstance
{
    static Mutex? mutex;
    static string Name(string flavor) => $"Wallpapers-{flavor}";

    public static bool TryBecomeFirst(string flavor)
    {
        mutex = new Mutex(true, $@"Local\{Name(flavor)}", out var first);
        return first;
    }

    /// Commands arrive on the calling thread's synchronization context (the UI thread).
    public static void Listen(string flavor, Action<string> onCommand)
    {
        var ui = SynchronizationContext.Current ?? throw new InvalidOperationException("Listen from the UI thread");
        new Thread(() =>
        {
            while (true)
            {
                try
                {
                    using var pipe = new NamedPipeServerStream(Name(flavor), PipeDirection.In, 1);
                    pipe.WaitForConnection();
                    using var reader = new StreamReader(pipe);
                    var command = reader.ReadLine()?.Trim();
                    if (!string.IsNullOrEmpty(command)) ui.Post(_ => onCommand(command), null);
                }
                catch (IOException e) { Log.Warn($"pipe: {e.Message}"); Thread.Sleep(500); }
            }
        }) { IsBackground = true, Name = "pipe" }.Start();
    }

    public static bool Send(string flavor, string command)
    {
        try
        {
            using var pipe = new NamedPipeClientStream(".", Name(flavor), PipeDirection.Out);
            pipe.Connect(1000);
            using var writer = new StreamWriter(pipe) { AutoFlush = true };
            writer.WriteLine(command);
            return true;
        }
        catch (Exception e) when (e is TimeoutException or IOException) { return false; }
    }
}
