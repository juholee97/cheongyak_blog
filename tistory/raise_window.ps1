# Raise the automation browser window (called from tistory/common.mjs raiseWindow, checked by tistory/raise.check.mjs).
# Finds visible top-level windows of chrome.exe processes started with --user-data-dir=<Dir> (the automation profile),
# so the owner's own Chrome (different profile) is never touched. Falls back to "... - Chrome for Testing" titles only
# when no process matches. Does not touch the page or the security check itself.
#   powershell -NoProfile -ExecutionPolicy Bypass -File tistory\raise_window.ps1 -Dir <profile> [-Mode raise|probe]
# raise: topmost + restore if minimized + flash taskbar + one system sound (re-asserts for about 3 s, then exits)
# probe: print topmost / hit-test state, used by the check
param(
  [Parameter(Mandatory = $true)][string]$Dir,
  [ValidateSet('raise', 'probe')][string]$Mode = 'raise'
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

public static class CbWin {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  [StructLayout(LayoutKind.Sequential)] struct FLASHWINFO { public uint cbSize; public IntPtr hwnd; public uint dwFlags; public uint uCount; public uint dwTimeout; }

  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern bool FlashWindowEx(ref FLASHWINFO f);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT p);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h, uint f);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();

  public static string Title(IntPtr h) { var s = new StringBuilder(512); GetWindowText(h, s, 512); return s.ToString(); }
  public static bool Topmost(IntPtr h) { return (GetWindowLong(h, -20) & 0x8) != 0; }

  public static IntPtr[] Find(uint[] pids, string suffix) {
    var set = new HashSet<uint>(pids ?? new uint[0]);
    var found = new List<IntPtr>();
    EnumWindows((h, l) => {
      uint pid; GetWindowThreadProcessId(h, out pid);
      var cls = new StringBuilder(64); GetClassName(h, cls, 64);
      var t = Title(h);
      if (!IsWindowVisible(h) || cls.ToString() != "Chrome_WidgetWin_1" || t.Length == 0) return true;
      if (set.Count > 0 ? !set.Contains(pid) : !IsChrome(pid)) return true;
      if (suffix == null || t.EndsWith(suffix)) found.Add(h);
      return true;
    }, IntPtr.Zero);
    return found.ToArray();
  }
  static bool IsChrome(uint pid) { try { return Process.GetProcessById((int)pid).ProcessName == "chrome"; } catch { return false; } }

  public static void Flash(IntPtr h) {
    var f = new FLASHWINFO(); f.cbSize = (uint)Marshal.SizeOf(f); f.hwnd = h;
    f.dwFlags = 0xF; // FLASHW_ALL | FLASHW_TIMERNOFG: flash until the window comes to the foreground
    FlashWindowEx(ref f);
  }
}
'@

$flag = '--user-data-dir=' + $Dir.TrimEnd('\', '/')
$pattern = [regex]::Escape($flag) + '(?=["\s]|$)'
$pids = @(Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" |
  Where-Object { $_.CommandLine -and $_.CommandLine -match $pattern } |
  ForEach-Object { [uint32]$_.ProcessId })
$how = 'pid'
$wins = [CbWin]::Find([uint32[]]$pids, $null)
if ($wins.Count -eq 0) { $how = 'title'; $wins = [CbWin]::Find([uint32[]]@(), ' - Chrome for Testing') }

$HWND_TOPMOST = [IntPtr](-1)
$SWP = 0x0001 -bor 0x0002 -bor 0x0010 -bor 0x0040 # NOSIZE | NOMOVE | NOACTIVATE | SHOWWINDOW

if ($Mode -eq 'raise') {
  foreach ($h in $wins) {
    if ([CbWin]::IsIconic($h)) { [void][CbWin]::ShowWindow($h, 9) } # SW_RESTORE
    [void][CbWin]::SetWindowPos($h, $HWND_TOPMOST, 0, 0, 0, 0, $SWP)
    [void][CbWin]::SetForegroundWindow($h) # usually refused for a background process; topmost is what counts
    [CbWin]::Flash($h)
  }
  [System.Media.SystemSounds]::Exclamation.Play() # once, not a loop (also runs unattended at 07:00)
  # Re-assert for about 3 s: in testing the topmost bit did not always stick on the first call
  for ($i = 0; $i -lt 10; $i++) {
    Start-Sleep -Milliseconds 300
    foreach ($h in $wins) {
      if ([CbWin]::IsIconic($h)) { [void][CbWin]::ShowWindow($h, 9) }
      if (-not [CbWin]::Topmost($h)) { [void][CbWin]::SetWindowPos($h, $HWND_TOPMOST, 0, 0, 0, 0, $SWP) }
    }
  }
  exit 0
}

# probe
[void][CbWin]::SetProcessDPIAware()
"how=$how pids=$($pids.Count) windows=$($wins.Count)"
foreach ($h in $wins) {
  $r = New-Object CbWin+RECT
  [void][CbWin]::GetWindowRect($h, [ref]$r)
  $p = New-Object CbWin+POINT
  $p.X = [int](($r.L + $r.R) / 2); $p.Y = [int](($r.T + $r.B) / 2)
  $root = [CbWin]::GetAncestor([CbWin]::WindowFromPoint($p), 2) # GA_ROOT
  "WIN hwnd=$h topmost=$([CbWin]::Topmost($h)) rect=$($r.L),$($r.T)-$($r.R),$($r.B) centre=$($p.X),$($p.Y) hitRoot=$root hitIsSelf=$($root -eq $h) iconic=$([CbWin]::IsIconic($h)) foreground=$([CbWin]::GetForegroundWindow() -eq $h) title=$([CbWin]::Title($h))"
}
