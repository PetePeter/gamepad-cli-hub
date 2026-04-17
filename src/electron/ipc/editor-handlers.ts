import { ipcMain } from 'electron';
import type { ConfigLoader } from '../../config/loader.js';
import { logger } from '../../utils/logger.js';

const MAX_EDITOR_HISTORY = 10;

export function setupEditorHandlers(configLoader: ConfigLoader): void {
  ipcMain.handle('editor:getHistory', () => {
    try {
      return configLoader.getEditorHistory();
    } catch (error) {
      logger.error(`[IPC] Failed to get editor history: ${error}`);
      return [];
    }
  });

  ipcMain.handle('editor:setHistory', (_event, entries: string[]) => {
    try {
      const sanitized = Array.isArray(entries)
        ? entries.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
          .slice(0, MAX_EDITOR_HISTORY)
        : [];
      configLoader.setEditorHistory(sanitized);
      return { success: true };
    } catch (error) {
      logger.error(`[IPC] Failed to set editor history: ${error}`);
      return { success: false, error: String(error) };
    }
  });
}
