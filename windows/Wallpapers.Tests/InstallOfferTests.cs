namespace Wallpapers.Tests;

public class InstallOfferTests
{
    static AppVersion V(string s) => AppVersion.Parse(s)!;

    [Fact]
    public void Not_installed_offers_install() =>
        Assert.Equal(Offer.Install, InstallOffer.Decide(V("0.11.0"), false, null, false, false));

    [Fact]
    public void Declined_once_is_not_asked_again() =>
        Assert.Equal(Offer.None, InstallOffer.Decide(V("0.11.0"), false, null, true, false));

    [Fact]
    public void A_newer_exe_offers_an_update_even_after_a_decline() =>
        Assert.Equal(Offer.Update, InstallOffer.Decide(V("0.11.0"), false, V("0.10.3"), true, false));

    [Fact]
    public void The_same_or_an_older_exe_just_runs()
    {
        Assert.Equal(Offer.None, InstallOffer.Decide(V("0.11.0"), false, V("0.11.0"), false, false));
        Assert.Equal(Offer.None, InstallOffer.Decide(V("0.10.3"), false, V("0.11.0"), false, false));
    }

    [Fact]
    public void Running_from_the_install_folder_never_offers() =>
        Assert.Equal(Offer.None, InstallOffer.Decide(V("0.12.0"), true, V("0.11.0"), false, false));

    [Fact]
    public void Just_run_offers_nothing() =>
        Assert.Equal(Offer.None, InstallOffer.Decide(V("0.12.0"), false, V("0.11.0"), false, true));
}
