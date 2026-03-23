/**
 * Profile IPC Handlers
 *
 * Configuration profile management — list, switch, create, delete.
 */

import { ipcMain } from 'electron';
import type { ConfigLoader } from '../../config/loader.js';
import { logger } from '../../utils/logger.js';

export function setupProfileHandlers(configLoader: ConfigLoader): void {
  ipcMain.handle('profile:list', () => {
    try {
      return configLoader.listProfiles();
    } catch (error) {
      logger.error(`[IPC] Failed to list profiles: ${error}`);
      return [];
    }
  });

  ipcMain.handle('profile:getActive', () => {
    try {
      return configLoader.getActiveProfile();
    } catch (error) {
      logger.error(`[IPC] Failed to get active profile: ${error}`);
      return 'default';
    }
  });

  ipcMain.handle('profile:switch', (_event, name: string) => {
    try {
      configLoader.switchProfile(name);
      return { success: true };
    } catch (error) {
      logger.error(`[IPC] Failed to switch profile: ${error}`);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('profile:create', (_event, name: string, copyFrom?: string) => {
    try {
      configLoader.createProfile(name, copyFrom);
      return { success: true };
    } catch (error) {
      logger.error(`[IPC] Failed to create profile: ${error}`);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('profile:delete', (_event, name: string) => {
    try {
      configLoader.deleteProfile(name);
      return { success: true };
    } catch (error) {
      logger.error(`[IPC] Failed to delete profile: ${error}`);
      return { success: false, error: String(error) };
    }
  });
}
