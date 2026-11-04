namespace Wallpapers;

// The least DirectComposition WebView2 visual hosting needs (SPEC §10.25.3, W0.2): a device, a
// target bound to a host window, and one root visual WebView2 draws into. Interfaces declare their
// vtable slots in order, up to the last one called.

[ComImport, Guid("C37EA93A-E7AA-450D-B16F-9746CB0407F3"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IDCompositionDevice
{
    [PreserveSig] int Commit();
    [PreserveSig] int WaitForCommitCompletion();
    [PreserveSig] int GetFrameStatistics(IntPtr statistics);
    [PreserveSig] int CreateTargetForHwnd(IntPtr hwnd, [MarshalAs(UnmanagedType.Bool)] bool topmost, out IDCompositionTarget target);
    [PreserveSig] int CreateVisual(out IDCompositionVisual visual);
}

[ComImport, Guid("EACDD04C-117E-4E17-88F4-D1B12B0E3D89"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IDCompositionTarget
{
    [PreserveSig] int SetRoot(IDCompositionVisual? visual);
}

[ComImport, Guid("4D93059D-097B-4651-9A60-F0F25116E2F3"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IDCompositionVisual { }

sealed class Dcomp : IDisposable
{
    [DllImport("dcomp.dll")]
    static extern int DCompositionCreateDevice2(IntPtr renderingDevice, ref Guid iid, [MarshalAs(UnmanagedType.IUnknown)] out object device);

    readonly IDCompositionDevice device;
    IDCompositionTarget? target;
    public IDCompositionVisual Visual { get; private set; }

    public Dcomp()
    {
        var iid = typeof(IDCompositionDevice).GUID;
        Check(DCompositionCreateDevice2(IntPtr.Zero, ref iid, out var d), "DCompositionCreateDevice2");
        device = (IDCompositionDevice)d;
        Check(device.CreateVisual(out var visual), "CreateVisual");
        Visual = visual;
    }

    /// Bind the visual tree to a window: first time, or after an Explorer restart recreated the host.
    /// A visual is the root of one target at a time, so it's detached from the old (dead) host's
    /// target first; if that fails, a fresh visual is made. True when the visual was replaced (the
    /// caller then points the controller's RootVisualTarget at it).
    public bool BindTo(IntPtr hwnd)
    {
        var replaced = false;
        if (target != null)
        {
            var detached = target.SetRoot(null);
            Marshal.ReleaseComObject(target);
            target = null;
            device.Commit();
            if (detached < 0) { Check(device.CreateVisual(out var fresh), "CreateVisual"); Visual = fresh; replaced = true; }
        }
        Check(device.CreateTargetForHwnd(hwnd, true, out var t), "CreateTargetForHwnd");
        var set = t.SetRoot(Visual);
        if (set < 0 && !replaced)
        {
            Check(device.CreateVisual(out var fresh), "CreateVisual");
            Visual = fresh;
            replaced = true;
            set = t.SetRoot(Visual);
        }
        Check(set, "SetRoot");
        target = t;
        Commit();
        return replaced;
    }

    public void Commit() => Check(device.Commit(), "Commit");

    public void Dispose()
    {
        if (target != null) { target.SetRoot(null); Marshal.ReleaseComObject(target); target = null; }
        try { device.Commit(); } catch (COMException) { }
        Marshal.ReleaseComObject(Visual);
        Marshal.ReleaseComObject(device);
    }

    static void Check(int hr, string what)
    {
        if (hr < 0) throw new COMException($"{what} failed 0x{hr:X8}", hr);
    }
}
