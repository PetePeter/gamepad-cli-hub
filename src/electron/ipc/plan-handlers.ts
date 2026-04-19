import type { BrowserWindow } from 'electron';
import { ipcMain } from 'electron';
import type { PlanManager } from '../../session/plan-manager.js';
import { logger } from '../../utils/logger.js';

export function setupPlanHandlers(
  planManager: PlanManager,
  getMainWindow?: () => BrowserWindow | null,
): void {
  // Forward plan:changed events to renderer (PlanManager self-saves to disk)
  planManager.on('plan:changed', (dirPath: string) => {
    const win = getMainWindow?.();
    if (win && !win.isDestroyed()) {
      win.webContents.send('plan:changed', dirPath);
    }
  });

  ipcMain.handle('plan:list', (_event, dirPath: string) => {
    return planManager.getForDirectory(dirPath);
  });

  ipcMain.handle('plan:create', (_event, dirPath: string, title: string, description: string) => {
    return planManager.create(dirPath, title, description);
  });

  ipcMain.handle('plan:update', (_event, id: string, updates: { title?: string; description?: string }) => {
    return planManager.update(id, updates);
  });

  ipcMain.handle('plan:delete', (_event, id: string) => {
    return planManager.delete(id);
  });

  ipcMain.handle('plan:addDep', (_event, fromId: string, toId: string) => {
    return planManager.addDependency(fromId, toId);
  });

  ipcMain.handle('plan:removeDep', (_event, fromId: string, toId: string) => {
    return planManager.removeDependency(fromId, toId);
  });

  ipcMain.handle('plan:apply', (_event, id: string, sessionId: string) => {
    return planManager.applyItem(id, sessionId);
  });

  ipcMain.handle('plan:complete', (_event, id: string) => {
    return planManager.completeItem(id);
  });

  ipcMain.handle(
    'plan:setState',
    (_event, id: string, status: 'pending' | 'startable' | 'doing' | 'blocked' | 'question', stateInfo?: string, sessionId?: string) => {
      return planManager.setState(id, status, stateInfo, sessionId);
    },
  );

  ipcMain.handle('plan:startableForDir', (_event, dirPath: string) => {
    return planManager.getStartableForDirectory(dirPath);
  });

  ipcMain.handle('plan:doingForSession', (_event, sessionId: string) => {
    return planManager.getDoingForSession(sessionId);
  });

  ipcMain.handle('plan:getAllDoingForDir', (_event, dirPath: string) => {
    return planManager.getAllDoingForDirectory(dirPath);
  });

  ipcMain.handle('plan:deps', (_event, dirPath: string) => {
    const exported = planManager.exportAll();
    return exported[dirPath]?.dependencies ?? [];
  });

  ipcMain.handle('plan:getItem', (_event, id: string) => {
    return planManager.getItem(id);
  });

  logger.info('[IPC] Plan handlers registered');
}
