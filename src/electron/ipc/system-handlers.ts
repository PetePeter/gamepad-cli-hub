/**
 * System IPC Handlers
 *
 * OS-level operations — Windows Game Bar registry queries.
 */

import { ipcMain } from 'electron';
import { logger } from '../../utils/logger.js';

export function setupSystemHandlers(): void {
  ipcMain.handle('system:getGameBarEnabled', async () => {
    try {
      const { execSync } = await import('child_process');
      const output = execSync(
        'powershell -NoProfile -Command "(Get-ItemProperty -Path \'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\GameDVR\' -Name AppCaptureEnabled -ErrorAction SilentlyContinue).AppCaptureEnabled"',
        { encoding: 'utf-8' }
      ).trim();
      return output === '1';
    } catch {
      return null;
    }
  });

  ipcMain.handle('system:setGameBarEnabled', async (_event, enabled: boolean) => {
    try {
      const { execSync } = await import('child_process');
      const val = enabled ? 1 : 0;
      execSync(
        `powershell -NoProfile -Command "Set-ItemProperty -Path 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\GameDVR' -Name AppCaptureEnabled -Value ${val}; Set-ItemProperty -Path 'HKCU:\\System\\GameConfigStore' -Name GameDVR_Enabled -Value ${val}"`,
        { encoding: 'utf-8' }
      );
      return { success: true };
    } catch (error) {
      logger.error(`[IPC] Failed to set Game Bar state: ${error}`);
      return { success: false, error: String(error) };
    }
  });
}
