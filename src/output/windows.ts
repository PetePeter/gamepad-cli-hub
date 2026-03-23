/**
 * Windows Window Management Module
 *
 * Provides window enumeration and focus management using PowerShell
 * with Windows COM APIs (WScript.Shell and UI Automation).
 */

import { spawn } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { promisify } from 'util';
import { exec as execCallback } from 'child_process';

const exec = promisify(execCallback);

/**
 * Window information structure
 */
export interface WindowInfo {
  hwnd: string;           // Window handle (as hex string)
  title: string;          // Window title
  className: string;      // Window class name
  processId: number;      // Process ID
  processName: string;    // Process executable name
  isVisible: boolean;     // Whether window is visible
}

/**
 * Process information structure
 */
export interface ProcessInfo {
  pid: number;
  name: string;
  mainWindowTitle: string;
}

/**
 * Result from window enumeration
 */
export interface WindowEnumerationResult {
  windows: WindowInfo[];
  count: number;
}

/**
 * PowerShell script for window enumeration and management
 */
const WINDOW_PS1 = `
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName System.Windows.Forms

# Win32 API functions
$script:signature = @'
[DllImport("user32.dll", CharSet = CharSet.Auto)]
public static extern IntPtr GetForegroundWindow();

[DllImport("user32.dll", CharSet = CharSet.Auto)]
public static extern bool SetForegroundWindow(IntPtr hWnd);

[DllImport("user32.dll", CharSet = CharSet.Auto)]
public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

[DllImport("user32.dll", CharSet = CharSet.Auto)]
public static extern bool IsWindowVisible(IntPtr hWnd);

[DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
public static extern int GetWindowThreadProcessId(IntPtr hWnd, out int lpdwProcessId);

[DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder lpString, int nMaxCount);

[DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
public static extern int GetClassName(IntPtr hWnd, System.Text.StringBuilder lpClassName, int nMaxCount);

[DllImport("user32.dll")]
public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
'@

Add-Type -MemberDefinition $script:signature -Name Win32 -Namespace NativeMethods

# Window enumeration callback
$script:windows = @{}

$callback = {
    param($hWnd, $lParam)

    try {
        # Check if window is visible
        $isVisible = [NativeMethods.Win32]::IsWindowVisible($hWnd)

        # Get process ID
        $processId = 0
        [NativeMethods.Win32]::GetWindowThreadProcessId($hWnd, [ref]$processId) | Out-Null

        # Get window title
        $title = New-Object System.Text.StringBuilder(256)
        [NativeMethods.Win32]::GetWindowText($hWnd, $title, $title.Capacity) | Out-Null
        $windowTitle = $title.ToString()

        # Get class name
        $className = New-Object System.Text.StringBuilder(256)
        [NativeMethods.Win32]::GetClassName($hWnd, $className, $className.Capacity) | Out-Null
        $windowClassName = $className.ToString()

        # Get process name
        $processName = ""
        if ($processId -gt 0) {
            try {
                $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
                if ($process) {
                    $processName = $process.ProcessName
                }
            } catch {
                # Process might not be accessible
            }
        }

        # Only include visible windows with titles
        if ($isVisible -and $windowTitle.Length -gt 0) {
            $windowInfo = @{
                hwnd = $hWnd.ToString()
                title = $windowTitle
                className = $windowClassName
                processId = $processId
                processName = $processName
                isVisible = $isVisible
            }
            $script:windows[$hWnd.ToString()] = $windowInfo
        }
    } catch {
        # Skip windows that cause errors
    }

    return $true
}

# Get current operation mode from environment
$mode = $env:WINDOW_OP_MODE

if ($mode -eq "enumerate") {
    # Enumerate all windows
    [NativeMethods.Win32]::EnumWindows($callback, [IntPtr]::Zero) | Out-Null
    $script:windows.Values | ConvertTo-Json -Compress

} elseif ($mode -eq "focus") {
    # Focus a specific window
    $targetHwnd = [IntPtr]::Parse($env:TARGET_HWND)
    $success = [NativeMethods.Win32]::SetForegroundWindow($targetHwnd)
    @{ success = $success } | ConvertTo-Json -Compress

} elseif ($mode -eq "getactive") {
    # Get active window
    $activeHwnd = [NativeMethods.Win32]::GetForegroundWindow()

    $processId = 0
    [NativeMethods.Win32]::GetWindowThreadProcessId($activeHwnd, [ref]$processId) | Out-Null

    $title = New-Object System.Text.StringBuilder(256)
    [NativeMethods.Win32]::GetWindowText($activeHwnd, $title, $title.Capacity) | Out-Null

    $processName = ""
    if ($processId -gt 0) {
        try {
            $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
            if ($process) {
                $processName = $process.ProcessName
            }
        } catch {
            # Process might not be accessible
        }
    }

    @{
        hwnd = $activeHwnd.ToString()
        title = $title.ToString()
        processId = $processId
        processName = $processName
    } | ConvertTo-Json -Compress

} elseif ($mode -eq "findbytitle") {
    # Find windows by title pattern
    $pattern = $env:TITLE_PATTERN
    [NativeMethods.Win32]::EnumWindows($callback, [IntPtr]::Zero) | Out-Null

    $matching = $script:windows.Values | Where-Object { $_.title -match $pattern }
    $matching | ConvertTo-Json -Compress

} elseif ($mode -eq "findbyprocess") {
    # Find windows by process name
    $processName = $env:PROCESS_NAME
    [NativeMethods.Win32]::EnumWindows($callback, [IntPtr]::Zero) | Out-Null

    $matching = $script:windows.Values | Where-Object { $_.processName -eq $processName }
    $matching | ConvertTo-Json -Compress
}
`;

/**
 * Windows Window Manager
 *
 * Provides methods for enumerating, finding, and manipulating windows.
 */
export class WindowsWindowManager {
  private scriptPath: string | null = null;

  constructor() {
    this.ensureScriptExists();
  }

  /**
   * Ensure the PowerShell script file exists
   */
  private ensureScriptExists(): void {
    if (this.scriptPath && existsSync(this.scriptPath)) {
      return;
    }

    this.scriptPath = join(tmpdir(), 'gamepad-windows.ps1');
    writeFileSync(this.scriptPath, WINDOW_PS1, 'utf-8');
  }

  /**
   * Execute PowerShell command for window operations
   */
  private async executeWindowScript(
    mode: string,
    env?: Record<string, string>
  ): Promise<string> {
    this.ensureScriptExists();

    const powershellArgs = [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', this.scriptPath!
    ];

    const spawnOptions = {
      env: {
        ...process.env,
        WINDOW_OP_MODE: mode,
        ...env
      },
      timeout: 10000
    };

    return new Promise((resolve, reject) => {
      const proc = spawn('pwsh', powershellArgs, spawnOptions);
      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (code: number) => {
        if (code === 0) {
          resolve(stdout.trim().split('\n').pop() || '');
        } else {
          reject(new Error(`PowerShell failed: ${stderr || 'unknown error'}`));
        }
      });

      proc.on('error', (err: Error) => {
        reject(err);
      });
    });
  }

  /**
   * Enumerate all visible windows
   */
  async enumerateWindows(): Promise<WindowEnumerationResult> {
    try {
      const output = await this.executeWindowScript('enumerate');
      const windows: WindowInfo[] = JSON.parse(output || '[]');

      return {
        windows,
        count: windows.length
      };
    } catch (error) {
      console.error('Failed to enumerate windows:', error);
      return { windows: [], count: 0 };
    }
  }

  /**
   * Find windows by title pattern (regex)
   */
  async findWindowsByTitle(pattern: string): Promise<WindowInfo[]> {
    try {
      const output = await this.executeWindowScript('findbytitle', {
        TITLE_PATTERN: pattern
      });
      const windows: WindowInfo[] = JSON.parse(output || '[]');
      return windows;
    } catch (error) {
      console.error(`Failed to find windows by title pattern "${pattern}":`, error);
      return [];
    }
  }

  /**
   * Find windows by process name
   */
  async findWindowsByProcessName(processName: string): Promise<WindowInfo[]> {
    try {
      const output = await this.executeWindowScript('findbyprocess', {
        PROCESS_NAME: processName
      });
      const parsed = JSON.parse(output || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error(`Failed to find windows by process "${processName}":`, error);
      return [];
    }
  }

  /**
   * Focus (bring to front) a window by handle
   */
  async focusWindow(hwnd: string): Promise<boolean> {
    try {
      const output = await this.executeWindowScript('focus', {
        TARGET_HWND: hwnd
      });
      const result = JSON.parse(output);
      return result.success === true;
    } catch (error) {
      console.error(`Failed to focus window ${hwnd}:`, error);
      return false;
    }
  }

  /**
   * Get the currently active/focused window
   */
  async getActiveWindow(): Promise<WindowInfo | null> {
    try {
      const output = await this.executeWindowScript('getactive');
      const data = JSON.parse(output);

      return {
        hwnd: data.hwnd,
        title: data.title,
        className: '',
        processId: data.processId,
        processName: data.processName,
        isVisible: true
      };
    } catch (error) {
      console.error('Failed to get active window:', error);
      return null;
    }
  }

  /**
   * Get all running processes
   */
  async getProcesses(): Promise<ProcessInfo[]> {
    try {
      const { stdout } = await exec('powershell -Command "Get-Process | Select-Object Id,ProcessName,MainWindowTitle | ConvertTo-Json"');
      const processes: any[] = JSON.parse(stdout);

      return processes
        .filter(p => p.MainWindowTitle && p.MainWindowTitle.length > 0)
        .map(p => ({
          pid: p.Id,
          name: p.ProcessName,
          mainWindowTitle: p.MainWindowTitle
        }));
    } catch (error) {
      console.error('Failed to get processes:', error);
      return [];
    }
  }

  /**
   * Find terminal windows (common terminal emulators)
   */
  async findTerminalWindows(): Promise<WindowInfo[]> {
    const terminalProcessNames = [
      'WindowsTerminal',
      'code',      // VSCode terminal
      'wt',        // Windows Terminal
      'cmd',
      'powershell',
      'pwsh',
      'conhost',
      'node'       // Node.js processes might be terminals
    ];

    const results: WindowInfo[] = [];

    for (const name of terminalProcessNames) {
      const windows = await this.findWindowsByProcessName(name);
      results.push(...windows);
    }

    return results;
  }

  /**
   * Clean up temporary script file
   */
  cleanup(): void {
    if (this.scriptPath && existsSync(this.scriptPath)) {
      try {
        unlinkSync(this.scriptPath);
      } catch {
        // Ignore cleanup errors
      }
      this.scriptPath = null;
    }
  }
}

// Export singleton instance
export const windowManager = new WindowsWindowManager();
