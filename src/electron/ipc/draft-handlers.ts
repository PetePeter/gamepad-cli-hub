import { ipcMain } from 'electron';
import type { DraftManager } from '../../session/draft-manager.js';
import { saveDrafts } from '../../session/persistence.js';
import { logger } from '../../utils/logger.js';

export function setupDraftHandlers(draftManager: DraftManager): void {
  // Auto-save on any change
  draftManager.on('draft:changed', () => {
    saveDrafts(draftManager.exportAll());
  });

  ipcMain.handle('draft:create', (_event, sessionId: string, label: string, text: string) => {
    return draftManager.create(sessionId, label, text);
  });

  ipcMain.handle('draft:update', (_event, draftId: string, updates: { label?: string; text?: string }) => {
    return draftManager.update(draftId, updates);
  });

  ipcMain.handle('draft:delete', (_event, draftId: string) => {
    return draftManager.delete(draftId);
  });

  ipcMain.handle('draft:list', (_event, sessionId: string) => {
    return draftManager.getForSession(sessionId);
  });

  ipcMain.handle('draft:count', (_event, sessionId: string) => {
    return draftManager.count(sessionId);
  });

  logger.info('[IPC] Draft handlers registered');
}
