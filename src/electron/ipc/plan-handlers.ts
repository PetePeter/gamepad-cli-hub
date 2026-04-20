import type { BrowserWindow } from 'electron';
import { ipcMain, shell } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { mkdirSync } from 'node:fs';
import type { PlanManager } from '../../session/plan-manager.js';
import type { IncomingPlansWatcher } from '../../session/incoming-plans-watcher.js';
import { logger } from '../../utils/logger.js';
import type { PlanItem, PlanDependency } from '../../types/plan.js';


export function setupPlanHandlers(
  planManager: PlanManager,
  getMainWindow?: () => BrowserWindow | null,
  incomingWatcher?: IncomingPlansWatcher,
): void {
  // Forward plan:changed events to renderer (PlanManager self-saves to disk)
  planManager.on('plan:changed', (dirPath: string) => {
    const win = getMainWindow?.();
    if (win && !win.isDestroyed()) {
      win.webContents.send('plan:changed', dirPath);
    }
  });

  // Forward incoming-watcher events to renderer
  if (incomingWatcher) {
    incomingWatcher.on('incoming-imported', (event) => {
      const win = getMainWindow?.();
      if (win && !win.isDestroyed()) {
        win.webContents.send('plan:incoming-imported', event);
      }
    });
    incomingWatcher.on('incoming-error', (event) => {
      const win = getMainWindow?.();
      if (win && !win.isDestroyed()) {
        win.webContents.send('plan:incoming-error', event);
      }
    });
    incomingWatcher.on('incoming-error-cleared', (event) => {
      const win = getMainWindow?.();
      if (win && !win.isDestroyed()) {
        win.webContents.send('plan:incoming-error-cleared', event);
      }
    });
  }

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
    (_event, id: string, status: 'pending' | 'startable' | 'doing' | 'wait-tests' | 'blocked' | 'question', stateInfo?: string, sessionId?: string) => {
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

  // ─── Incoming plans ────────────────────────────────────────────────────────

  ipcMain.handle('plan:incoming-list', () => {
    return incomingWatcher?.listFiles() ?? [];
  });

  ipcMain.handle('plan:incoming-delete', (_event, filename: string) => {
    return incomingWatcher?.deleteFile(filename) ?? false;
  });

  ipcMain.handle('plan:incoming-open', async (_event, filename: string) => {
    if (!incomingWatcher) return false;
    const safeName = basename(filename);
    const filePath = join(incomingWatcher.getIncomingDir(), safeName);
    const errorMessage = await shell.openPath(filePath);
    if (errorMessage) {
      logger.warn(`[plan:incoming-open] Failed to open ${safeName}: ${errorMessage}`);
      return false;
    }
    return true;
  });

  // ─── Export ───────────────────────────────────────────────────────────────

  ipcMain.handle('plan:export-item', (_event, planId: string) => {
    const result = planManager.exportItem(planId);
    return result ? JSON.stringify(result, null, 2) : null;
  });

  ipcMain.handle('plan:export-directory', (_event, dirPath: string) => {
    const result = planManager.exportDirectory(dirPath);
    return result ? JSON.stringify(result, null, 2) : null;
  });

  // ─── Import ───────────────────────────────────────────────────────────────

  ipcMain.handle('plan:import-file', (_event, jsonString: string, targetDirPath: string) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonString);
    } catch {
      logger.warn('[plan:import-file] Invalid JSON');
      return null;
    }

    return importParsed(planManager, parsed as Record<string, unknown>, targetDirPath);
  });

  /** Read a file from the local filesystem and return its contents. */
  ipcMain.handle('plan:read-file', (_event, filePath: string): string | null => {
    try {
      return readFileSync(filePath, 'utf8');
    } catch (err) {
      logger.warn(`[plan:read-file] Failed to read ${filePath}: ${err}`);
      return null;
    }
  });

  /** Write content to a local file. Creates parent directories as needed. */
  ipcMain.handle('plan:write-file', (_event, filePath: string, content: string): boolean => {
    try {
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, content, 'utf8');
      return true;
    } catch (err) {
      logger.warn(`[plan:write-file] Failed to write ${filePath}: ${err}`);
      return false;
    }
  });

  logger.info('[IPC] Plan handlers registered');
}

/**
 * Parse and import plan data from a JSON object.
 * Handles both single-item format and DirectoryPlan batch format.
 * Returns imported item(s) or null on failure.
 */
function importParsed(
  planManager: PlanManager,
  parsed: Record<string, unknown>,
  targetDirPath: string,
): PlanItem | PlanItem[] | null {
  // Batch format: { dirPath, items: [...], dependencies: [...] }
  if (Array.isArray(parsed.items)) {
    const deps = (parsed.dependencies as PlanDependency[]) ?? [];
    const imported: PlanItem[] = [];
    for (const rawItem of parsed.items as PlanItem[]) {
      const item = planManager.importItem(
        { ...rawItem, dirPath: targetDirPath || rawItem.dirPath },
        deps,
      );
      if (item) imported.push(item);
    }
    return imported.length > 0 ? imported : null;
  }

  // Single-item format: { item: {...}, dependencies: [...] } or flat PlanItem
  const rawItem = (parsed.item ?? parsed) as PlanItem;
  const deps = (parsed.dependencies as PlanDependency[]) ?? [];
  return planManager.importItem(
    { ...rawItem, dirPath: targetDirPath || rawItem.dirPath },
    deps,
  );
}

