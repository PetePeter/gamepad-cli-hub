/**
 * Window IPC Handlers
 *
 * Window focus, terminal enumeration, and hub window management.
 */

import { ipcMain, BrowserWindow } from 'electron';
import type { WindowsWindowManager } from '../../output/windows.js';

export function setupWindowHandlers(windowManager: WindowsWindowManager): void {
  ipcMain.handle('window:focus', async (_event, hwnd: string) => {
    return await windowManager.focusWindow(hwnd);
  });

  ipcMain.handle('window:findTerminals', async () => {
    return await windowManager.findTerminalWindows();
  });

  ipcMain.handle('hub:focus', () => {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      return { success: true };
    }
    return { success: false, error: 'No main window' };
  });
}
