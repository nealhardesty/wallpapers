namespace Wallpapers.Core;

public enum Offer { None, Install, Update }

/// Whether to ask the person to install or update (SPEC §10.25.13).
public static class InstallOffer
{
    /// Running from the install folder, or told to just run: never. Nothing installed: offer once (a decline
    /// is remembered). A strictly newer exe than the installed one: offer the update even after a decline.
    public static Offer Decide(AppVersion running, bool installedHere, AppVersion? installed, bool declined, bool justRun)
    {
        if (installedHere || justRun) return Offer.None;
        if (installed is null) return declined ? Offer.None : Offer.Install;
        return running > installed ? Offer.Update : Offer.None;
    }
}
