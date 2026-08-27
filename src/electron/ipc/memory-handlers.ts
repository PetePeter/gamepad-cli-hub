/** Renderer-only memory IPC. Ownership is derived from the sending window. */
import { BrowserWindow, ipcMain, shell } from 'electron';
import type { SessionManager } from '../../session/manager.js';
import type { MemoryAttachmentManager } from '../../session/memory-attachment-manager.js';
import type { MemoryManager } from '../../session/memory-manager.js';
import type { ArtifactTempRegistry } from '../../session/artifact-temp-registry.js';
import { HelmMemoryService } from '../../mcp/services/helm-memory-service.js';
import type { MemoryExportFormat, MemorySearchOptions } from '../../types/memory.js';
import type { WindowManager } from '../window-manager.js';

/** Pure owner rule kept separate so the security boundary is directly testable. */
export function resolveRendererMemorySession(
  senderWindowId: number,
  mainWindowId: number | null | undefined,
  mappedSessionIds: readonly string[],
  activeSessionId: string | null | undefined,
): string | null {
  if (mappedSessionIds.length === 1) return mappedSessionIds[0];
  if (mappedSessionIds.length !== 0) return null;
  if (mainWindowId === senderWindowId) return activeSessionId ?? null;
  return null;
}

function validateId(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${name} must be a non-empty string`);
  return value;
}

function validateGraphDepth(value: unknown): number {
  if (value === undefined) return 0;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 100) {
    throw new Error('graphDepth must be a nonnegative integer no greater than 100');
  }
  return value;
}

function validateFormat(value: unknown): MemoryExportFormat {
  if (value !== 'markdown' && value !== 'json') throw new Error('format must be markdown or json');
  return value;
}

function ownerResolver(sessionManager: SessionManager, windowManager: WindowManager) {
  return (event: Electron.IpcMainInvokeEvent): string | null => {
    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    if (!senderWindow || senderWindow.isDestroyed()) return null;
    return resolveRendererMemorySession(
      senderWindow.id,
      windowManager.getMainWindow()?.id,
      windowManager.getSessionsInWindow(senderWindow.id),
      sessionManager.getActiveSession()?.id,
    );
  };
}

/** Register the intentionally read-only renderer surface for durable memories. */
export function setupMemoryHandlers(
  memoryManager: MemoryManager,
  attachmentManager: MemoryAttachmentManager,
  sessionManager: SessionManager,
  windowManager: WindowManager,
  tempRegistry: ArtifactTempRegistry,
): void {
  const service = new HelmMemoryService(memoryManager, attachmentManager, tempRegistry);
  const resolveOwner = ownerResolver(sessionManager, windowManager);
  const requireOwner = (event: Electron.IpcMainInvokeEvent): string => {
    const sessionId = resolveOwner(event);
    if (!sessionId) throw new Error('Renderer memory access requires an owning session window');
    return sessionId;
  };

  ipcMain.handle('memory:list', (event) => service.listMemorySummaries(requireOwner(event)));
  ipcMain.handle('memory:get', (event, id: unknown) =>
    service.getMemoryRecord(requireOwner(event), validateId(id, 'memoryId')));
  ipcMain.handle('memory:search', (event, query: unknown, options?: MemorySearchOptions) => {
    if (typeof query !== 'string') throw new Error('query must be a string');
    const safeOptions = options ?? {};
    if (safeOptions.regex !== undefined && typeof safeOptions.regex !== 'boolean') throw new Error('regex must be boolean');
    return service.searchMemories(requireOwner(event), query, {
      regex: safeOptions.regex,
      graphDepth: validateGraphDepth(safeOptions.graphDepth),
    });
  });
  ipcMain.handle('memory:graph', (event, rootId: unknown, graphDepth?: unknown) =>
    service.graphMemory(requireOwner(event), validateId(rootId, 'rootId'), validateGraphDepth(graphDepth)));
  ipcMain.handle('memory:export', (event, format: unknown, rootId?: unknown, graphDepth?: unknown) =>
    service.exportMemories(
      requireOwner(event),
      validateFormat(format),
      rootId === undefined || rootId === null ? undefined : validateId(rootId, 'rootId'),
      validateGraphDepth(graphDepth),
    ));
  ipcMain.handle('memory:delete', (event, id: unknown) =>
    service.deleteMemory(requireOwner(event), validateId(id, 'memoryId')));

  ipcMain.handle('memory:attachment-list', (event, memoryId: unknown) =>
    service.listMemoryAttachments(requireOwner(event), validateId(memoryId, 'memoryId')));
  ipcMain.handle('memory:attachment-open', async (event, memoryId: unknown, attachmentId: unknown) => {
    const sessionId = requireOwner(event);
    const memory = validateId(memoryId, 'memoryId');
    const attachment = validateId(attachmentId, 'attachmentId');
    try {
      const { tempPath } = service.getMemoryAttachment(sessionId, memory, attachment);
      const error = await shell.openPath(tempPath);
      return error ? { success: false, error } : { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
  ipcMain.handle('memory:attachment-delete', (event, memoryId: unknown, attachmentId: unknown) =>
    service.deleteMemoryAttachment(
      requireOwner(event),
      validateId(memoryId, 'memoryId'),
      validateId(attachmentId, 'attachmentId'),
    ));
}
