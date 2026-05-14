import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  planScreenState: {
    currentDir: 'X:\\coding\\gamepad-cli-hub',
    notice: '',
  },
  planPopOut: vi.fn(),
  planListBackups: vi.fn(),
  planRestoreBackup: vi.fn(),
  planDeleteBackup: vi.fn(),
  planCreateBackupNow: vi.fn(),
  refreshCanvasIfVisible: vi.fn(),
  toggleTypeFilter: vi.fn(),
  toggleStatusFilter: vi.fn(),
  toggleRelatedFocus: vi.fn(),
  resetFilters: vi.fn(),
  toggleHasAttachmentFilter: vi.fn(),
  toggleAutoFilter: vi.fn(),
}));

vi.mock('../../renderer/ipc/clients.js', () => ({
  plansClient: { planPopOut: mocks.planPopOut },
  backupsClient: {
    planListBackups: mocks.planListBackups,
    planRestoreBackup: mocks.planRestoreBackup,
    planDeleteBackup: mocks.planDeleteBackup,
    planCreateBackupNow: mocks.planCreateBackupNow,
  },
}));
vi.mock('../../renderer/plans/plan-screen.js', () => ({
  planScreenState: mocks.planScreenState,
  refreshCanvasIfVisible: mocks.refreshCanvasIfVisible,
  toggleTypeFilter: mocks.toggleTypeFilter,
  toggleStatusFilter: mocks.toggleStatusFilter,
  toggleRelatedFocus: mocks.toggleRelatedFocus,
  resetFilters: mocks.resetFilters,
  toggleHasAttachmentFilter: mocks.toggleHasAttachmentFilter,
  toggleAutoFilter: mocks.toggleAutoFilter,
}));

import { usePlanWorkspaceController } from '../../renderer/composables/usePlanWorkspaceController.js';

describe('usePlanWorkspaceController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.planScreenState.currentDir = 'X:\\coding\\gamepad-cli-hub';
    mocks.planScreenState.notice = '';
    mocks.planPopOut.mockResolvedValue({ success: true });
    mocks.planListBackups.mockResolvedValue([]);
    mocks.planRestoreBackup.mockResolvedValue({ success: true });
    mocks.planDeleteBackup.mockResolvedValue(undefined);
    mocks.planCreateBackupNow.mockResolvedValue({ timestamp: '2026-05-15T00:00:00.000Z' });
  });

  it('opens the backup modal with snapshots for the current plan directory', async () => {
    const snapshots = [{ timestamp: '2026-05-15T00:00:00.000Z', dirPath: 'dir', planCount: 1, dependencyCount: 0, status: 'complete', index: 0, snapshotPath: 'snap.json' }];
    mocks.planListBackups.mockResolvedValue(snapshots);
    const controller = usePlanWorkspaceController({ addToast: vi.fn() });

    await controller.openBackupRestore();

    expect(controller.backupRestore.visible).toBe(true);
    expect(controller.backupRestore.loading).toBe(false);
    expect(controller.backupRestore.dirPath).toBe('X:\\coding\\gamepad-cli-hub');
    expect(controller.backupRestore.snapshots).toEqual(snapshots);
  });

  it('restores a backup, refreshes canvas, and closes the modal', async () => {
    const controller = usePlanWorkspaceController({ addToast: vi.fn() });
    controller.backupRestore.visible = true;
    controller.backupRestore.snapshots = [{ timestamp: '2026-05-15T00:00:00.000Z', dirPath: 'dir', planCount: 1, dependencyCount: 0, status: 'complete', index: 0, snapshotPath: 'snap.json' }];

    await controller.onBackupRestore('snap.json');

    expect(mocks.planRestoreBackup).toHaveBeenCalledWith('snap.json');
    expect(mocks.refreshCanvasIfVisible).toHaveBeenCalled();
    expect(mocks.planScreenState.notice).toContain('Restored backup from');
    expect(controller.backupRestore.visible).toBe(false);
  });

  it('routes filter and pop-out actions through the plan workspace boundary', async () => {
    const controller = usePlanWorkspaceController({ addToast: vi.fn() });

    controller.onToggleTypeFilter('feature');
    controller.onToggleStatusFilter('ready');
    controller.onToggleHasAttachmentFilter('yes');
    controller.onToggleAutoFilter();
    controller.onToggleRelatedFocus();
    controller.onResetFilters();
    await controller.onPlanPopOut();

    expect(mocks.toggleTypeFilter).toHaveBeenCalledWith('feature');
    expect(mocks.toggleStatusFilter).toHaveBeenCalledWith('ready');
    expect(mocks.toggleHasAttachmentFilter).toHaveBeenCalledWith('yes');
    expect(mocks.toggleAutoFilter).toHaveBeenCalled();
    expect(mocks.toggleRelatedFocus).toHaveBeenCalled();
    expect(mocks.resetFilters).toHaveBeenCalled();
    expect(mocks.planPopOut).toHaveBeenCalledWith('X:\\coding\\gamepad-cli-hub');
  });
});
