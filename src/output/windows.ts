/**
 * Windows window management module.
 * Uses PowerShell scripts (via temp files) to find, focus, and cycle between terminal windows.
 */

import { execSync } from 'node:child_process';
import { platform } from 'node:os';
import { writeFileSync, unlinkSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Check if we're on Windows
const IS_WINDOWS = platform() === 'win32';

// Window handle type (HWND on Windows is a pointer, represented as number)
export type WindowHandle = number;

// Terminal window information
export interface TerminalWindow {
  handle: WindowHandle;
  title: string;
  processId: number;
  processName: string;
}

// Focus direction
export type FocusDirection = 'next' | 'previous';

/**
 * Window Manager class for Windows platform.
 * Provides functionality to find, focus, and cycle between terminal windows.
 */
export class WindowManager {
  private cachedTerminals: TerminalWindow[] = [];
  private currentFocusIndex: number = -1;
  private lastUpdateTime: number = 0;
  private readonly CACHE_DURATION_MS = 1000; // Cache for 1 second
  private tempDir: string | null = null;

  constructor() {
    // Create a temp directory for our scripts
    if (IS_WINDOWS) {
      try {
        this.tempDir = mkdtempSync(join(tmpdir(), 'gamepad-hub-'));
      } catch (e) {
        console.error('Failed to create temp directory:', e);
      }
    }
  }

  /**
   * Find all terminal windows currently open.
   */
  findTerminalWindows(): TerminalWindow[] {
    const now = Date.now();
    if (now - this.lastUpdateTime < this.CACHE_DURATION_MS && this.cachedTerminals.length > 0) {
      return this.cachedTerminals;
    }

    if (!IS_WINDOWS) {
      this.cachedTerminals = [];
      return this.cachedTerminals;
    }

    try {
      const windows = this.getWindowProcesses();
      this.cachedTerminals = windows.filter((win) => this.isTerminalWindow(win));
      this.lastUpdateTime = now;
      return this.cachedTerminals;
    } catch (error) {
      console.error('Error finding terminal windows:', error);
      return [];
    }
  }

  /**
   * Bring a window to the foreground by PID.
   */
  focusWindowByPid(processId: number): boolean {
    if (!IS_WINDOWS) {
      return false;
    }

    try {
      return this.runFocusScript(processId);
    } catch (error) {
      console.error('Error focusing window:', error);
      return false;
    }
  }

  /**
   * Bring a window to the foreground by handle.
   */
  focusWindow(windowHandle: WindowHandle): boolean {
    if (!IS_WINDOWS) {
      return false;
    }

    try {
      const window = this.getWindowProcesses().find((w) => w.handle === windowHandle);
      if (window) {
        return this.focusWindowByPid(window.processId);
      }
      return false;
    } catch (error) {
      console.error('Error focusing window:', error);
      return false;
    }
  }

  /**
   * Get the currently focused/active window.
   */
  getActiveWindow(): TerminalWindow | null {
    if (!IS_WINDOWS) {
      return null;
    }

    try {
      return this.getForegroundWindowProcess();
    } catch (error) {
      console.error('Error getting active window:', error);
      return null;
    }
  }

  /**
   * Cycle focus to the next or previous terminal window.
   */
  cycleFocus(direction: FocusDirection = 'next'): boolean {
    const terminals = this.findTerminalWindows();
    if (terminals.length === 0) {
      return false;
    }

    const activeWindow = this.getActiveWindow();
    if (!activeWindow) {
      return this.focusWindowByPid(terminals[0].processId);
    }

    let currentIndex = terminals.findIndex((t) => t.processId === activeWindow.processId);
    if (currentIndex === -1) {
      currentIndex = -1;
    }

    let nextIndex: number;
    if (direction === 'next') {
      nextIndex = (currentIndex + 1) % terminals.length;
    } else {
      nextIndex = currentIndex <= 0 ? terminals.length - 1 : currentIndex - 1;
    }

    this.currentFocusIndex = nextIndex;
    return this.focusWindowByPid(terminals[nextIndex].processId);
  }

  /**
   * Get all visible windows (for debugging).
   */
  getAllWindows(): TerminalWindow[] {
    if (!IS_WINDOWS) {
      return [];
    }

    try {
      return this.getWindowProcesses();
    } catch (error) {
      console.error('Error enumerating windows:', error);
      return [];
    }
  }

  /**
   * Clean up temp files on exit.
   */
  cleanup(): void {
    if (this.tempDir && existsSync(this.tempDir)) {
      try {
        rmSync(this.tempDir, { recursive: true, force: true } as any);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  // ========== Private methods ==========

  /**
   * Get all processes that have windows using temp file script.
   */
  private getWindowProcesses(): TerminalWindow[] {
    const scriptPath = this.createTempScript('get-windows.ps1', GetWindowsScript);
    try {
      const output = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`, {
        encoding: 'utf-8',
        timeout: 5000,
      });

      if (!output || output.trim() === '') {
        return [];
      }

      const windows = JSON.parse(output);
      if (!Array.isArray(windows)) {
        return [];
      }

      return windows
        .filter((w) => w.MainWindowTitle && w.MainWindowTitle.trim() !== '')
        .map((w) => ({
          handle: Number(w.MainWindowHandle || 0),
          title: w.MainWindowTitle,
          processId: Number(w.Id),
          processName: (w.ProcessName || '').toLowerCase(),
        }));
    } catch (error) {
      console.error('Error in getWindowProcesses:', error);
      return [];
    } finally {
      this.deleteTempScript(scriptPath);
    }
  }

  /**
   * Get the foreground window process using temp file script.
   */
  private getForegroundWindowProcess(): TerminalWindow | null {
    const scriptPath = this.createTempScript('get-foreground.ps1', GetForegroundWindowScript);
    try {
      const output = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`, {
        encoding: 'utf-8',
        timeout: 5000,
      });

      if (!output || output.trim() === '') {
        return null;
      }

      const result = JSON.parse(output);
      if (!result || !result.Id) {
        return null;
      }

      return {
        handle: Number(result.MainWindowHandle || 0),
        title: result.MainWindowTitle || '',
        processId: Number(result.Id),
        processName: (result.ProcessName || '').toLowerCase(),
      };
    } catch (error) {
      console.error('Error in getForegroundWindowProcess:', error);
      return null;
    } finally {
      this.deleteTempScript(scriptPath);
    }
  }

  /**
   * Run the focus window script.
   */
  private runFocusScript(processId: number): boolean {
    const scriptContent = FocusWindowScript.replace('{PROCESS_ID}', processId.toString());
    const scriptPath = this.createTempScript(`focus-${processId}.ps1`, scriptContent);
    try {
      const output = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`, {
        encoding: 'utf-8',
        timeout: 5000,
      });
      return output.includes('OK');
    } catch (error) {
      console.error('Error in runFocusScript:', error);
      return false;
    } finally {
      this.deleteTempScript(scriptPath);
    }
  }

  /**
   * Create a temp script file.
   */
  private createTempScript(name: string, content: string): string {
    if (!this.tempDir) {
      throw new Error('Temp directory not available');
    }
    const path = join(this.tempDir, name);
    writeFileSync(path, content, 'utf-8');
    return path;
  }

  /**
   * Delete a temp script file.
   */
  private deleteTempScript(path: string): void {
    try {
      if (existsSync(path)) {
        unlinkSync(path);
      }
    } catch {
      // Ignore
    }
  }

  /**
   * Check if a window is a terminal window.
   */
  private isTerminalWindow(window: TerminalWindow): boolean {
    const terminalProcesses = [
      'windowsterminal',
      'windows.terminal.powershell',
      'pwsh',
      'powershell',
      'cmd',
      'wt',
      'conhost',
      'alacritty',
      'wezterm-gui',
      'kitty',
      'tabby',
    ];

    const lowerProcess = window.processName.toLowerCase();
    const lowerTitle = window.title.toLowerCase();

    if (terminalProcesses.some((t) => lowerProcess.includes(t))) {
      return true;
    }

    const terminalTitleIndicators = [
      'powershell',
      'cmd.exe',
      'administrator:',
      'windows terminal',
      'ubuntu',
      'wsl',
      'debian',
      'bash',
      'zsh',
      'nu',
      'fish',
      'git bash',
    ];

    return terminalTitleIndicators.some((indicator) => lowerTitle.includes(indicator));
  }
}

// ========== PowerShell Script Templates ==========

/** Script to get all visible windows */
const GetWindowsScript = `
Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | Select-Object Id, ProcessName, MainWindowTitle, MainWindowHandle | ConvertTo-Json
`.trim();

/** Script to get the foreground window */
const GetForegroundWindowScript = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
}
"@
$hWnd = [Win32]::GetForegroundWindow()
$processId = 0
[Win32]::GetWindowThreadProcessId($hWnd, [ref]$processId) | Out-Null
Get-Process -Id $processId -ErrorAction SilentlyContinue | Select-Object Id, ProcessName, MainWindowTitle, MainWindowHandle | ConvertTo-Json
`.trim();

/** Script template to focus a window by process ID */
const FocusWindowScript = `
$processId = {PROCESS_ID}
$process = Get-Process -Id $processId -ErrorAction SilentlyContinue
if (-not $process) {
    Write-Output 'NOT_FOUND'
    exit
}
if (-not $process.MainWindowHandle) {
    Write-Output 'NO_WINDOW'
    exit
}
Add-Type -Name User32 -Namespace Win32 -MemberDefinition @"
[DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
"@
$hwnd = $process.MainWindowHandle
[Win32.User32]::ShowWindowAsync($hwnd, 9) | Out-Null
[Win32.User32]::SetForegroundWindow($hwnd) | Out-Null
Write-Output 'OK'
`.trim();

// Singleton instance
export const windowManager = new WindowManager();

// Cleanup on exit
process.on('exit', () => windowManager.cleanup());
process.on('SIGINT', () => {
  windowManager.cleanup();
  process.exit(0);
});
