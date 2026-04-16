import { ipcMain } from 'electron';
import type { PlanManager } from '../../session/plan-manager.js';
import { savePlans } from '../../session/persistence.js';
import { logger } from '../../utils/logger.js';

export function setupPlanHandlers(planManager: PlanManager): void {
  // Auto-save on any change
  planManager.on('plan:changed', () => {
    savePlans(planManager.exportAll());
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

  ipcMain.handle('plan:startableForDir', (_event, dirPath: string) => {
    return planManager.getStartableForDirectory(dirPath);
  });

  ipcMain.handle('plan:doingForSession', (_event, sessionId: string) => {
    return planManager.getDoingForSession(sessionId);
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
