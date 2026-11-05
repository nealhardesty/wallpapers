namespace Wallpapers.Tests;

public class InstallArgsTests
{
    [Fact]
    public void Plain_start_is_no_mode()
    {
        Assert.Equal(new InstallArgs(InstallMode.None, null, false, null), InstallArgs.Parse([]));
        Assert.True(InstallArgs.Parse(["--just-run"]).JustRun);
    }

    [Fact]
    public void Install_is_a_mode() => Assert.Equal(InstallMode.Install, InstallArgs.Parse(["--install"]).Mode);

    [Fact]
    public void Uninstall_asks_unless_told()
    {
        Assert.Equal(InstallMode.Uninstall, InstallArgs.Parse(["--uninstall"]).Mode);
        Assert.Null(InstallArgs.Parse(["--uninstall"]).KeepSettings);
        Assert.True(InstallArgs.Parse(["--uninstall", "--keep-settings"]).KeepSettings);
        Assert.False(InstallArgs.Parse(["--uninstall", "--delete-settings"]).KeepSettings);
    }

    [Fact]
    public void Stage2_carries_the_root()
    {
        Assert.Equal(new InstallArgs(InstallMode.UninstallStage2, true, false, @"C:\p\Wallpapers"),
            InstallArgs.Parse(["--uninstall-stage2", @"C:\p\Wallpapers", "--keep-settings"]));
        Assert.Equal(InstallMode.None, InstallArgs.Parse(["--uninstall-stage2"]).Mode);
    }
}
