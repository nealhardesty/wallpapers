namespace Wallpapers;

/// Each active monitor's device path and friendly name, by its GDI name (`\\.\DISPLAY1`), from
/// QueryDisplayConfig (SPEC §10.25.6). The path is what display keys hash: it survives reboots, port
/// changes and RDP sessions, which hand out new GDI names. Empty when Windows won't say (some RDP
/// sessions); that's logged once and keys fall back to the GDI name.
static class DisplayConfig
{
    public static IReadOnlyDictionary<string, (string Path, string Name)> ByGdiName()
    {
        var found = new Dictionary<string, (string, string)>(StringComparer.OrdinalIgnoreCase);
        if (!SizesOk()) { Once("DisplayConfig: struct sizes don't match wingdi.h; no device paths"); return found; }
        PATH_INFO[] paths;
        MODE_INFO[] modes;
        int error;
        do
        {
            error = GetDisplayConfigBufferSizes(QDC_ONLY_ACTIVE_PATHS, out var pathCount, out var modeCount);
            if (error != 0) { Once($"DisplayConfig: GetDisplayConfigBufferSizes failed ({error}); no device paths"); return found; }
            paths = new PATH_INFO[pathCount];
            modes = new MODE_INFO[modeCount];
            error = QueryDisplayConfig(QDC_ONLY_ACTIVE_PATHS, ref pathCount, paths, ref modeCount, modes, IntPtr.Zero);
            Array.Resize(ref paths, (int)pathCount);
        } while (error == ERROR_INSUFFICIENT_BUFFER);   // the layout changed between the two calls
        if (error != 0) { Once($"DisplayConfig: QueryDisplayConfig failed ({error}); no device paths"); return found; }

        foreach (var p in paths)
        {
            var source = new SOURCE_DEVICE_NAME { header = Header(GET_SOURCE_NAME, Marshal.SizeOf<SOURCE_DEVICE_NAME>(), p.sourceAdapter, p.sourceId) };
            var target = new TARGET_DEVICE_NAME { header = Header(GET_TARGET_NAME, Marshal.SizeOf<TARGET_DEVICE_NAME>(), p.targetAdapter, p.targetId) };
            if (DisplayConfigGetDeviceInfo(ref source) != 0 || DisplayConfigGetDeviceInfo(ref target) != 0) continue;
            if (string.IsNullOrEmpty(source.viewGdiDeviceName) || string.IsNullOrEmpty(target.monitorDevicePath)) continue;
            // Mirrored (cloned) monitors share a source: the first path keeps the GDI name.
            found.TryAdd(source.viewGdiDeviceName, (target.monitorDevicePath, target.monitorFriendlyDeviceName ?? ""));
        }
        return found;
    }

    static bool warned;
    static void Once(string text) { if (!warned) { warned = true; Log.Warn(text); } }

    /// The sizes wingdi.h gives; a wrong layout would read garbage, so it's checked before any call.
    static bool SizesOk() => Marshal.SizeOf<PATH_INFO>() == 72 && Marshal.SizeOf<MODE_INFO>() == 64
        && Marshal.SizeOf<TARGET_DEVICE_NAME>() == 420 && Marshal.SizeOf<SOURCE_DEVICE_NAME>() == 84;

    static DEVICE_INFO_HEADER Header(int type, int size, LUID adapter, uint id) => new() { type = type, size = size, adapterId = adapter, id = id };

    const uint QDC_ONLY_ACTIVE_PATHS = 2;
    const int ERROR_INSUFFICIENT_BUFFER = 122;
    const int GET_SOURCE_NAME = 1, GET_TARGET_NAME = 2;   // DISPLAYCONFIG_DEVICE_INFO_TYPE

    [StructLayout(LayoutKind.Sequential)] struct LUID { public uint LowPart; public int HighPart; }

    /// DISPLAYCONFIG_PATH_INFO: the source info (20 bytes), the target info (48) and flags.
    [StructLayout(LayoutKind.Sequential)]
    struct PATH_INFO
    {
        public LUID sourceAdapter; public uint sourceId, sourceModeInfoIdx, sourceStatusFlags;
        public LUID targetAdapter; public uint targetId, targetModeInfoIdx, outputTechnology, rotation, scaling;
        public uint refreshNumerator, refreshDenominator, scanLineOrdering; public int targetAvailable; public uint targetStatusFlags;
        public uint flags;
    }

    /// DISPLAYCONFIG_MODE_INFO: only its size matters here (the union is padded out to 64).
    [StructLayout(LayoutKind.Sequential, Size = 64)]
    struct MODE_INFO { public uint infoType, id; public LUID adapterId; }

    [StructLayout(LayoutKind.Sequential)]
    struct DEVICE_INFO_HEADER { public int type, size; public LUID adapterId; public uint id; }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct SOURCE_DEVICE_NAME
    {
        public DEVICE_INFO_HEADER header;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string viewGdiDeviceName;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct TARGET_DEVICE_NAME
    {
        public DEVICE_INFO_HEADER header;
        public uint flags, outputTechnology; public ushort edidManufactureId, edidProductCodeId; public uint connectorInstance;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)] public string monitorFriendlyDeviceName;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string monitorDevicePath;
    }

    [DllImport("user32.dll")] static extern int GetDisplayConfigBufferSizes(uint flags, out uint paths, out uint modes);
    [DllImport("user32.dll")]
    static extern int QueryDisplayConfig(uint flags, ref uint pathCount, [Out] PATH_INFO[] paths, ref uint modeCount, [Out] MODE_INFO[] modes, IntPtr topology);
    [DllImport("user32.dll")] static extern int DisplayConfigGetDeviceInfo(ref SOURCE_DEVICE_NAME request);
    [DllImport("user32.dll")] static extern int DisplayConfigGetDeviceInfo(ref TARGET_DEVICE_NAME request);
}
