/**
 * Prompt-template IPC handler group.
 *
 * Thin delegation layer: each channel delegates to the PromptTemplateManager
 * singleton created in handlers.ts. On every mutation the manager emits
 * 'prompt-template:changed', which this module listens to in order to:
 *   1. Persist the tree to YAML via savePromptTemplates().
 *   2. Fan-out a 'prompt-template:changed' event to all renderer windows.
 *
 * IPC payloads are untrusted runtime data crossing the renderer boundary, so
 * every mutation channel validates the shape of its arguments before touching
 * the manager. Invalid payloads throw a predictable Error (surfaced to the
 * renderer as a rejected invoke) and never mutate state.
 */

import { BrowserWindow, ipcMain } from 'electron';
import type { PromptTemplateManager } from '../../session/prompt-template-manager.js';
import { savePromptTemplates } from '../../session/prompt-template-persistence.js';
import { logger } from '../../utils/logger.js';

const CHANNELS = [
  'prompt-template:list',
  'prompt-template:getNode',
  'prompt-template:createFolder',
  'prompt-template:createTemplate',
  'prompt-template:update',
  'prompt-template:rename',
  'prompt-template:delete',
  'prompt-template:move',
  'prompt-template:reorder',
] as const;

// ── Argument validators ───────────────────────────────────────────

/** Assert a value is a string, throwing a predictable error otherwise. */
function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Invalid ${label}: expected string`);
  }
  return value;
}

/** Assert a value is a non-empty string (used for ids). */
function requireNonEmptyString(value: unknown, label: string): string {
  const str = requireString(value, label);
  if (str.length === 0) {
    throw new Error(`Invalid ${label}: must not be empty`);
  }
  return str;
}

/** Assert a value is an optional parent id: string | null | undefined. */
function requireOptionalParentId(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return requireNonEmptyString(value, 'parentId');
}

/** Assert a value is an array of non-empty strings. */
function requireStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid ${label}: expected array of strings`);
  }
  return value.map((item) => requireNonEmptyString(item, `${label} entry`));
}

/** Assert a value is a finite integer (used for reorder index). */
function requireInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`Invalid ${label}: expected integer`);
  }
  return value;
}

/** Validate the update changes object: { name?: string; body?: string }. */
function requireChanges(value: unknown): { name?: string; body?: string } {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid changes: expected object');
  }
  const changes = value as Record<string, unknown>;
  const result: { name?: string; body?: string } = {};
  if (changes.name !== undefined) result.name = requireString(changes.name, 'name');
  if (changes.body !== undefined) result.body = requireString(changes.body, 'body');
  return result;
}

export function setupPromptTemplateHandlers(
  manager: PromptTemplateManager,
  savePath: string,
): () => void {
  // ── Read channels ──────────────────────────────────────────────

  ipcMain.handle('prompt-template:list', () => manager.getTree());

  ipcMain.handle('prompt-template:getNode', (_event, id: unknown) =>
    manager.getNode(requireNonEmptyString(id, 'id')),
  );

  // ── Mutation channels ──────────────────────────────────────────

  ipcMain.handle('prompt-template:createFolder', (_event, name: unknown, parentId?: unknown) =>
    manager.createFolder(requireString(name, 'name'), requireOptionalParentId(parentId)),
  );

  ipcMain.handle('prompt-template:createTemplate', (_event, name: unknown, body: unknown, parentId?: unknown) =>
    manager.createTemplate(requireString(name, 'name'), requireString(body, 'body'), requireOptionalParentId(parentId)),
  );

  ipcMain.handle('prompt-template:update', (_event, id: unknown, changes: unknown) =>
    manager.updateTemplate(requireNonEmptyString(id, 'id'), requireChanges(changes)),
  );

  ipcMain.handle('prompt-template:rename', (_event, id: unknown, name: unknown) =>
    manager.renameNode(requireNonEmptyString(id, 'id'), requireString(name, 'name')),
  );

  ipcMain.handle('prompt-template:delete', (_event, ids: unknown) =>
    manager.deleteNodes(requireStringArray(ids, 'ids')),
  );

  ipcMain.handle('prompt-template:move', (_event, id: unknown, newParentId?: unknown) =>
    manager.moveNode(requireNonEmptyString(id, 'id'), requireOptionalParentId(newParentId)),
  );

  ipcMain.handle('prompt-template:reorder', (_event, id: unknown, newOrder: unknown) =>
    manager.reorderNode(requireNonEmptyString(id, 'id'), requireInteger(newOrder, 'newOrder')),
  );

  // ── Change listener: persist + fan-out ──────────────────────────

  const onChange = () => {
    try {
      savePromptTemplates(savePath, manager);
    } catch (err) {
      logger.error(`[IPC] Failed to save prompt templates: ${err}`);
    }

    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue;
      win.webContents.send('prompt-template:changed');
    }
  };
  manager.on('prompt-template:changed', onChange);

  logger.info('[IPC] Prompt-template handlers registered');

  // Cleanup: detach the change listener and unregister channels so re-running
  // setup (or tests reusing a manager) never stacks duplicate saves/fan-outs.
  return () => {
    manager.off('prompt-template:changed', onChange);
    for (const channel of CHANNELS) {
      ipcMain.removeHandler(channel);
    }
  };
}
