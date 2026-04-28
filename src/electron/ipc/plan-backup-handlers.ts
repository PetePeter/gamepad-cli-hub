/**
 * IPC handlers for plan backup/restore operations.
 *
 * Provides the bridge between the renderer and PlanBackupManager.
 */

import type { IpcMain } from 'electron';
import type { WindowManager } from '../window-manager.js';
import type { PlanBackupManager } from '../../session/plan-backup-manager.js';
import type { BackupConfig } from '../../types/plan-backup.js';
import { logger } from '../../utils/logger.js';

export function setupBackupPlanHandlers(
  ipc: IpcMain,
  windowManager: WindowManager,
  getBackupManager: () => PlanBackupManager,
): void {
  ipc.handle('plan:listBackups', async (_event, dirPath: string) => {
    const manager = getBackupManager();
    if (!manager) {
      throw new Error('Backup manager not available');
    }
    return manager.listSnapshots(dirPath);
  });

  ipc.handle('plan:getBackupSummary', async (_event, dirPath: string) => {
    const manager = getBackupManager();
    if (!manager) {
      throw new Error('Backup manager not available');
    }
    return manager.getBackupSummary(dirPath);
  });

  ipc.handle('plan:restoreBackup', async (_event, snapshotPath: string) => {
    const manager = getBackupManager();
    if (!manager) {
      throw new Error('Backup manager not available');
    }
    return manager.restoreFromSnapshot(snapshotPath);
  });

  ipc.handle('plan:deleteBackup', async (_event, snapshotPath: string) => {
    const manager = getBackupManager();
    if (!manager) {
      throw new Error('Backup manager not available');
    }
    return manager.deleteSnapshot(snapshotPath);
  });

  ipc.handle('plan:createBackupNow', async (_event, dirPath: string) => {
    const manager = getBackupManager();
    if (!manager) {
      throw new Error('Backup manager not available');
    }
    const result = manager.createSnapshot(dirPath);
    if (!result.success) {
      throw new Error(result.error || 'Failed to create backup');
    }
    return result.metadata;
  });

  ipc.handle('plan:getBackupConfig', async () => {
    const manager = getBackupManager();
    if (!manager) {
      throw new Error('Backup manager not available');
    }
    return manager.getConfig();
  });

  ipc.handle('plan:setBackupConfig', async (_event, updates: Partial<BackupConfig>) => {
    const manager = getBackupManager();
    if (!manager) {
      throw new Error('Backup manager not available');
    }
    manager.updateConfig(updates);
    return true;
  });

  ipc.handle('plan:deleteAllBackups', async (_event, dirPath: string) => {
    const manager = getBackupManager();
    if (!manager) {
      throw new Error('Backup manager not available');
    }
    return manager.deleteAllSnapshots(dirPath);
  });

  // Forward events to renderer
  const manager = getBackupManager();

  manager.on('snapshot-created', (metadata, snapshotPath) => {
    const win = windowManager.getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('plan-backup:created', metadata, snapshotPath);
    }
  });

  manager.on('snapshot-deleted', (snapshotPath) => {
    const win = windowManager.getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('plan-backup:deleted', snapshotPath);
    }
  });

  manager.on('restored', (metadata, planCount, dependencyCount) => {
    const win = windowManager.getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('plan-backup:restored', metadata, planCount, dependencyCount);
    }
  });

  manager.on('config-changed', (config) => {
    const win = windowManager.getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('plan-backup:config-changed', config);
    }
  });

  logger.info('[PlanBackupHandlers] Registered IPC handlers');
}
