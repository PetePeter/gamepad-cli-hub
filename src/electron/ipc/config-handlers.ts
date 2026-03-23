/**
 * Configuration IPC Handlers
 *
 * Exposes configuration read/write operations including
 * bindings, CLI types, and working directory CRUD.
 */

import { ipcMain } from 'electron';
import type { ConfigLoader } from '../../config/loader.js';
import { logger } from '../../utils/logger.js';

export function setupConfigHandlers(configLoader: ConfigLoader): void {
  ipcMain.handle('config:getAll', () => {
    try {
      configLoader.load();
      return {
        cliTypes: configLoader.getCliTypes(),
        globalBindings: configLoader.getGlobalBindings(),
        openwhisper: configLoader.getOpenWhisperConfig(),
      };
    } catch (error) {
      logger.error(`[IPC] Failed to get all config: ${error}`);
      return { cliTypes: [], globalBindings: {}, openwhisper: null };
    }
  });

  ipcMain.handle('config:getGlobalBindings', () => {
    try {
      return configLoader.getGlobalBindings();
    } catch (error) {
      logger.error(`[IPC] Failed to get global bindings: ${error}`);
      return {};
    }
  });

  ipcMain.handle('config:getBindings', (_event, cliType: string) => {
    try {
      return configLoader.getBindings(cliType);
    } catch (error) {
      logger.error(`[IPC] Failed to get bindings for ${cliType}: ${error}`);
      return null;
    }
  });

  ipcMain.handle('config:getCliTypes', () => {
    try {
      return configLoader.getCliTypes();
    } catch (error) {
      logger.error(`[IPC] Failed to get CLI types: ${error}`);
      return [];
    }
  });

  ipcMain.handle('config:setBinding', (_event, button: string, cliType: string | null, binding: any) => {
    try {
      configLoader.setBinding(button, cliType, binding);
      logger.info(`[IPC] Set binding: ${button} for ${cliType || 'global'} ${JSON.stringify(binding)}`);
      return { success: true };
    } catch (error) {
      logger.error(`[IPC] Failed to set binding: ${button} ${error}`);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('config:removeBinding', (_event, button: string, cliType: string | null) => {
    try {
      configLoader.removeBinding(button, cliType);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('config:reload', () => {
    try {
      configLoader.load();
      logger.info('[IPC] Config reloaded');
      return { success: true };
    } catch (error) {
      logger.error(`[IPC] Failed to reload config: ${error}`);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('config:getWorkingDirs', () => {
    try {
      return configLoader.getWorkingDirectories();
    } catch (error) {
      logger.error(`[IPC] Failed to get working dirs: ${error}`);
      return [];
    }
  });

  ipcMain.handle('config:addWorkingDir', (_event, name: string, dirPath: string) => {
    try {
      configLoader.addWorkingDirectory(name, dirPath);
      return { success: true };
    } catch (error) {
      logger.error(`[IPC] Failed to add working dir: ${error}`);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('config:updateWorkingDir', (_event, index: number, name: string, dirPath: string) => {
    try {
      configLoader.updateWorkingDirectory(index, name, dirPath);
      return { success: true };
    } catch (error) {
      logger.error(`[IPC] Failed to update working dir: ${error}`);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('config:removeWorkingDir', (_event, index: number) => {
    try {
      configLoader.removeWorkingDirectory(index);
      return { success: true };
    } catch (error) {
      logger.error(`[IPC] Failed to remove working dir: ${error}`);
      return { success: false, error: String(error) };
    }
  });
}
