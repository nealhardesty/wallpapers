using System.Text;

namespace Wallpapers;

/// Every Win32 call the app makes (SPEC §10.25.4: hand-written P/Invoke in one file).
static class N
{
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int L, T, R, B; public readonly Rect ToRect() => new(L, T, R, B); }

    [StructLayout(LayoutKind.Sequential)]
    public struct POINT { public int X, Y; }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct MONITORINFOEX
    {
        public int cbSize; public RECT rcMonitor, rcWork; public uint dwFlags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string szDevice;
    }

    delegate bool MonitorEnumProc(IntPtr monitor, IntPtr hdc, ref RECT rect, IntPtr data);
    [DllImport("user32.dll")] static extern bool EnumDisplayMonitors(IntPtr hdc, IntPtr clip, MonitorEnumProc proc, IntPtr data);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool GetMonitorInfo(IntPtr monitor, ref MONITORINFOEX info);
    [DllImport("shcore.dll")] static extern int GetDpiForMonitor(IntPtr monitor, int type, out uint x, out uint y);
    const uint MONITORINFOF_PRIMARY = 1;

    /// The live monitors, in physical px (the process is PerMonitorV2), with device paths and names when known.
    public static List<MonitorInfo> Monitors()
    {
        var list = new List<MonitorInfo>();
        var config = DisplayConfig.ByGdiName();
        EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, (IntPtr m, IntPtr _, ref RECT _, IntPtr _) =>
        {
            var info = new MONITORINFOEX { cbSize = Marshal.SizeOf<MONITORINFOEX>() };
            if (GetMonitorInfo(m, ref info))
            {
                GetDpiForMonitor(m, 0, out var dpi, out _);   // MDT_EFFECTIVE_DPI
                var known = config.TryGetValue(info.szDevice, out var c);
                list.Add(new MonitorInfo(info.szDevice, info.rcMonitor.ToRect(), info.rcWork.ToRect(), (int)dpi, (info.dwFlags & MONITORINFOF_PRIMARY) != 0,
                    known ? c.Path : null, known && c.Name != "" ? c.Name : null));
            }
            return true;
        }, IntPtr.Zero);
        return list;
    }

    public static string ClassOf(IntPtr h) { var sb = new StringBuilder(256); GetClassName(h, sb, sb.Capacity); return sb.ToString(); }
    public static string TextOf(IntPtr h) { var sb = new StringBuilder(256); GetWindowText(h, sb, sb.Capacity); return sb.ToString(); }
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder sb, int n);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder sb, int n);

    // ---- Windows and the desktop tree ------------------------------------------------------
    public const uint WS_CHILD = 0x40000000, WS_POPUP = 0x80000000, WS_VISIBLE = 0x10000000, WS_CLIPCHILDREN = 0x02000000, WS_CLIPSIBLINGS = 0x04000000;
    public const uint WS_EX_LAYERED = 0x80000, WS_EX_NOACTIVATE = 0x08000000, WS_EX_TOOLWINDOW = 0x80, WS_EX_TRANSPARENT = 0x20;
    public const int GWL_STYLE = -16, GWL_EXSTYLE = -20;
    public const uint GW_HWNDNEXT = 2, GW_HWNDPREV = 3, GW_CHILD = 5;
    public const uint SWP_NOSIZE = 1, SWP_NOMOVE = 2, SWP_NOZORDER = 4, SWP_NOACTIVATE = 0x10, SWP_SHOWWINDOW = 0x40;
    public static readonly IntPtr HWND_TOP = IntPtr.Zero;
    public const uint LWA_ALPHA = 2, SMTO_NORMAL = 0;

    public delegate bool EnumWindowsProc(IntPtr h, IntPtr l);
    public delegate IntPtr WndProc(IntPtr h, int msg, IntPtr w, IntPtr l);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct WNDCLASSEX
    {
        public int cbSize; public uint style; public IntPtr lpfnWndProc; public int cbClsExtra, cbWndExtra;
        public IntPtr hInstance, hIcon, hCursor, hbrBackground; public string? lpszMenuName; public string lpszClassName; public IntPtr hIconSm;
    }

    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr l);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindow(string? cls, string? title);
    [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr h);
    [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h, uint cmd);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    /// A second launch lets the first bring its settings window forward (Windows only lets the
    /// foreground process do that, and the second launch is it).
    [DllImport("user32.dll")] public static extern bool AllowSetForegroundWindow(int pid);
    public const int ASFW_ANY = -1;
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out int pid);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] public static extern IntPtr GetWindowLongPtr(IntPtr h, int i);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")] public static extern IntPtr SetWindowLongPtr(IntPtr h, int i, IntPtr v);
    [DllImport("user32.dll", SetLastError = true)] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
    [DllImport("user32.dll", SetLastError = true)] public static extern bool SetLayeredWindowAttributes(IntPtr h, uint key, byte alpha, uint flags);
    [DllImport("user32.dll", SetLastError = true)] public static extern IntPtr SendMessageTimeout(IntPtr h, uint msg, IntPtr w, IntPtr l, uint flags, uint timeout, out IntPtr result);
    [DllImport("user32.dll")] public static extern int MapWindowPoints(IntPtr from, IntPtr to, ref RECT r, int n);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern IntPtr CreateWindowEx(uint ex, string cls, string title, uint style, int x, int y, int w, int h, IntPtr parent, IntPtr menu, IntPtr inst, IntPtr param);
    [DllImport("user32.dll", SetLastError = true)] public static extern bool DestroyWindow(IntPtr h);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] public static extern ushort RegisterClassEx(ref WNDCLASSEX wc);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern uint RegisterWindowMessage(string s);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr GetModuleHandle(string? name);
    [DllImport("gdi32.dll")] public static extern IntPtr GetStockObject(int i);
    public const int BLACK_BRUSH = 4;

    public static int PidOf(IntPtr h) { GetWindowThreadProcessId(h, out var pid); return pid; }
    public static uint ExStyle(IntPtr h) => (uint)GetWindowLongPtr(h, GWL_EXSTYLE);
    public static Rect RectOf(IntPtr h) { GetWindowRect(h, out var r); return r.ToRect(); }

    /// Direct children, top of the z-order first.
    public static List<IntPtr> Children(IntPtr parent)
    {
        var list = new List<IntPtr>();
        for (var c = GetWindow(parent, GW_CHILD); c != IntPtr.Zero; c = GetWindow(c, GW_HWNDNEXT)) list.Add(c);
        return list;
    }

    // ---- Power and the session (Power.cs, SPEC §10.25.9) -------------------------------------
    // Values checked against the Windows SDK 10.0.28000 headers (WinUser.h, WtsApi32.h, shellapi.h, winnt.h).
    public const int WM_POWERBROADCAST = 0x218, WM_WTSSESSION_CHANGE = 0x2B1;
    public const int PBT_APMSUSPEND = 4, PBT_APMRESUMESUSPEND = 7, PBT_APMRESUMEAUTOMATIC = 0x12, PBT_POWERSETTINGCHANGE = 0x8013;
    public const int WTS_CONSOLE_CONNECT = 1, WTS_CONSOLE_DISCONNECT = 2, WTS_REMOTE_CONNECT = 3, WTS_REMOTE_DISCONNECT = 4, WTS_SESSION_LOCK = 7, WTS_SESSION_UNLOCK = 8;
    public const int NOTIFY_FOR_THIS_SESSION = 0, DEVICE_NOTIFY_WINDOW_HANDLE = 0;
    public const int QUNS_RUNNING_D3D_FULL_SCREEN = 3, QUNS_PRESENTATION_MODE = 4;
    public const uint SPI_GETSCREENSAVERRUNNING = 0x72;
    public const int SM_REMOTESESSION = 0x1000;
    public static readonly Guid GUID_CONSOLE_DISPLAY_STATE = new("6FE69556-704A-47A0-8F24-C28D936FDA47");
    public static readonly Guid GUID_ACDC_POWER_SOURCE = new("5D3E9A59-E9D5-4B00-A6BD-FF34FF516548");
    public static readonly Guid GUID_BATTERY_PERCENTAGE_REMAINING = new("A7AD8041-B45A-4CAE-87A3-EECBB468A9E1");
    /// Windows 11 24H2 ("Germanium", build 26100) on; before it, GUID_POWER_SAVING_STATUS.
    public static readonly Guid GUID_ENERGY_SAVER_STATUS = new("550E8400-E29B-41D4-A716-446655440000");
    public static readonly Guid GUID_POWER_SAVING_STATUS = new("E00958C0-C213-4ACE-AC77-FECCED2EEEA5");

    [DllImport("wtsapi32.dll", SetLastError = true)] public static extern bool WTSRegisterSessionNotification(IntPtr h, int flags);
    [DllImport("wtsapi32.dll")] public static extern bool WTSUnRegisterSessionNotification(IntPtr h);
    [DllImport("wtsapi32.dll", EntryPoint = "WTSQuerySessionInformationW", SetLastError = true)]
    static extern bool WTSQuerySessionInformation(IntPtr server, int session, int infoClass, out IntPtr buffer, out int bytes);
    [DllImport("wtsapi32.dll")] static extern void WTSFreeMemory(IntPtr p);
    [DllImport("user32.dll", SetLastError = true)] public static extern IntPtr RegisterPowerSettingNotification(IntPtr h, in Guid setting, int flags);
    [DllImport("user32.dll")] public static extern bool UnregisterPowerSettingNotification(IntPtr registration);
    [DllImport("shell32.dll")] public static extern int SHQueryUserNotificationState(out int state);
    [DllImport("user32.dll", EntryPoint = "SystemParametersInfoW")] public static extern bool SystemParametersInfo(uint action, uint param, out int value, uint winIni);
    [DllImport("user32.dll")] public static extern int GetSystemMetrics(int index);

    [StructLayout(LayoutKind.Sequential)]
    public struct SYSTEM_POWER_STATUS { public byte ACLineStatus, BatteryFlag, BatteryLifePercent, SystemStatusFlag; public int BatteryLifeTime, BatteryFullLifeTime; }
    [DllImport("kernel32.dll")] public static extern bool GetSystemPowerStatus(out SYSTEM_POWER_STATUS status);

    const int WTS_CURRENT_SESSION = -1, WTSSessionInfoEx = 25, WTSDisconnected = 4;
    const int WTS_SESSIONSTATE_LOCK = 0, WTS_SESSIONSTATE_UNLOCK = 1;

    /// This session's lock and connection state (WTSINFOEXW level 1), or null when Windows can't say.
    public static (bool Locked, bool Disconnected)? SessionState()
    {
        if (!WTSQuerySessionInformation(IntPtr.Zero, WTS_CURRENT_SESSION, WTSSessionInfoEx, out var p, out var bytes)) return null;
        try
        {
            // WTSINFOEXW: DWORD Level, then the union (8-aligned: it holds LARGE_INTEGERs) whose level 1
            // starts ULONG SessionId, WTS_CONNECTSTATE_CLASS SessionState, LONG SessionFlags.
            if (bytes < 20 || Marshal.ReadInt32(p, 0) != 1) return null;
            var state = Marshal.ReadInt32(p, 12);
            var flags = Marshal.ReadInt32(p, 16);
            if (flags is not (WTS_SESSIONSTATE_LOCK or WTS_SESSIONSTATE_UNLOCK)) return null;   // WTS_SESSIONSTATE_UNKNOWN
            return (flags == WTS_SESSIONSTATE_LOCK, state == WTSDisconnected);
        }
        finally { WTSFreeMemory(p); }
    }

    /// The DWORD a PBT_POWERSETTINGCHANGE carries (POWERBROADCAST_SETTING: GUID PowerSetting,
    /// DWORD DataLength, UCHAR Data[]), or null when it's for another setting or too short.
    public static (Guid Setting, int Value)? PowerSetting(IntPtr l)
    {
        if (l == IntPtr.Zero) return null;
        var setting = Marshal.PtrToStructure<Guid>(l);
        var length = Marshal.ReadInt32(l, 16);
        return length >= 4 ? (setting, Marshal.ReadInt32(l, 20)) : null;
    }

    // ---- Coverage (Coverage.cs, SPEC §10.25.9) -----------------------------------------------
    // Values from the Windows SDK headers (WinUser.h, dwmapi.h).
    public const uint EVENT_SYSTEM_FOREGROUND = 0x3, EVENT_SYSTEM_MOVESIZEEND = 0xB, EVENT_SYSTEM_MINIMIZESTART = 0x16, EVENT_SYSTEM_MINIMIZEEND = 0x17;
    public const uint EVENT_OBJECT_SHOW = 0x8002, EVENT_OBJECT_HIDE = 0x8003, EVENT_OBJECT_LOCATIONCHANGE = 0x800B, EVENT_OBJECT_CLOAKED = 0x8017, EVENT_OBJECT_UNCLOAKED = 0x8018;
    public const uint WINEVENT_OUTOFCONTEXT = 0, WINEVENT_SKIPOWNPROCESS = 2;
    public const int OBJID_WINDOW = 0, CHILDID_SELF = 0;
    public const int DWMWA_EXTENDED_FRAME_BOUNDS = 9, DWMWA_CLOAKED = 14;

    public delegate void WinEventProc(IntPtr hook, uint ev, IntPtr h, int idObject, int idChild, uint thread, uint time);
    [DllImport("user32.dll")] public static extern IntPtr SetWinEventHook(uint min, uint max, IntPtr module, WinEventProc proc, uint pid, uint thread, uint flags);
    [DllImport("user32.dll")] public static extern bool UnhookWinEvent(IntPtr hook);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] public static extern bool GetLayeredWindowAttributes(IntPtr h, out uint key, out byte alpha, out uint flags);
    [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int attribute, out int value, int size);
    [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int attribute, out RECT value, int size);

    /// Cloaked by DWM: on another virtual desktop, behind Task View, or a suspended UWP app.
    public static bool IsCloaked(IntPtr h) => DwmGetWindowAttribute(h, DWMWA_CLOAKED, out int c, sizeof(int)) == 0 && c != 0;

    /// The visible frame (without the invisible resize border); the window rect when DWM can't say.
    public static Rect FrameOf(IntPtr h) =>
        DwmGetWindowAttribute(h, DWMWA_EXTENDED_FRAME_BOUNDS, out RECT r, Marshal.SizeOf<RECT>()) == 0 ? r.ToRect() : RectOf(h);

    /// Layered and fully transparent through SetLayeredWindowAttributes.
    public static bool IsLayeredAlphaZero(IntPtr h, uint ex) =>
        (ex & WS_EX_LAYERED) != 0 && GetLayeredWindowAttributes(h, out _, out var alpha, out var flags) && (flags & LWA_ALPHA) != 0 && alpha == 0;

    public static List<IntPtr> TopLevel(string cls)
    {
        var list = new List<IntPtr>();
        EnumWindows((h, _) => { if (ClassOf(h) == cls) list.Add(h); return true; }, IntPtr.Zero);
        return list;
    }
}
