/** Renderer-only, cursor-neutral Mess history and append notifications. */
import { BrowserWindow, ipcMain } from 'electron';
import { DEFAULT_MESS_HISTORY_MAX_BYTES, type MessHistoryOptions } from '../../session/mess-manager.js';
import type { MessManager } from '../../session/mess-manager.js';
import type { ProjectStore } from '../../session/project-store.js';
import type { SessionManager } from '../../session/manager.js';
import type { WindowManager } from '../window-manager.js';
import { logger } from '../../utils/logger.js';

const DEFAULT_HISTORY_HOURS = 24;
const MAX_HISTORY_HOURS = 24 * 30;
const MAX_HISTORY_LIMIT = 500;
const MAX_HISTORY_BYTES = DEFAULT_MESS_HISTORY_MAX_BYTES;

function validateProjectId(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error('projectId must be a non-empty string');
  return value;
}

function validateOptions(value: unknown): MessHistoryOptions {
  if (value === undefined) return { sinceHours: DEFAULT_HISTORY_HOURS };
  if (!value || typeof value !== 'object') throw new Error('Mess history options must be an object');
  const options = value as Partial<MessHistoryOptions>;
  const sinceHours = options.sinceHours ?? DEFAULT_HISTORY_HOURS;
  if (typeof sinceHours !== 'number' || !Number.isFinite(sinceHours) || sinceHours < 0 || sinceHours > MAX_HISTORY_HOURS) {
    throw new Error(`sinceHours must be between 0 and ${MAX_HISTORY_HOURS}`);
  }
  const limit = options.limit ?? undefined;
  if (limit !== undefined && (!Number.isSafeInteger(limit) || limit <= 0 || limit > MAX_HISTORY_LIMIT)) {
    throw new Error(`limit must be between 1 and ${MAX_HISTORY_LIMIT}`);
  }
  const maxBytes = options.maxBytes ?? undefined;
  if (maxBytes !== undefined && (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > MAX_HISTORY_BYTES)) {
    throw new Error(`maxBytes must be between 1 and ${MAX_HISTORY_BYTES}`);
  }
  return { sinceHours, ...(limit === undefined ? {} : { limit }), ...(maxBytes === undefined ? {} : { maxBytes }) };
}

/** Register the read-only renderer Mess surface and its project-scoped push. */
export function setupMessHandlers(
  messManager: MessManager | null,
  projectStore: ProjectStore,
  windowManager: WindowManager,
  sessionManager: SessionManager,
): () => void {
  const historyHandler = (_event: Electron.IpcMainInvokeEvent, projectId: unknown, options?: unknown) => {
    const id = validateProjectId(projectId);
    const safeOptions = validateOptions(options);
    if (!projectStore.getById(id) || !messManager) return { entries: [], hasMore: false };
    try {
      return messManager.historyForProject(id, safeOptions);
    } catch (error) {
      logger.error(`[IPC] Failed to read Mess history for ${id}: ${error}`);
      return { entries: [], hasMore: false };
    }
  };
  ipcMain.handle('mess:history', historyHandler);

  const targetWindowsForProject = (projectId: string): BrowserWindow[] => {
    const targets: BrowserWindow[] = [];
    const mainWindow = windowManager.getMainWindow();
    const activeSession = sessionManager.getActiveSession();
    if (mainWindow && !mainWindow.isDestroyed() && activeSession
      && messManager?.getProjectIdForSession(activeSession.id) === projectId) {
      targets.push(mainWindow);
    }
    for (const window of windowManager.getAllWindows()) {
      if (window === mainWindow) continue;
      if (windowManager.getSessionsInWindow(window.id).some(
        sessionId => messManager?.getProjectIdForSession(sessionId) === projectId,
      )) {
        targets.push(window);
      }
    }
    return targets;
  };

  const onAppended = (entry: import('../../types/mess.js').MessEntry) => {
    if (!projectStore.getById(entry.projectId)) return;
    const payload = { projectId: entry.projectId, entry };
    for (const window of targetWindowsForProject(entry.projectId)) {
      if (!window.isDestroyed()) window.webContents.send('mess:appended', payload);
    }
  };
  messManager?.on('mess:appended', onAppended);

  return () => {
    messManager?.off('mess:appended', onAppended);
    ipcMain.removeHandler('mess:history');
  };
}
