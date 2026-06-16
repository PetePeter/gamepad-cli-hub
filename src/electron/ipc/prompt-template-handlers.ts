/**
 * Prompt-template IPC handler group.
 *
 * Thin delegation layer: each channel delegates to the PromptTemplateManager
 * singleton created in handlers.ts. On every mutation the manager emits
 * 'prompt-template:changed', which this module listens to in order to:
 *   1. Persist the tree to YAML via savePromptTemplates().
 *   2. Fan-out a 'prompt-template:changed' event to all renderer windows.
 */

import { BrowserWindow, ipcMain } from 'electron';
import type { PromptTemplateManager } from '../../session/prompt-template-manager.js';
import { savePromptTemplates } from '../../session/prompt-template-persistence.js';
import { logger } from '../../utils/logger.js';

export function setupPromptTemplateHandlers(
  manager: PromptTemplateManager,
  savePath: string,
): void {
  // ── Mutation channels ──────────────────────────────────────────

  ipcMain.handle('prompt-template:list', () => manager.getTree());

  ipcMain.handle('prompt-template:getNode', (_event, id: string) =>
    manager.getNode(id),
  );

  ipcMain.handle('prompt-template:createFolder', (_event, name: string, parentId?: string | null) =>
    manager.createFolder(name, parentId ?? null),
  );

  ipcMain.handle('prompt-template:createTemplate', (_event, name: string, body: string, parentId?: string | null) =>
    manager.createTemplate(name, body, parentId ?? null),
  );

  ipcMain.handle('prompt-template:update', (_event, id: string, changes: { name?: string; body?: string }) =>
    manager.updateTemplate(id, changes),
  );

  ipcMain.handle('prompt-template:rename', (_event, id: string, name: string) =>
    manager.renameNode(id, name),
  );

  ipcMain.handle('prompt-template:delete', (_event, ids: string[]) =>
    manager.deleteNodes(ids),
  );

  ipcMain.handle('prompt-template:move', (_event, id: string, newParentId?: string | null) =>
    manager.moveNode(id, newParentId ?? null),
  );

  ipcMain.handle('prompt-template:reorder', (_event, id: string, newOrder: number) =>
    manager.reorderNode(id, newOrder),
  );

  // ── Change listener: persist + fan-out ──────────────────────────

  manager.on('prompt-template:changed', () => {
    try {
      savePromptTemplates(savePath, manager);
    } catch (err) {
      logger.error(`[IPC] Failed to save prompt templates: ${err}`);
    }

    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue;
      win.webContents.send('prompt-template:changed');
    }
  });

  logger.info('[IPC] Prompt-template handlers registered');
}
