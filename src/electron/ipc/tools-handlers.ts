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
          configLoader.getCliTypes().map(key => {
            const entry = configLoader.getCliTypeEntry(key);
            return [key, {
              name: entry?.name,
              command: entry?.command,
              initialPrompt: entry?.initialPrompt ?? '',
              initialPromptDelay: entry?.initialPromptDelay ?? 0,
            }];
          })
        ),
      };
    } catch (error) {
      logger.error(`[IPC] Failed to get tools: ${error}`);
      return { cliTypes: {} };
    }
  });

  ipcMain.handle('tools:addCliType', (_event, key: string, name: string, command: string, initialPrompt: string, initialPromptDelay: number) => {
    try {
      configLoader.addCliType(key, name, command, initialPrompt, initialPromptDelay);
      return { success: true };
    } catch (error) {
      logger.error(`[IPC] Failed to add CLI type: ${error}`);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('tools:updateCliType', (_event, key: string, name: string, command: string, initialPrompt: string, initialPromptDelay: number) => {
    try {
      configLoader.updateCliType(key, name, command, initialPrompt, initialPromptDelay);
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
