using System.Security.Cryptography;
using System.Text;

namespace Wallpapers.Core;

/// A monitor's stable id for `?display=` and `wp:current@<key>` (SPEC §10.25.6): `m-` and 6 hex digits of
/// SHA-256 of its lowercased device path, which survives reboots and RDP sessions; with no path, of
/// `gdi:` + its GDI name (which doesn't).
public static class DisplayKey
{
    public static string For(MonitorInfo m)
    {
        var source = string.IsNullOrEmpty(m.Path) ? "gdi:" + m.Device : m.Path.ToLowerInvariant();
        return "m-" + Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(source)))[..6];
    }
}
