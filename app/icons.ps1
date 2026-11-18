# Reports where the desktop icons are (read-only; nothing is changed).
# Asks Explorer's desktop view for each item's position (IFolderView, the documented way), in screen pixels.
# Prints one JSON line per request: {"ok":true,"r":"x,y,w,h;..."} or {"ok":false,"e":"..."}.
$src = @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class DesktopIcons {
  [ComImport, Guid("6D5140C1-7436-11CE-8034-00AA006009FA"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IServiceProvider { [PreserveSig] int QueryService(ref Guid svc, ref Guid riid, [MarshalAs(UnmanagedType.Interface)] out object o); }
  [ComImport, Guid("000214E2-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IShellBrowser {
    void GetWindow(out IntPtr h); void ContextSensitiveHelp(bool b); void InsertMenusSB(IntPtr a, IntPtr b); void SetMenuSB(IntPtr a, IntPtr b, IntPtr c);
    void RemoveMenusSB(IntPtr a); void SetStatusTextSB(IntPtr a); void EnableModelessSB(bool b); void TranslateAcceleratorSB(IntPtr a, short b);
    void BrowseObject(IntPtr a, uint b); void GetViewStateStream(uint a, out IntPtr b); void GetControlWindow(uint a, out IntPtr b);
    void SendControlMsg(uint a, uint b, IntPtr c, IntPtr d, out IntPtr e);
    [PreserveSig] int QueryActiveShellView([MarshalAs(UnmanagedType.Interface)] out object v);
  }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  [ComImport, Guid("cde725b0-ccc9-4519-917e-325d72fab4ce"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IFolderView {
    void GetCurrentViewMode(out uint m); void SetCurrentViewMode(uint m); void GetFolder(ref Guid riid, out IntPtr p);
    [PreserveSig] int Item(int i, out IntPtr pidl); [PreserveSig] int ItemCount(uint flags, out int n); void Items(uint f, ref Guid riid, out IntPtr p);
    void GetSelectionMarkedItem(out int i); void GetFocusedItem(out int i);
    [PreserveSig] int GetItemPosition(IntPtr pidl, out POINT pt); [PreserveSig] int GetSpacing(ref POINT pt);
  }
  [DllImport("ole32.dll")] static extern void CoTaskMemFree(IntPtr p);
  [DllImport("user32.dll")] static extern IntPtr FindWindowEx(IntPtr p, IntPtr a, string c, string n);
  [DllImport("user32.dll")] static extern IntPtr FindWindow(string c, string n);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }

  public static string Scan() {
    Type t = Type.GetTypeFromCLSID(new Guid("9BA05972-F6A8-11CF-A442-00A0C90A8F39")); // ShellWindows
    object sw = Activator.CreateInstance(t);
    object loc = 0x0000; object root = Type.Missing; // CSIDL_DESKTOP
    object[] args = new object[] { loc, root, 8 /*SWC_DESKTOP*/, 0, 1 /*SWFO_NEEDDISPATCH*/ };
    var pm = new System.Reflection.ParameterModifier(5); pm[3] = true;
    object disp = t.InvokeMember("FindWindowSW", System.Reflection.BindingFlags.InvokeMethod, null, sw, args, new[] { pm }, null, null);
    var sp = (IServiceProvider)disp;
    Guid sid = new Guid("4C96BE40-915C-11CF-99D3-00AA004AE837"), iid = typeof(IShellBrowser).GUID; object o;
    Marshal.ThrowExceptionForHR(sp.QueryService(ref sid, ref iid, out o));
    object view; Marshal.ThrowExceptionForHR(((IShellBrowser)o).QueryActiveShellView(out view));
    var fv = (IFolderView)view;
    int n; Marshal.ThrowExceptionForHR(fv.ItemCount(2 /*SVGIO_ALLVIEW*/, out n));
    POINT sp2 = new POINT(); fv.GetSpacing(ref sp2);
    // item positions are in the icon list's own coordinates; its window starts at the virtual screen's corner
    IntPtr lv = FindWindowEx(FindWindowEx(FindWindow("Progman", null), IntPtr.Zero, "SHELLDLL_DefView", null), IntPtr.Zero, "SysListView32", null);
    int ox = 0, oy = 0; // raw positions; the caller adds the virtual screen's corner in real pixels
    var sb = new StringBuilder();
    for (int i = 0; i < n; i++) {
      IntPtr pidl; if (fv.Item(i, out pidl) != 0) continue;
      POINT p; int hr = fv.GetItemPosition(pidl, out p); CoTaskMemFree(pidl);
      if (hr != 0) continue;
      if (sb.Length > 0) sb.Append(';');
      sb.Append(p.X + ox).Append(',').Append(p.Y + oy).Append(',').Append(sp2.X).Append(',').Append(sp2.Y);
    }
    return sb.ToString();
  }
}
"@
try { Add-Type -TypeDefinition $src -Language CSharp -ErrorAction Stop } catch { [Console]::Out.WriteLine('{"ok":false,"e":"compile"}'); [Console]::Out.Flush() }
function Scan {
  try { return '{"ok":true,"r":"' + [DesktopIcons]::Scan() + '"}' } catch { return '{"ok":false,"e":"' + ($_.Exception.Message -replace '[\\"\r\n]', ' ') + '"}' }
}
[Console]::Out.WriteLine((Scan)); [Console]::Out.Flush()
while ($null -ne ($line = [Console]::In.ReadLine())) { [Console]::Out.WriteLine((Scan)); [Console]::Out.Flush() }
