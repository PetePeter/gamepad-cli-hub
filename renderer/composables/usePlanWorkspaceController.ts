import { reactive } from 'vue';
import { backupsClient, plansClient } from '../ipc/clients.js';
import {
  planScreenState,
  refreshCanvasIfVisible,
  resetFilters,
  toggleAutoFilter,
  toggleHasAttachmentFilter,
  toggleRelatedFocus,
  toggleStatusFilter,
  toggleTypeFilter,
} from '../plans/plan-screen.js';

interface BackupMeta {
  timestamp: string;
  dirPath: string;
  planCount: number;
  dependencyCount: number;
  status: 'complete' | 'partial' | 'error';
  error?: string;
  sizeBytes?: number;
  index: number;
  snapshotPath?: string;
}

export interface PlanWorkspaceControllerDeps {
  addToast: (toast: { message: string; type: 'success' | 'error' | 'info' }) => void;
}

export function usePlanWorkspaceController(deps: PlanWorkspaceControllerDeps) {
  const backupRestore = reactive({
    visible: false,
    dirPath: '',
    snapshots: [] as BackupMeta[],
    loading: false,
  });

  async function onPlanPopOut(): Promise<void> {
    if (!planScreenState.currentDir) return;
    const result = await plansClient.planPopOut(planScreenState.currentDir);
    if (!result?.success) {
      console.error('[PlanWorkspace] Failed to pop out planner:', result?.error ?? 'unknown error');
    }
  }

  function onToggleTypeFilter(type: 'bug' | 'feature' | 'research' | 'untyped'): void {
    toggleTypeFilter(type);
  }

  function onToggleStatusFilter(status: 'planning' | 'ready' | 'coding' | 'review' | 'blocked' | 'done'): void {
    toggleStatusFilter(status);
  }

  function onResetFilters(): void {
    resetFilters();
  }

  function onToggleHasAttachmentFilter(value: 'yes' | 'no'): void {
    toggleHasAttachmentFilter(value);
  }

  function onToggleAutoFilter(): void {
    toggleAutoFilter();
  }

  function onToggleRelatedFocus(): void {
    toggleRelatedFocus();
  }

  async function openBackupRestore(): Promise<void> {
    backupRestore.dirPath = planScreenState.currentDir;
    backupRestore.loading = true;
    backupRestore.visible = true;
    try {
      const snapshots = await backupsClient.planListBackups(backupRestore.dirPath);
      backupRestore.snapshots = snapshots;
    } catch {
      backupRestore.snapshots = [];
    } finally {
      backupRestore.loading = false;
    }
  }

  async function onBackupRestore(snapshotPath: string): Promise<void> {
    try {
      const snapshot = backupRestore.snapshots.find((entry) => entry.snapshotPath === snapshotPath);
      const result = await backupsClient.planRestoreBackup(snapshotPath);
      if (result && typeof result === 'object' && 'success' in result && result.success) {
        const timestamp = snapshot?.timestamp ? new Date(snapshot.timestamp).toLocaleString() : '';
        planScreenState.notice = timestamp ? `Restored backup from ${timestamp}` : 'Restored from backup';
        void refreshCanvasIfVisible();
      }
    } catch {
      planScreenState.notice = 'Restore failed';
    }
    backupRestore.visible = false;
  }

  async function onBackupDelete(snapshotPath: string): Promise<void> {
    try {
      await backupsClient.planDeleteBackup(snapshotPath);
      const snapshots = await backupsClient.planListBackups(backupRestore.dirPath);
      backupRestore.snapshots = snapshots;
      deps.addToast({ message: 'Backup deleted', type: 'info' });
    } catch (err) {
      deps.addToast({ message: err instanceof Error ? err.message : 'Failed to delete backup', type: 'error' });
    }
  }

  async function onBackupNow(): Promise<void> {
    try {
      const metadata = await backupsClient.planCreateBackupNow(backupRestore.dirPath);
      const snapshots = await backupsClient.planListBackups(backupRestore.dirPath);
      backupRestore.snapshots = snapshots;
      deps.addToast({
        message: metadata?.timestamp
          ? `Backup created ${new Date(metadata.timestamp).toLocaleString()}`
          : 'Backup created',
        type: 'success',
      });
    } catch (err) {
      deps.addToast({ message: err instanceof Error ? err.message : 'Backup failed', type: 'error' });
    }
  }

  function onBackupClose(): void {
    backupRestore.visible = false;
  }

  return {
    backupRestore,
    onPlanPopOut,
    onToggleTypeFilter,
    onToggleStatusFilter,
    onResetFilters,
    onToggleHasAttachmentFilter,
    onToggleAutoFilter,
    onToggleRelatedFocus,
    openBackupRestore,
    onBackupRestore,
    onBackupDelete,
    onBackupNow,
    onBackupClose,
  };
}
