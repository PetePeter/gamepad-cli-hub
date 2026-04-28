/**
 * PlanBackupManager unit tests.
 *
 * Tests snapshot CRUD, rolling window pruning, config persistence,
 * restore flow, and directory path encoding.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PlanManager } from '../src/session/plan-manager.js';

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../src/utils/app-paths.js', () => ({
  getConfigDir: () => '__config_dir__',
}));

describe('PlanBackupManager', () => {
  let tempDir: string;
  let PlanBackupManager: typeof import('../src/session/plan-backup-manager.js').PlanBackupManager;
  let backupManager: InstanceType<typeof import('../src/session/plan-backup-manager.js').PlanBackupManager>;
  let mockPlanManager: { exportDirectory: ReturnType<typeof vi.fn>; importAll: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    const mod = await import('../src/session/plan-backup-manager.js');
    PlanBackupManager = mod.PlanBackupManager;

    tempDir = join(dirname(fileURLToPath(import.meta.url)), '.tmp-backup-test-' + Math.random().toString(36).slice(2));
    mkdirSync(tempDir, { recursive: true });

    mockPlanManager = {
      exportDirectory: vi.fn().mockReturnValue({
        dirPath: '/test/dir',
        items: [{ id: 'p1', dirPath: '/test/dir', title: 'Test', description: 'desc', status: 'ready', createdAt: 1, updatedAt: 1 }],
        dependencies: [],
      }),
      importAll: vi.fn(),
    };

    backupManager = new PlanBackupManager(
      mockPlanManager as unknown as PlanManager,
      tempDir,
      { enabled: true, maxSnapshots: 10, snapshotIntervalMs: 3600000 },
    );
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('createSnapshot', () => {
    it('creates a snapshot file and returns success', () => {
      const result = backupManager.createSnapshot('/test/dir');
      expect(result.success).toBe(true);
      expect(result.metadata).toBeDefined();
      expect(result.metadata!.dirPath).toBe('/test/dir');
      expect(result.metadata!.planCount).toBe(1);
      expect(result.snapshotPath).toBeDefined();
      expect(existsSync(result.snapshotPath!)).toBe(true);
    });

    it('returns error when backups are disabled', () => {
      backupManager.updateConfig({ enabled: false });
      const result = backupManager.createSnapshot('/test/dir');
      expect(result.success).toBe(false);
      expect(result.error).toContain('disabled');
    });

    it('returns error when directory is excluded', () => {
      backupManager.updateConfig({ excludePaths: ['/test/dir'] });
      const result = backupManager.createSnapshot('/test/dir');
      expect(result.success).toBe(false);
      expect(result.error).toContain('excluded');
    });

    it('returns error when no plan data exists for directory', () => {
      mockPlanManager.exportDirectory.mockReturnValue(null);
      const result = backupManager.createSnapshot('/empty/dir');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to export');
    });
  });

  describe('listSnapshots', () => {
    it('returns empty array when no snapshots exist', () => {
      const snapshots = backupManager.listSnapshots('/test/dir');
      expect(snapshots).toEqual([]);
    });

    it('returns snapshots sorted newest first with snapshotPath populated', () => {
      backupManager.createSnapshot('/test/dir');
      const snapshots = backupManager.listSnapshots('/test/dir');
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].snapshotPath).toBeDefined();
      expect(snapshots[0].snapshotPath!.length).toBeGreaterThan(0);
      expect(snapshots[0].dirPath).toBe('/test/dir');
    });
  });

  describe('restoreFromSnapshot', () => {
    it('restores plan data from a snapshot', () => {
      const created = backupManager.createSnapshot('/test/dir');
      expect(created.snapshotPath).toBeDefined();

      const result = backupManager.restoreFromSnapshot(created.snapshotPath!);
      expect(result.success).toBe(true);
      expect(result.planCount).toBe(1);
      expect(mockPlanManager.importAll).toHaveBeenCalled();
    });

    it('returns error for non-existent snapshot file', () => {
      const result = backupManager.restoreFromSnapshot('/nonexistent/path.json');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('rolling window', () => {
    it('prunes oldest snapshots when exceeding maxSnapshots', () => {
      backupManager.updateConfig({ maxSnapshots: 3 });

      for (let i = 0; i < 5; i++) {
        backupManager.createSnapshot('/test/dir');
      }

      const snapshots = backupManager.listSnapshots('/test/dir');
      expect(snapshots).toHaveLength(3);
    });

    it('keeps all snapshots when under maxSnapshots', () => {
      backupManager.updateConfig({ maxSnapshots: 10 });

      for (let i = 0; i < 3; i++) {
        backupManager.createSnapshot('/test/dir');
      }

      const snapshots = backupManager.listSnapshots('/test/dir');
      expect(snapshots).toHaveLength(3);
    });
  });

  describe('deleteSnapshot', () => {
    it('deletes a specific snapshot file', () => {
      const created = backupManager.createSnapshot('/test/dir');
      expect(created.snapshotPath).toBeDefined();

      const deleted = backupManager.deleteSnapshot(created.snapshotPath!);
      expect(deleted).toBe(true);

      const snapshots = backupManager.listSnapshots('/test/dir');
      expect(snapshots).toHaveLength(0);
    });

    it('returns false for non-existent file', () => {
      expect(backupManager.deleteSnapshot('/nonexistent/path.json')).toBe(false);
    });
  });

  describe('config persistence', () => {
    it('saves and loads config', async () => {
      backupManager.updateConfig({ maxSnapshots: 5, snapshotIntervalMs: 7200000 });

      // Create a second manager reading from the same config directory
      const manager2 = new PlanBackupManager(
        mockPlanManager as unknown as PlanManager,
        tempDir,
      );
      const loaded = manager2.getConfig();
      expect(loaded.maxSnapshots).toBe(5);
      expect(loaded.snapshotIntervalMs).toBe(7200000);
    });

    it('loads documented YAML config format', async () => {
      writeFileSync(join(tempDir, 'plan-backups.yaml'), [
        'enabled: true',
        'maxSnapshots: 7',
        'snapshotIntervalMs: 7200000',
        'excludePaths:',
        '  - /skip/me',
      ].join('\n'));

      const manager2 = new PlanBackupManager(
        mockPlanManager as unknown as PlanManager,
        tempDir,
      );

      expect(manager2.getConfig()).toMatchObject({
        enabled: true,
        maxSnapshots: 7,
        snapshotIntervalMs: 7200000,
        excludePaths: ['/skip/me'],
      });
    });

    it('rejects invalid config ranges before saving', () => {
      expect(() => backupManager.updateConfig({ maxSnapshots: 0 })).toThrow('maxSnapshots');
      expect(() => backupManager.updateConfig({ snapshotIntervalMs: 30 * 60 * 1000 })).toThrow('snapshotIntervalMs');
    });
  });

  describe('directory path encoding', () => {
    it('handles Windows paths with backslashes', () => {
      const result = backupManager.createSnapshot('X:\\coding\\my-project');
      expect(result.success).toBe(true);

      const snapshots = backupManager.listSnapshots('X:\\coding\\my-project');
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].dirPath).toBe('X:\\coding\\my-project');
    });

    it('handles special characters in directory paths', () => {
      const result = backupManager.createSnapshot('/path/with spaces/and-dashes');
      expect(result.success).toBe(true);

      const snapshots = backupManager.listSnapshots('/path/with spaces/and-dashes');
      expect(snapshots).toHaveLength(1);
    });
  });

  describe('edge cases', () => {
    it('handles maxSnapshots=1 (keeps only the latest)', () => {
      backupManager.updateConfig({ maxSnapshots: 1 });
      backupManager.createSnapshot('/test/dir');
      backupManager.createSnapshot('/test/dir');
      backupManager.createSnapshot('/test/dir');

      const snapshots = backupManager.listSnapshots('/test/dir');
      expect(snapshots).toHaveLength(1);
    });

    it('handles empty dependencies array in snapshot', () => {
      mockPlanManager.exportDirectory.mockReturnValue({
        dirPath: '/test/dir',
        items: [{ id: 'p1', dirPath: '/test/dir', title: 'Solo', description: 'no deps', status: 'ready', createdAt: 1, updatedAt: 1 }],
        dependencies: [],
      });

      const result = backupManager.createSnapshot('/test/dir');
      expect(result.success).toBe(true);
      expect(result.metadata!.dependencyCount).toBe(0);

      // Verify restore works with empty deps
      const restoreResult = backupManager.restoreFromSnapshot(result.snapshotPath!);
      expect(restoreResult.success).toBe(true);
      expect(restoreResult.dependencyCount).toBe(0);
    });

    it('handles corrupt JSON in snapshot file gracefully', () => {
      // Create a corrupt file in the backup directory
      const backupDir = join(tempDir, 'plan-backups', 'test_dir');
      mkdirSync(backupDir, { recursive: true });
      writeFileSync(join(backupDir, 'snapshot-2024-04-28T09-30-00.000Z-0.json'), '{invalid json}');

      // listSnapshots should skip corrupt files, not throw
      const snapshots = backupManager.listSnapshots('/test/dir');
      expect(Array.isArray(snapshots)).toBe(true);
    });
  });

  describe('snapshot file content', () => {
    it('creates valid JSON with correct structure', () => {
      const result = backupManager.createSnapshot('/test/dir');
      expect(result.snapshotPath).toBeDefined();

      const content = JSON.parse(readFileSync(result.snapshotPath!, 'utf8'));

      expect(content.metadata).toBeDefined();
      expect(content.metadata.dirPath).toBe('/test/dir');
      expect(content.metadata.planCount).toBe(1);
      expect(content.metadata.status).toBe('complete');
      expect(content.planData).toBeDefined();
      expect(content.planData.items).toHaveLength(1);
      expect(content.planData.dirPath).toBe('/test/dir');
    });
  });
});
