namespace Wallpapers.Core;

public enum InstallMode { None, Install, Uninstall, UninstallStage2 }

/// The install-related command line (SPEC §10.25.13). Stage 2 is the copy of the exe that runs from a
/// temporary folder to delete the install folder; it carries that folder as Root.
public sealed record InstallArgs(InstallMode Mode, bool? KeepSettings, bool JustRun, string? Root)
{
    public static InstallArgs Parse(string[] args)
    {
        var mode = InstallMode.None;
        bool? keep = null;
        string? root = null;
        for (var i = 0; i < args.Length; i++)
            switch (args[i])
            {
                case "--install": mode = InstallMode.Install; break;
                case "--uninstall": mode = InstallMode.Uninstall; break;
                case "--uninstall-stage2" when i + 1 < args.Length:
                    mode = InstallMode.UninstallStage2;
                    root = args[++i];
                    break;
                case "--keep-settings": keep = true; break;
                case "--delete-settings": keep = false; break;
            }
        return new InstallArgs(mode, keep, args.Contains("--just-run"), root);
    }
}
