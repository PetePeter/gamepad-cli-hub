/**
 * App IPC Handlers
 *
 * Application metadata — version info.
 */

import { ipcMain, app } from 'electron';

export function setupAppHandlers(): void {
  ipcMain.handle('app:getVersion', () => {
    return app.getVersion();
  });
}
