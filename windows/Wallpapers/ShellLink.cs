using System.Runtime.InteropServices.ComTypes;
using System.Text;

namespace Wallpapers;

/// .lnk files through the shell's own COM object (SPEC §10.25.13): the Start menu shortcut.
static class ShellLink
{
    [ComImport, Guid("00021401-0000-0000-C000-000000000046")]
    class CShellLink;

    [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("000214F9-0000-0000-C000-000000000046")]
    interface IShellLinkW
    {
        void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder file, int cch, IntPtr findData, uint flags);
        void GetIDList(out IntPtr pidl);
        void SetIDList(IntPtr pidl);
        void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder name, int cch);
        void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string name);
        void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder dir, int cch);
        void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string dir);
        void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder args, int cch);
        void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string args);
        void GetHotkey(out short hotkey);
        void SetHotkey(short hotkey);
        void GetShowCmd(out int showCmd);
        void SetShowCmd(int showCmd);
        void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder path, int cch, out int index);
        void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string path, int index);
        void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string path, uint reserved);
        void Resolve(IntPtr hwnd, uint flags);
        void SetPath([MarshalAs(UnmanagedType.LPWStr)] string file);
    }

    /// Writes (or overwrites) the shortcut, making its folder if needed.
    public static void Create(ShortcutSpec spec) => OnSta(() =>
    {
        Directory.CreateDirectory(Path.GetDirectoryName(spec.Path)!);
        var link = (IShellLinkW)new CShellLink();
        try
        {
            link.SetPath(spec.Target);
            link.SetWorkingDirectory(spec.WorkingDirectory);
            link.SetDescription(spec.Description);
            link.SetIconLocation(spec.IconPath, spec.IconIndex);
            ((IPersistFile)link).Save(spec.Path, true);
        }
        finally { Marshal.FinalReleaseComObject(link); }
        return 0;
    });

    /// What the shortcut points at, or null when there is no shortcut there.
    public static string? TargetOf(string lnkPath) => !File.Exists(lnkPath) ? null : OnSta(() =>
    {
        var link = (IShellLinkW)new CShellLink();
        try
        {
            ((IPersistFile)link).Load(lnkPath, 0);   // STGM_READ
            var target = new StringBuilder(1024);
            link.GetPath(target, target.Capacity, IntPtr.Zero, 0);
            return target.ToString();
        }
        finally { Marshal.FinalReleaseComObject(link); }
    });

    /// The shell's objects want a single-threaded apartment; the UI thread is one, anything else borrows one.
    static T OnSta<T>(Func<T> work)
    {
        if (Thread.CurrentThread.GetApartmentState() == ApartmentState.STA) return work();
        T result = default!;
        Exception? error = null;
        var thread = new Thread(() => { try { result = work(); } catch (Exception e) { error = e; } });
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        thread.Join();
        if (error != null) throw error;
        return result;
    }
}
