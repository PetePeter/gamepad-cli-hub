/**
 * Plan backup IPC handler unit tests.
 * Tests the contract between IPC handlers and PlanBackupManager.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe('Plan backup IPC handlers', () => {
  let mockIpc: { handle: ReturnType<typeof vi.fn> };
  let mockWindowManager: { getMainWindow: ReturnType<typeof vi.fn> };
  let mockBackupManager: {
    listSnapshots: ReturnType<typeof vi.fn>;
    getBackupSummary: ReturnType<typeof vi.fn>;
    restoreFromSnapshot: ReturnType<typeof vi.fn>;
    deleteSnapshot: ReturnType<typeof vi.fn>;
    createSnapshot: ReturnType<typeof vi.fn>;
    getConfig: ReturnType<typeof vi.fn>;
    updateConfig: ReturnType<typeof vi.fn>;
    deleteAllSnapshots: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockIpc = { handle: vi.fn() };
    mockWindowManager = {
      getMainWindow: vi.fn(() => ({
        isDestroyed: () => false,
        webContents: { send: vi.fn() },
      })),
    };

    mockBackupManager = {
      listSnapshots: vi.fn().mockReturnValue([
        { timestamp: '2024-04-28T09:30:00.000Z', dirPath: '/d', planCount: 3, dependencyCount: 2, status: 'complete', index: 0 },
      ]),
      getBackupSummary: vi.fn().mockReturnValue({
        dirPath: '/d', snapshotCount: 1, totalSizeBytes: 1024,
      }),
      restoreFromSnapshot: vi.fn().mockReturnValue({ success: true, planCount: 3, dependencyCount: 2 }),
      deleteSnapshot: vi.fn().mockReturnValue(true),
      createSnapshot: vi.fn().mockReturnValue({ success: true, metadata: { timestamp: 't' } }),
      getConfig: vi.fn().mockReturnValue({ enabled: true, maxSnapshots: 10, snapshotIntervalMs: 3600000 }),
      updateConfig: vi.fn(),
      deleteAllSnapshots: vi.fn().mockReturnValue(2),
      on: vi.fn(),
    };
  });

  it('plan:listBackups calls listSnapshots with dirPath', async () => {
    const { setupBackupPlanHandlers } = await import('../src/electron/ipc/plan-backup-handlers.js');
    setupBackupPlanHandlers(mockIpc as any, mockWindowManager as any, () => mockBackupManager);

    const listBackupsCall = mockIpc.handle.mock.calls.find(call => call[0] === 'plan:listBackups');
    expect(listBackupsCall).toBeDefined();

    const handler = listBackupsCall![1];
    const result = await handler(null, '/d');
    expect(mockBackupManager.listSnapshots).toHaveBeenCalledWith('/d');
    expect(result).toHaveLength(1);
    expect(result[0].planCount).toBe(3);
  });

  it('plan:createBackupNow throws on failure', async () => {
    const { setupBackupPlanHandlers } = await import('../src/electron/ipc/plan-backup-handlers.js');
    setupBackupPlanHandlers(mockIpc as any, mockWindowManager as any, () => mockBackupManager);

    mockBackupManager.createSnapshot.mockReturnValue({ success: false, error: 'disabled' });

    const createCall = mockIpc.handle.mock.calls.find(call => call[0] === 'plan:createBackupNow');
    expect(createCall).toBeDefined();

    const handler = createCall![1];
    await expect(handler(null, '/d')).rejects.toThrow('disabled');
  });

  it('plan:restoreBackup returns restore result', async () => {
    const { setupBackupPlanHandlers } = await import('../src/electron/ipc/plan-backup-handlers.js');
    setupBackupPlanHandlers(mockIpc as any, mockWindowManager as any, () => mockBackupManager);

    const restoreCall = mockIpc.handle.mock.calls.find(call => call[0] === 'plan:restoreBackup');
    expect(restoreCall).toBeDefined();

    const handler = restoreCall![1];
    const result = await handler(null, '/path/to/snapshot.json');
    expect(mockBackupManager.restoreFromSnapshot).toHaveBeenCalledWith('/path/to/snapshot.json');
    expect(result.success).toBe(true);
    expect(result.planCount).toBe(3);
  });

  it('plan:getBackupConfig returns current config', async () => {
    const { setupBackupPlanHandlers } = await import('../src/electron/ipc/plan-backup-handlers.js');
    setupBackupPlanHandlers(mockIpc as any, mockWindowManager as any, () => mockBackupManager);

    const configCall = mockIpc.handle.mock.calls.find(call => call[0] === 'plan:getBackupConfig');
    expect(configCall).toBeDefined();

    const handler = configCall![1];
    const result = await handler(null);
    expect(result.enabled).toBe(true);
    expect(result.maxSnapshots).toBe(10);
  });

  it('plan:setBackupConfig calls updateConfig', async () => {
    const { setupBackupPlanHandlers } = await import('../src/electron/ipc/plan-backup-handlers.js');
    setupBackupPlanHandlers(mockIpc as any, mockWindowManager as any, () => mockBackupManager);

    const setConfigCall = mockIpc.handle.mock.calls.find(call => call[0] === 'plan:setBackupConfig');
    expect(setConfigCall).toBeDefined();

    const handler = setConfigCall![1];
    await handler(null, { maxSnapshots: 5 });
    expect(mockBackupManager.updateConfig).toHaveBeenCalledWith({ maxSnapshots: 5 });
  });
});
