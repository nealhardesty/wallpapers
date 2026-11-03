# W0.2 (SPEC §10.25.8, §10.25.21): WebView2 visual hosting's full-screen input window.
#   -how transparent   add WS_EX_TRANSPARENT to it (the fix); -how disable: EnableWindow(false) (no help)
#   -click             then right-click bare desktop twice and count Explorer's menu popups
# Run from WSL: powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$(wslpath -w windows/spikes/input-fix.ps1)" -how transparent -click
param([string]$how = "none", [switch]$click)
$src = @'
using System; using System.Runtime.InteropServices; using System.Text; using System.Threading;
public static class V {
  [StructLayout(LayoutKind.Sequential)] public struct P { public int X, Y; }
  [StructLayout(LayoutKind.Sequential)] public struct R { public int L, T, Rr, B; }
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(P p);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h, uint f);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h, uint c);
  [DllImport("user32.dll")] public static extern bool GetLayeredWindowAttributes(IntPtr h, out uint k, out byte a, out uint f);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int s);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, int x, int y, uint d, IntPtr e);
  [DllImport("user32.dll")] public static extern void keybd_event(byte v, byte s, uint f, IntPtr e);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  public static int Menus() { int n = 0; EnumWindows((h, l) => { uint pid; GetWindowThreadProcessId(h, out pid); string pn = ""; try { pn = System.Diagnostics.Process.GetProcessById((int)pid).ProcessName; } catch {}
      if (IsWindowVisible(h) && pn == "explorer" && Cls(h) == "Microsoft.UI.Content.PopupWindowSiteBridge") n++; return true; }, IntPtr.Zero); return n; }
  [DllImport("user32.dll")] public static extern bool EnableWindow(IntPtr h, bool e);
  [DllImport("user32.dll")] public static extern int SetWindowLong(IntPtr h, int i, int v);
  public static IntPtr Overlay() { IntPtr found = IntPtr.Zero; EnumWindows((h, l) => { uint pid; GetWindowThreadProcessId(h, out pid); string pn = ""; try { pn = System.Diagnostics.Process.GetProcessById((int)pid).ProcessName; } catch {}
      if (IsWindowVisible(h) && pn == "msedgewebview2" && Cls(h) == "Chrome_WidgetWin_1" && (GetWindowLong(h, -20) & 0x80000) != 0) { found = h; return false; } return true; }, IntPtr.Zero); return found; }
  public static string Fix(string how) { var h = Overlay(); if (h == IntPtr.Zero) return "no overlay found";
    if (how == "disable") EnableWindow(h, false);
    if (how == "transparent") SetWindowLong(h, -20, GetWindowLong(h, -20) | 0x20);
    return "fix " + how + " on " + Describe(h); }
  static string Cls(IntPtr h) { var s = new StringBuilder(256); GetClassName(h, s, 256); return s.ToString(); }
  public static string Describe(IntPtr h) {
    R r; GetWindowRect(h, out r); uint pid; GetWindowThreadProcessId(h, out pid);
    uint k; byte a = 0; uint f = 0; bool lay = GetLayeredWindowAttributes(h, out k, out a, out f);
    int cloaked; DwmGetWindowAttribute(h, 14, out cloaked, 4);
    var owner = GetWindow(h, 4);
    return Cls(h) + " 0x" + h.ToString("X") + " style=0x" + GetWindowLong(h, -16).ToString("X8") + " ex=0x" + GetWindowLong(h, -20).ToString("X8")
      + " rect=" + r.L + "," + r.T + "," + r.Rr + "," + r.B + " visible=" + IsWindowVisible(h) + " layeredAttr=" + (lay ? ("alpha " + a + " flags " + f) : "none")
      + " cloaked=" + cloaked + " owner=" + (owner == IntPtr.Zero ? "none" : Cls(owner) + " 0x" + owner.ToString("X"));
  }
  public static string Hit(int x, int y) { var p = new P { X = x, Y = y }; var h = WindowFromPoint(p); return Describe(h) + "\n  root: " + Describe(GetAncestor(h, 2)); }
  public static string RightClick(int x, int y) {
    SetCursorPos(x, y); Thread.Sleep(150); mouse_event(8, 0, 0, 0, IntPtr.Zero); mouse_event(0x10, 0, 0, 0, IntPtr.Zero);
    int menus = 0; for (int i = 0; i < 40 && menus == 0; i++) { Thread.Sleep(100); menus = Menus(); }
    var fg = GetForegroundWindow(); uint pid; GetWindowThreadProcessId(fg, out pid);
    string pn = ""; try { pn = System.Diagnostics.Process.GetProcessById((int)pid).ProcessName; } catch {}
    keybd_event(0x1B, 0, 0, IntPtr.Zero); keybd_event(0x1B, 0, 2, IntPtr.Zero);
    Thread.Sleep(300);
    return "after right-click at " + x + "," + y + ": explorer menu popups=" + menus + ", foreground: " + Cls(fg) + " proc=" + pn;
  }
}
'@
Add-Type -TypeDefinition $src
[void][V]::SetProcessDPIAware()
[V]::Fix($how)
if ($click) { [V]::RightClick(1470, 800) }
if ($click) { [V]::RightClick(2600, 1200) }
