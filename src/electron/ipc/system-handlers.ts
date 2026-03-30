/**
 * System IPC Handlers
 *
 * OS-level operations — logs folder access.
 */

import { ipcMain, shell } from 'electron';
import { logger, logDir } from '../../utils/logger.js';

export function setupSystemHandlers(): void {
  ipcMain.handle('system:openLogsFolder', async () => {
    try {
      const errorMessage = await shell.openPath(logDir);
      if (errorMessage) {
        logger.error(`[IPC] Failed to open logs folder: ${errorMessage}`);
        return { success: false, error: errorMessage };
      }
      return { success: true };
    } catch (error) {
      logger.error(`[IPC] Failed to open logs folder: ${error}`);
      return { success: false, error: String(error) };
    }
  });
}
