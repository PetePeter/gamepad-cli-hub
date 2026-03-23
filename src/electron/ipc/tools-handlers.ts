/**
 * Tools IPC Handlers
 *
 * CLI type tool management — list, add, update, remove.
 */

import { ipcMain } from 'electron';
import type { ConfigLoader } from '../../config/loader.js';
import { logger } from '../../utils/logger.js';

export function setupToolsHandlers(configLoader: ConfigLoader): void {
  ipcMain.handle('tools:getAll', () => {
    try {
      return {
        cliTypes: Object.fromEntries(
          configLoader.getCliTypes().map(key => [key, {
            name: configLoader.getCliTypeName(key),
            spawn: configLoader.getSpawnConfig(key),
          }])
        ),
        openwhisper: configLoader.getOpenWhisperConfig(),
      };
    } catch (error) {
      logger.error(`[IPC] Failed to get tools: ${error}`);
      return { cliTypes: {}, openwhisper: null };
    }
  });

  ipcMain.handle('tools:addCliType', (_event, key: string, name: string, command: string, args: string[]) => {
    try {
      configLoader.addCliType(key, name, command, args);
      return { success: true };
    } catch (error) {
      logger.error(`[IPC] Failed to add CLI type: ${error}`);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('tools:updateCliType', (_event, key: string, name: string, command: string, args: string[]) => {
    try {
      configLoader.updateCliType(key, name, command, args);
      return { success: true };
    } catch (error) {
      logger.error(`[IPC] Failed to update CLI type: ${error}`);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('tools:removeCliType', (_event, key: string) => {
    try {
      configLoader.removeCliType(key);
      return { success: true };
    } catch (error) {
      logger.error(`[IPC] Failed to remove CLI type: ${error}`);
      return { success: false, error: String(error) };
    }
  });
}
