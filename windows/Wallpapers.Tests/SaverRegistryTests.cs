namespace Wallpapers.Tests;

public class SaverRegistryTests
{
    const string Ours = @"C:\Data\abc def\Local\Programs\Wallpapers\Wallpapers.scr";
    const string OursShort = @"C:\Data\ABCDEF~1\Local\Programs\Wallpapers\WALLPA~1.SCR";
    const string Ribbons = @"C:\Windows\System32\Ribbons.scr";

    static string Long(string p) => p == OursShort ? Ours : p;
    static string Same(string p) => p;

    [Fact]
    public void RunUsesTheRealKey()
    {
        Assert.Equal(@"Control Panel\Desktop", SaverRegistry.KeyFor("run"));
        Assert.Equal(@"Software\Policies\Microsoft\Windows\Control Panel\Desktop", SaverRegistry.PolicyKeyFor("run"));
    }

    [Theory]
    [InlineData("test")]
    [InlineData("dev")]
    public void OtherFlavorsNeverTouchTheRealKey(string flavor)
    {
        Assert.Equal($@"Software\Wallpapers-{flavor}\Control Panel\Desktop", SaverRegistry.KeyFor(flavor));
        Assert.NotEqual(SaverRegistry.DesktopKey, SaverRegistry.KeyFor(flavor), StringComparer.OrdinalIgnoreCase);
        Assert.Equal($@"Software\Wallpapers-{flavor}\Policies\Control Panel\Desktop", SaverRegistry.PolicyKeyFor(flavor));
        Assert.NotEqual(SaverRegistry.PolicyKey, SaverRegistry.PolicyKeyFor(flavor), StringComparer.OrdinalIgnoreCase);
    }

    [Fact]
    public void IsOurs_ComparesLongPathsIgnoringCase()
    {
        Assert.True(SaverRegistry.IsOurs(OursShort, Ours, Long));
        Assert.True(SaverRegistry.IsOurs(Ours.ToUpperInvariant(), Ours, Long));
        Assert.False(SaverRegistry.IsOurs(Ribbons, Ours, Long));
        Assert.False(SaverRegistry.IsOurs(null, Ours, Long));
        Assert.False(SaverRegistry.IsOurs("", Ours, Long));
    }

    [Fact]
    public void Restore_PutsBackTheOldSaver() =>
        Assert.Equal(new SaverRestore(Ribbons, "1"), SaverRestore.For(new PreviousSaver(Ribbons, "1"), Ours, Same));

    [Fact]
    public void Restore_NoOldSaverClearsOurs()
    {
        Assert.Equal(new SaverRestore(null, "0"), SaverRestore.For(null, Ours, Same));
        Assert.Equal(new SaverRestore(null, "1"), SaverRestore.For(new PreviousSaver(null, "1"), Ours, Same));
        Assert.Equal(new SaverRestore(null, "0"), SaverRestore.For(new PreviousSaver("", null), Ours, Same));
    }

    [Fact]
    public void Restore_OldValueThatWasOursClears() =>
        Assert.Equal(new SaverRestore(null, "0"), SaverRestore.For(new PreviousSaver(OursShort, "1"), Ours, Long));
}
