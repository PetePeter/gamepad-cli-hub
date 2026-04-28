/**
 * Scheduled Task IPC Handlers
 *
 * CRUD operations for scheduled tasks.
 */

import { ipcMain, BrowserWindow } from 'electron';
import type { ScheduledTaskManager } from '../../session/scheduled-task-manager.js';
import type { WindowManager } from '../window-manager.js';
import type { CreateScheduledTaskParams, UpdateScheduledTaskParams } from '../../types/scheduled-task.js';
import { logger } from '../../utils/logger.js';

export function setupScheduledTaskHandlers(
  taskManager: ScheduledTaskManager,
  windowManager?: WindowManager,
): void {
  const getTargetWindows = () => windowManager?.getAllWindows() ?? BrowserWindow.getAllWindows();

  // Forward task:changed events to all windows
  taskManager.on('task:changed', (task) => {
    for (const win of getTargetWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('scheduled-task:changed', task);
      }
    }
  });

  ipcMain.handle('scheduled_task:create', async (_event, params: CreateScheduledTaskParams) => {
    try {
      return taskManager.createTask(params);
    } catch (err) {
      logger.error(`[scheduled_task:create] Failed: ${err}`);
      return null;
    }
  });

  ipcMain.handle('scheduled_task:list', () => {
    try {
      return taskManager.listTasks();
    } catch (err) {
      logger.error(`[scheduled_task:list] Failed: ${err}`);
      return [];
    }
  });

  ipcMain.handle('scheduled_task:get', (_event, id: string) => {
    try {
      return taskManager.getTask(id);
    } catch (err) {
      logger.error(`[scheduled_task:get] Failed: ${err}`);
      return null;
    }
  });

  ipcMain.handle('scheduled_task:update', (_event, id: string, updates: UpdateScheduledTaskParams) => {
    try {
      return taskManager.updateTask(id, updates);
    } catch (err) {
      logger.error(`[scheduled_task:update] Failed: ${err}`);
      return null;
    }
  });

  ipcMain.handle('scheduled_task:cancel', (_event, id: string) => {
    try {
      return taskManager.cancelTask(id);
    } catch (err) {
      logger.error(`[scheduled_task:cancel] Failed: ${err}`);
      return false;
    }
  });

  logger.info('[IPC] Scheduled task handlers registered');
}
