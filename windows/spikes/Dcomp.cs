namespace Spike;

// The least DirectComposition needed for WebView2 visual hosting (plan Task 4 step 5):
// a device, a target bound to our host HWND, and one root visual WebView2 draws into.
// Interfaces declare vtable slots in order, up to the last one called.

[ComImport, Guid("C37EA93A-E7AA-450D-B16F-9746CB0407F3"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IDCompositionDevice
{
    [PreserveSig] int Commit();
    [PreserveSig] int WaitForCommitCompletion();
    [PreserveSig] int GetFrameStatistics(IntPtr statistics);
    [PreserveSig] int CreateTargetForHwnd(IntPtr hwnd, [MarshalAs(UnmanagedType.Bool)] bool topmost, out IDCompositionTarget target);
    [PreserveSig] int CreateVisual(out IDCompositionVisual visual);
}

[ComImport, Guid("EACDD04C-117E-4E17-88F4-D1B12B0E3D89"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IDCompositionTarget
{
    [PreserveSig] int SetRoot(IDCompositionVisual visual);
}

[ComImport, Guid("4D93059D-097B-4651-9A60-F0F25116E2F3"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IDCompositionVisual { }

public sealed class Dcomp
{
    [DllImport("dcomp.dll")]
    static extern int DCompositionCreateDevice2(IntPtr renderingDevice, ref Guid iid, [MarshalAs(UnmanagedType.IUnknown)] out object device);

    public readonly IDCompositionDevice Device;
    public IDCompositionVisual Visual;
    IDCompositionTarget? target;

    public Dcomp()
    {
        var iid = typeof(IDCompositionDevice).GUID;
        Check(DCompositionCreateDevice2(IntPtr.Zero, ref iid, out var dev), "DCompositionCreateDevice2");
        Device = (IDCompositionDevice)dev;
        Check(Device.CreateVisual(out Visual), "CreateVisual");
    }

    /// Bind (or re-bind, after an Explorer restart recreated the host) the visual tree to a window.
    /// A visual can be the root of only one target: detach it from the old (dead) host's target
    /// first; if that fails, start a fresh visual (the caller re-points RootVisualTarget). Returns
    /// true when the visual was replaced.
    public bool BindTo(IntPtr hwnd)
    {
        var replaced = false;
        if (target != null)
        {
            var hr = target.SetRoot(null!);
            Log.Line($"dcomp: detach from old target (r1) hr=0x{hr:X8}");
            Marshal.ReleaseComObject(target);
            target = null;
            Device.Commit();
            if (hr < 0) { Check(Device.CreateVisual(out Visual), "CreateVisual"); replaced = true; }
        }
        Check(Device.CreateTargetForHwnd(hwnd, true, out var t), "CreateTargetForHwnd");
        var set = t.SetRoot(Visual);
        if (set < 0 && !replaced)
        {
            Log.Line($"dcomp: SetRoot hr=0x{set:X8}; using a fresh visual");
            Check(Device.CreateVisual(out Visual), "CreateVisual");
            set = t.SetRoot(Visual);
            replaced = true;
        }
        Check(set, "SetRoot");
        target = t;
        Check(Device.Commit(), "Commit");
        return replaced;
    }

    static void Check(int hr, string what)
    {
        if (hr < 0) throw new COMException($"{what} failed 0x{hr:X8}", hr);
    }
}
