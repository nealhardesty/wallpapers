namespace Wallpapers.Tests;

public class RollingLogTests
{
    [Fact]
    public void Rolls_past_the_limit_and_keeps_one_old_file()
    {
        using var dir = new TempDir();
        var log = new RollingLog(dir.File("log.txt"), maxBytes: 1000);
        for (var i = 0; i < 100; i++) log.Write($"line {i:D3} " + new string('x', 40));
        Assert.True(new FileInfo(dir.File("log.txt")).Length <= 1000);
        Assert.True(File.Exists(dir.File("log.old.txt")));
        Assert.Equal(["log.old.txt", "log.txt"], Directory.GetFiles(dir.Path).Select(Path.GetFileName).Order());
        Assert.Contains("line 099", File.ReadAllText(dir.File("log.txt")));
    }

    [Fact]
    public void Concurrent_writes_never_interleave_lines()
    {
        using var dir = new TempDir();
        var log = new RollingLog(dir.File("log.txt"));
        Parallel.For(0, 400, i => log.Write($"thread line {i} " + new string('y', 60)));
        var lines = File.ReadAllLines(dir.File("log.txt"));
        Assert.Equal(400, lines.Length);
        Assert.All(lines, l => Assert.Matches(@"^thread line \d+ y{60}$", l));
    }
}
