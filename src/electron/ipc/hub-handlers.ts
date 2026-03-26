/**
 * Hub Window IPC Handlers
 *
 * Hub window management (focus, pin, sidebar positioning).
 * These control the Electron app window itself, not external terminals.
 */

import { ipcMain, BrowserWindow, screen } from 'electron';
import type { ConfigLoader } from '../../config/loader.js';

export function setupHubHandlers(config: ConfigLoader): void {
  ipcMain.handle('hub:focus', () => {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      return { success: true };
    }
    return { success: false, error: 'No main window' };
  });

  /** Flip sidebar between left and right monitor edges */
  ipcMain.handle('window:toggleSide', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win || win.isDestroyed()) return { success: false, error: 'No window' };

    const prefs = config.getSidebarPrefs();
    const newSide = prefs.side === 'left' ? 'right' : 'left';
    config.setSidebarPrefs({ side: newSide });

    const wa = screen.getPrimaryDisplay().workArea;
    const x = newSide === 'left' ? wa.x : wa.x + wa.width - prefs.width;
    win.setBounds({ x, y: wa.y, width: prefs.width, height: wa.height });

    return { success: true, side: newSide };
  });

  /** Toggle always-on-top (pin/unpin) */
  ipcMain.handle('window:togglePin', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win || win.isDestroyed()) return { success: false, error: 'No window' };

    const pinned = !win.isAlwaysOnTop();
    win.setAlwaysOnTop(pinned);
    return { success: true, pinned };
  });

  /** Get current sidebar preferences */
  ipcMain.handle('window:getSidebarPrefs', () => {
    return config.getSidebarPrefs();
  });

  /** Update sidebar preferences and reposition */
  ipcMain.handle('window:setSidebarPrefs', (_event, prefs: { side?: string; width?: number }) => {
    const validated: { side?: 'left' | 'right'; width?: number } = {};
    if (prefs.side !== undefined) {
      if (prefs.side !== 'left' && prefs.side !== 'right') {
        return { success: false, error: 'Invalid side: must be left or right' };
      }
      validated.side = prefs.side;
    }
    if (prefs.width !== undefined) {
      if (typeof prefs.width !== 'number' || prefs.width < 250 || prefs.width > 450) {
        return { success: false, error: 'Invalid width: must be 250-450' };
      }
      validated.width = prefs.width;
    }
    config.setSidebarPrefs(validated);
    return { success: true };
  });
}
