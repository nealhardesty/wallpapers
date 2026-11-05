using System.Text.Json;

namespace Wallpapers.Core;

/// One window in a snapshot of Explorer's desktop windows (Progman, top-level WorkerWs and their
/// descendants). Z is the window's index among its siblings, 0 = top.
public sealed record WindowNode(long Handle, long Parent, string Class, int Pid, bool Visible, Rect Bounds, int Z);

public enum ShapeKind
{
    /// 24H2+: the icon view (SHELLDLL_DefView) is a child of Progman; the wallpaper layer is Progman's WorkerW child.
    Raised,
    /// ≤ 23H2 after 0x052C: two top-level WorkerWs; the one without the icons is the layer.
    Classic,
    /// 0x052C was sent and no layer appeared: nowhere to go behind the icons.
    NotSplit,
    /// No Progman: Explorer isn't running (login, a restart, a crash).
    NoShell,
}

/// What the desktop looks like and where our hosts go. Layer is 0 when it doesn't exist (yet).
public sealed record Shape(ShapeKind Kind, long Progman, long DefView, long Layer);

/// Reads the desktop's window tree (SPEC §10.25.3, §10.25.5; W0.1 in §10.25.21).
public static class DesktopShape
{
    /// messageSent: 0x052C has already been sent and waited for. Before it, a classic desktop and an
    /// unsplit one look the same (Progman holding the icons, no layer), so NotSplit needs it.
    public static Shape Detect(IReadOnlyList<WindowNode> tree, bool messageSent)
    {
        var progman = tree.FirstOrDefault(n => n.Parent == 0 && n.Class == "Progman");
        if (progman is null) return new Shape(ShapeKind.NoShell, 0, 0, 0);
        var pid = progman.Pid;
        // Many processes own WorkerW windows; only Explorer's visible ones are the desktop's.
        bool Explorers(WindowNode n) => n.Pid == pid && n.Visible;
        var defView = tree.FirstOrDefault(n => n.Class == "SHELLDLL_DefView" && n.Pid == pid);

        if (defView is not null && defView.Parent != progman.Handle)
        {
            var front = tree.FirstOrDefault(n => n.Handle == defView.Parent);
            if (front is { Class: "WorkerW", Parent: 0 })
            {
                var holdsIcons = tree.Where(n => n.Class == "SHELLDLL_DefView").Select(n => n.Parent).ToHashSet();
                var back = tree.FirstOrDefault(n => n.Parent == 0 && n.Class == "WorkerW" && Explorers(n)
                    && n.Handle != front.Handle && !holdsIcons.Contains(n.Handle));
                return new Shape(ShapeKind.Classic, progman.Handle, defView.Handle, back?.Handle ?? 0);
            }
        }

        var layer = tree.Where(n => n.Parent == progman.Handle && n.Class == "WorkerW" && Explorers(n)).OrderBy(n => n.Z).FirstOrDefault();
        if (layer is not null) return new Shape(ShapeKind.Raised, progman.Handle, defView?.Handle ?? 0, layer.Handle);
        return messageSent
            ? new Shape(ShapeKind.NotSplit, progman.Handle, defView?.Handle ?? 0, 0)
            : new Shape(ShapeKind.Raised, progman.Handle, defView?.Handle ?? 0, 0);
    }

    public static bool NeedsLayerMessage(Shape s) => s.Kind is ShapeKind.Raised or ShapeKind.Classic && s.Layer == 0;

    /// The host's parent and the window it goes directly below (0 = the top of the parent's children).
    public static (long Parent, long InsertAfter) AttachTarget(Shape s) => s switch
    {
        { Kind: ShapeKind.Raised, Layer: not 0 } => (s.Progman, s.DefView),
        { Kind: ShapeKind.Classic, Layer: not 0 } => (s.Layer, 0),
        _ => (0, 0),
    };

    /// Raised: the host sits directly below the icon view and above Explorer's own wallpaper.
    /// Classic: it only has to be inside the layer.
    public static bool ZOk(Shape s, IReadOnlyList<long> parentChildrenTopFirst, long host)
    {
        var at = IndexOf(parentChildrenTopFirst, host);
        if (at < 0) return false;
        if (s.Kind != ShapeKind.Raised) return true;
        var icons = IndexOf(parentChildrenTopFirst, s.DefView);
        var layer = IndexOf(parentChildrenTopFirst, s.Layer);
        return icons >= 0 && at > icons && (layer < 0 || at < layer);
    }

    static int IndexOf(IReadOnlyList<long> list, long value)
    {
        for (var i = 0; i < list.Count; i++) if (list[i] == value) return i;
        return -1;
    }

    sealed record TreeFile(List<WindowNode> Nodes);

    static readonly JsonSerializerOptions Options = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase, WriteIndented = true };

    public static IReadOnlyList<WindowNode> TreeFromJson(string json) =>
        JsonSerializer.Deserialize<TreeFile>(json, Options)?.Nodes ?? throw new FormatException("no nodes");

    public static string TreeToJson(IReadOnlyList<WindowNode> tree) => JsonSerializer.Serialize(new TreeFile([.. tree]), Options);
}
