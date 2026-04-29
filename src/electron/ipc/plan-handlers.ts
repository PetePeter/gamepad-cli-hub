import { ipcMain, shell, BrowserWindow } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { mkdirSync } from 'node:fs';
import type { PlanManager } from '../../session/plan-manager.js';
import type { IncomingPlansWatcher } from '../../session/incoming-plans-watcher.js';
import { PlanAttachmentManager } from '../../session/plan-attachment-manager.js';
import { logger } from '../../utils/logger.js';
import type { PlanItem, PlanDependency } from '../../types/plan.js';
import type { WindowManager } from '../window-manager.js';


export function setupPlanHandlers(
  planManager: PlanManager,
  windowManager?: WindowManager,
  incomingWatcher?: IncomingPlansWatcher,
): void {
  const getTargetWindows = () => windowManager?.getAllWindows() ?? BrowserWindow.getAllWindows();
  const attachmentManager = new PlanAttachmentManager(planManager);

  // Forward plan:changed events to all windows (PlanManager self-saves to disk)
  planManager.on('plan:changed', (dirPath: string) => {
    for (const win of getTargetWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('plan:changed', dirPath);
      }
    }
  });

  // Forward incoming-watcher events to all windows
  if (incomingWatcher) {
    incomingWatcher.on('incoming-imported', (event) => {
      for (const win of getTargetWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send('plan:incoming-imported', event);
        }
      }
    });
    incomingWatcher.on('incoming-error', (event) => {
      for (const win of getTargetWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send('plan:incoming-error', event);
        }
      }
    });
    incomingWatcher.on('incoming-error-cleared', (event) => {
      for (const win of getTargetWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send('plan:incoming-error-cleared', event);
        }
      }
    });
  }

  ipcMain.handle('plan:list', (_event, dirPath: string) => {
    return planManager.getForDirectory(dirPath);
  });

  ipcMain.handle('plan:create', (_event, dirPath: string, title: string, description: string, type?: 'bug' | 'feature' | 'research') => {
    return planManager.createWithType(dirPath, title, description, type);
  });

  ipcMain.handle('plan:update', (_event, id: string, updates: { title?: string; description?: string; type?: 'bug' | 'feature' | 'research' }) => {
    return planManager.updateWithType(id, updates);
  });

  ipcMain.handle('plan:delete', (_event, id: string) => {
    return planManager.delete(id);
  });

  ipcMain.handle('plan:clearCompleted', (_event, dirPath: string) => {
    return planManager.deleteCompletedForDirectory(dirPath);
  });

  ipcMain.handle('plan:addDep', (_event, fromId: string, toId: string) => {
    return planManager.addDependency(fromId, toId);
  });

  ipcMain.handle('plan:removeDep', (_event, fromId: string, toId: string) => {
    return planManager.removeDependency(fromId, toId);
  });

  ipcMain.handle('plan:apply', (_event, id: string, sessionId: string) => {
    // Apply transitions a ready plan to coding state (ready → coding)
    return planManager.applyItem(id, sessionId);
  });

  ipcMain.handle('plan:complete', (_event, id: string, completionNotes?: string) => {
    return planManager.completeItem(id, completionNotes);
  });

  ipcMain.handle('plan:reopen', (_event, id: string) => {
    return planManager.reopenItem(id);
  });

  ipcMain.handle(
    'plan:setState',
    (_event, id: string, status: 'planning' | 'ready' | 'coding' | 'review' | 'blocked', stateInfo?: string, sessionId?: string) => {
      // Never allow direct transition to 'done' via setState — only via plan_complete
      if (status === 'done') {
        logger.warn(`[plan:setState] Rejected transition to 'done' for ${id} — use plan_complete instead`);
        return null;
      }
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

  ipcMain.handle('plan:sequence-list', (_event, dirPath: string) => {
    return planManager.getSequencesForDirectory(dirPath);
  });

  ipcMain.handle(
    'plan:sequence-create',
    (_event, dirPath: string, title: string, missionStatement = '', sharedMemory = '') => {
      return planManager.createSequence(dirPath, title, missionStatement, sharedMemory);
    },
  );

  ipcMain.handle(
    'plan:sequence-update',
    (_event, id: string, updates: { title?: string; missionStatement?: string; sharedMemory?: string; order?: number }) => {
      return planManager.updateSequence(id, updates);
    },
  );

  ipcMain.handle('plan:sequence-delete', (_event, id: string) => {
    return planManager.deleteSequence(id);
  });

  ipcMain.handle('plan:sequence-assign', (_event, planId: string, sequenceId: string | null) => {
    return planManager.assignSequence(planId, sequenceId);
  });

  ipcMain.handle('plan:bulkAssignSequence', (_event, planIds: string[], sequenceId: string | null) => {
    return planManager.bulkAssignSequence(planIds, sequenceId);
  });

  ipcMain.handle('plan:attachment-list', (_event, planId: string) => {
    return attachmentManager.list(planId);
  });

  ipcMain.handle('plan:attachment-add-file', (_event, planId: string, filePath: string) => {
    try {
      const content = readFileSync(filePath);
      const attachment = attachmentManager.add(planId, {
        filename: basename(filePath),
        content,
      });
      planManager.emit('plan:changed', planManager.getItem(planId)?.dirPath ?? '');
      return attachment;
    } catch (error) {
      logger.warn(`[plan:attachment-add-file] Failed to attach ${filePath}: ${error}`);
      return null;
    }
  });

  ipcMain.handle('plan:attachment-delete', (_event, planId: string, attachmentId: string) => {
    try {
      const deleted = attachmentManager.delete(planId, attachmentId);
      if (deleted) {
        planManager.emit('plan:changed', planManager.getItem(planId)?.dirPath ?? '');
      }
      return deleted;
    } catch (error) {
      logger.warn(`[plan:attachment-delete] Failed to delete ${attachmentId}: ${error}`);
      return false;
    }
  });

  ipcMain.handle('plan:attachment-open', async (_event, planId: string, attachmentId: string) => {
    try {
      const { tempPath } = attachmentManager.getToTempFile(planId, attachmentId);
      const errorMessage = await shell.openPath(tempPath);
      if (errorMessage) {
        logger.warn(`[plan:attachment-open] Failed to open ${tempPath}: ${errorMessage}`);
        return false;
      }
      return true;
    } catch (error) {
      logger.warn(`[plan:attachment-open] Failed to open ${attachmentId}: ${error}`);
      return false;
    }
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

