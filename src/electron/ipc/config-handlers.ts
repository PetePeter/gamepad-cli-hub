/**
 * Configuration IPC Handlers
 *
 * Exposes configuration read/write operations including
 * bindings, CLI types, and working directory CRUD.
 */

import { ipcMain, dialog, BrowserWindow } from 'electron';
import type { ConfigLoader } from '../../config/loader.js';
import { logger } from '../../utils/logger.js';

export function setupConfigHandlers(configLoader: ConfigLoader): void {
  ipcMain.handle('config:getAll', () => {
    try {
      configLoader.load();
      return {
        cliTypes: configLoader.getCliTypes(),
      };
    } catch (error) {
      logger.error(`[IPC] Failed to get all config: ${error}`);
      return { cliTypes: [] };
    }
  });

  ipcMain.handle('config:getBindings',(_event, cliType: string) => {
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

  ipcMain.handle('config:setBinding', (_event, button: string, cliType: string, binding: any) => {
    try {
      configLoader.setBinding(button, cliType, binding);
      logger.info(`[IPC] Set binding: ${button} for ${cliType} ${JSON.stringify(binding)}`);
      return { success: true };
    } catch (error) {
      logger.error(`[IPC] Failed to set binding: ${button} ${error}`);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('config:removeBinding', (_event, button: string, cliType: string) => {
    try {
      configLoader.removeBinding(button, cliType);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('config:copyCliBindings', (_event, sourceCli: string, targetCli: string) => {
    try {
      const count = configLoader.copyCliBindings(sourceCli, targetCli);
      logger.info(`[IPC] Copied ${count} bindings from ${sourceCli} to ${targetCli}`);
      return { success: true, count };
    } catch (error) {
      logger.error(`[IPC] Failed to copy bindings: ${error}`);
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

  ipcMain.handle('config:getHapticFeedback', () => {
    try {
      return configLoader.getHapticFeedback();
    } catch (error) {
      logger.error(`[IPC] Failed to get haptic feedback setting: ${error}`);
      return true; // Default to enabled
    }
  });

  ipcMain.handle('config:setHapticFeedback', (_event, enabled: boolean) => {
    try {
      configLoader.setHapticFeedback(enabled);
      logger.info(`[IPC] Haptic feedback set to: ${enabled}`);
      return { success: true };
    } catch (error) {
      logger.error(`[IPC] Failed to set haptic feedback: ${error}`);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('config:getSortPrefs', (_event, area: string) => {
    try {
      return configLoader.getSortPrefs(area as 'sessions' | 'bindings');
    } catch (error) {
      logger.error(`[IPC] Failed to get sort prefs for ${area}: ${error}`);
      return { field: area === 'sessions' ? 'state' : 'button', direction: 'asc' };
    }
  });

  ipcMain.handle('config:setSortPrefs', (_event, area: string, prefs: { field?: string; direction?: string }) => {
    try {
      configLoader.setSortPrefs(area as 'sessions' | 'bindings', prefs);
      logger.info(`[IPC] Sort prefs for ${area} set to: ${JSON.stringify(prefs)}`);
      return { success: true };
    } catch (error) {
      logger.error(`[IPC] Failed to set sort prefs for ${area}: ${error}`);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('config:getSpawnCommand', (_event, cliType: string) => {
    try {
      const entry = configLoader.getCliTypeEntry(cliType);
      if (!entry) return null;
      // For embedded PTY, use the raw command directly — no terminal wrapper
      return { command: entry.command || cliType, args: [] };
    } catch (error) {
      logger.error(`[IPC] Failed to get spawn command for ${cliType}: ${error}`);
      return null;
    }
  });

  ipcMain.handle('config:getDpadConfig', () => {
    try {
      return configLoader.getDpadConfig();
    } catch (error) {
      logger.error(`[IPC] Failed to get dpad config: ${error}`);
      return { initialDelay: 400, repeatRate: 120 };
    }
  });

  ipcMain.handle('config:getStickConfig', (_event, stick: string) => {
    try {
      return configLoader.getStickConfig(stick as 'left' | 'right');
    } catch (error) {
      logger.error(`[IPC] Failed to get stick config for ${stick}: ${error}`);
      return { mode: 'disabled', deadzone: 0.25, repeatRate: 100 };
    }
  });

  ipcMain.handle('dialog:openFolder', async (_event) => {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    const options = { properties: ['openDirectory' as const], title: 'Select Working Directory' };
    const result = focusedWindow
      ? await dialog.showOpenDialog(focusedWindow, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });
}
