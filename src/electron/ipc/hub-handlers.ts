/**
 * Hub Window IPC Handlers
 *
 * Hub window management (focus).
 * These control the Electron app window itself, not external terminals.
 */

import { ipcMain, BrowserWindow } from 'electron';

export function setupHubHandlers(): void {
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
