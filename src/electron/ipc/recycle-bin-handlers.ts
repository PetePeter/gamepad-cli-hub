/**
 * Recycle Bin IPC Handlers
 *
 * Lists / restores / forgets closed recoverable sessions. Restore returns the
 * entry (and removes it from the bin) so the renderer can re-spawn it via the
 * normal spawn-with-resume flow (doSpawn → pty:spawn with resumeSessionName).
 */

import { ipcMain, BrowserWindow } from 'electron';
import type { RecycleBinManager } from '../../session/recycle-bin-manager.js';
import type { WindowManager } from '../window-manager.js';
import { logger } from '../../utils/logger.js';

export function setupRecycleBinHandlers(
  recycleBin: RecycleBinManager,
  windowManager?: WindowManager,
): void {
  const getTargetWindows = () => windowManager?.getAllWindows() ?? BrowserWindow.getAllWindows();

  recycleBin.on('recycle-bin:changed', () => {
    for (const win of getTargetWindows()) {
      if (!win.isDestroyed()) win.webContents.send('recycle-bin:changed');
    }
  });

  ipcMain.handle('recycleBin:list', () => {
    try {
      return recycleBin.list();
    } catch (err) {
      logger.error(`[recycleBin:list] Failed: ${err}`);
      return [];
    }
  });

  ipcMain.handle('recycleBin:restore', (_event, id: string) => {
    try {
      return recycleBin.restore(id);
    } catch (err) {
      logger.error(`[recycleBin:restore] Failed: ${err}`);
      return null;
    }
  });

  ipcMain.handle('recycleBin:forget', (_event, id: string) => {
    try {
      recycleBin.forget(id);
      return true;
    } catch (err) {
      logger.error(`[recycleBin:forget] Failed: ${err}`);
      return false;
    }
  });

  ipcMain.handle('recycleBin:empty', () => {
    try {
      recycleBin.empty();
      return true;
    } catch (err) {
      logger.error(`[recycleBin:empty] Failed: ${err}`);
      return false;
    }
  });

  logger.info('[IPC] Recycle bin handlers registered');
}
