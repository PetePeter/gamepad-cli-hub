/**
 * PlanBackupManager — Handles per-directory plan backup and restore.
 *
 * Features:
 * - Rolling window storage with configurable max snapshots
 * - Timestamped snapshots with ISO format
 * - Automatic cleanup of oldest snapshots
 * - Safe restore (original state retained on failure)
 * - EventEmitter for snapshot lifecycle events
 * - Config persistence to config/plan-backups.yaml
 */

import { mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';
import type {
  BackupMetadata,
  BackupConfig,
  BackupResult,
  RestoreResult,
  BackupSummary,
  PlanSnapshot,
} from '../types/plan-backup.js';
import type { DirectoryPlan } from '../types/plan.js';
import type { PlanManager } from './plan-manager.js';
import { logger } from '../utils/logger.js';
import { getConfigDir } from '../utils/app-paths.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SNAPSHOT_FILE_PATTERN = /^snapshot-(.+)-(\d+)\.json$/;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const BACKUP_CONFIG_FILE = 'plan-backups.yaml';

/**
 * Convert an ISO timestamp to a filesystem-safe version.
 * Replaces colons with dashes so filenames work on Windows.
 * Example: "2024-01-15T10:30:00.000Z" -> "2024-01-15T10-30-00.000Z"
 */
function toFsSafeTimestamp(iso: string): string {
  return iso.replace(/:/g, '-');
}

/** Events emitted by PlanBackupManager */
export interface PlanBackupEvents {
  'snapshot-created': [metadata: BackupMetadata, snapshotPath: string];
  'snapshot-deleted': [snapshotPath: string];
  'restored': [metadata: BackupMetadata, planCount: number, dependencyCount: number];
  'config-changed': [config: BackupConfig];
}

export class PlanBackupManager extends EventEmitter {
  private readonly backupsRootDir: string;
  private config: BackupConfig;
  private readonly configFilePath: string;

  constructor(
    private readonly planManager: PlanManager,
    configDir?: string,
    config?: Partial<BackupConfig>,
  ) {
    super();
    const resolvedConfigDir = configDir ?? getConfigDir(__dirname);
    this.backupsRootDir = join(resolvedConfigDir, 'plan-backups');
    this.configFilePath = join(resolvedConfigDir, BACKUP_CONFIG_FILE);
    this.config = { ...this.getDefaultConfig(), ...config };
    this.loadConfig();
  }

  /** Get the current backup configuration */
  getConfig(): BackupConfig {
    return { ...this.config };
  }

  /** Update the backup configuration */
  updateConfig(updates: Partial<BackupConfig>): void {
    this.config = { ...this.config, ...updates };
    this.saveConfig();
    this.emit('config-changed', this.getConfig());
  }

  /** Load configuration from config file */
  private loadConfig(): void {
    try {
      if (existsSync(this.configFilePath)) {
        const content = readFileSync(this.configFilePath, 'utf8');
        const loaded = JSON.parse(content) as Partial<BackupConfig>;
        this.config = { ...this.getDefaultConfig(), ...loaded };
        logger.info('[PlanBackupManager] Loaded config from file');
      }
    } catch (error) {
      logger.warn(`[PlanBackupManager] Failed to load config: ${error}`);
    }
  }

  /** Save configuration to config file */
  private saveConfig(): void {
    try {
      mkdirSync(dirname(this.configFilePath), { recursive: true });
      writeFileSync(this.configFilePath, JSON.stringify(this.config, null, 2), 'utf8');
      logger.debug('[PlanBackupManager] Saved config to file');
    } catch (error) {
      logger.error(`[PlanBackupManager] Failed to save config: ${error}`);
    }
  }

  /** Get default configuration values */
  private getDefaultConfig(): BackupConfig {
    return {
      enabled: true,
      maxSnapshots: 10,
      snapshotIntervalMs: 3600000, // 1 hour
      excludePaths: [],
    };
  }

  /**
   * Create a snapshot for a directory.
   * Enforces rolling window by pruning oldest snapshots after creation.
   */
  createSnapshot(dirPath: string, planData?: DirectoryPlan): BackupResult {
    if (!this.config.enabled) {
      return { success: false, error: 'Backups are disabled' };
    }

    if (this.config.excludePaths?.includes(dirPath)) {
      return { success: false, error: 'Directory is excluded from backups' };
    }

    try {
      // Export plan data if not provided
      const exportedPlan = planData ?? this.planManager.exportDirectory(dirPath);
      if (!exportedPlan) {
        return { success: false, error: 'Failed to export plan data for directory' };
      }

      // Ensure backup directory exists
      const backupDir = this.getBackupDirForPath(dirPath);
      mkdirSync(backupDir, { recursive: true });

      // Generate timestamp and index for same-second duplicates
      const timestamp = new Date().toISOString();
      const fsTimestamp = toFsSafeTimestamp(timestamp);
      const index = this.getNextIndexForTimestamp(backupDir, fsTimestamp);

      // Create metadata
      const metadata: BackupMetadata = {
        timestamp,
        dirPath,
        planCount: exportedPlan.items.length,
        dependencyCount: exportedPlan.dependencies.length,
        status: 'complete',
        index,
      };

      // Create snapshot
      const snapshot: PlanSnapshot = {
        metadata,
        planData: exportedPlan,
      };

      // Write snapshot file (use fs-safe timestamp for Windows compatibility)
      const filename = `snapshot-${fsTimestamp}-${index}.json`;
      const snapshotPath = join(backupDir, filename);
      writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf8');

      const stats = statSync(snapshotPath);
      metadata.sizeBytes = stats.size;

      logger.info(`[PlanBackupManager] Created snapshot for ${dirPath}: ${filename}`);

      // Emit event
      this.emit('snapshot-created', metadata, snapshotPath);

      // Prune old snapshots if we exceed maxSnapshots
      this.pruneOldSnapshots(backupDir);

      return {
        success: true,
        metadata,
        snapshotPath,
      };
    } catch (error) {
      logger.error(`[PlanBackupManager] Failed to create snapshot for ${dirPath}: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Restore a directory from a snapshot.
   * Original state is retained on failure.
   */
  restoreFromSnapshot(snapshotPath: string): RestoreResult {
    try {
      if (!existsSync(snapshotPath)) {
        return { success: false, error: 'Snapshot file not found' };
      }

      const content = readFileSync(snapshotPath, 'utf8');
      const snapshot: PlanSnapshot = JSON.parse(content) as PlanSnapshot;

      // Validate snapshot structure
      if (!this.validateSnapshot(snapshot)) {
        return { success: false, error: 'Invalid snapshot structure' };
      }

      // Import the snapshot data into the plan manager
      // The importAll method takes a Record<string, DirectoryPlan>
      const importData: Record<string, DirectoryPlan> = {
        [snapshot.metadata.dirPath]: snapshot.planData,
      };
      this.planManager.importAll(importData);

      logger.info(`[PlanBackupManager] Restored from ${basename(snapshotPath)}: ${snapshot.planData.items.length} plans, ${snapshot.planData.dependencies.length} dependencies`);

      // Emit event
      this.emit('restored', snapshot.metadata, snapshot.planData.items.length, snapshot.planData.dependencies.length);

      return {
        success: true,
        planCount: snapshot.planData.items.length,
        dependencyCount: snapshot.planData.dependencies.length,
      };
    } catch (error) {
      logger.error(`[PlanBackupManager] Failed to restore from ${snapshotPath}: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * List all snapshots for a directory.
   */
  listSnapshots(dirPath: string): BackupMetadata[] {
    const backupDir = this.getBackupDirForPath(dirPath);
    if (!existsSync(backupDir)) {
      return [];
    }

    const snapshots: BackupMetadata[] = [];
    const files = readdirSync(backupDir);

    for (const file of files) {
      const match = file.match(SNAPSHOT_FILE_PATTERN);
      if (match) {
        try {
          const snapshotPath = join(backupDir, file);
          const content = readFileSync(snapshotPath, 'utf8');
          const snapshot: PlanSnapshot = JSON.parse(content) as PlanSnapshot;
          // Clone metadata and attach snapshot path so the renderer can use it
          const metadata: BackupMetadata = { ...snapshot.metadata, snapshotPath };
          snapshots.push(metadata);
        } catch (error) {
          logger.warn(`[PlanBackupManager] Failed to read snapshot ${file}: ${error}`);
        }
      }
    }

    // Sort by timestamp descending, then index descending
    return snapshots.sort((a, b) => {
      const timeCompare = b.timestamp.localeCompare(a.timestamp);
      if (timeCompare !== 0) return timeCompare;
      return b.index - a.index;
    });
  }

  /**
   * Get a summary of all backups for a directory.
   */
  getBackupSummary(dirPath: string): BackupSummary {
    const snapshots = this.listSnapshots(dirPath);
    const backupDir = this.getBackupDirForPath(dirPath);

    let totalSizeBytes = 0;
    for (const snapshot of snapshots) {
      if (snapshot.sizeBytes) {
        totalSizeBytes += snapshot.sizeBytes;
      }
    }

    return {
      dirPath,
      snapshotCount: snapshots.length,
      totalSizeBytes,
      oldestSnapshot: snapshots.length > 0 ? snapshots[snapshots.length - 1].timestamp : undefined,
      newestSnapshot: snapshots.length > 0 ? snapshots[0].timestamp : undefined,
      snapshots,
    };
  }

  /**
   * Delete a specific snapshot.
   */
  deleteSnapshot(snapshotPath: string): boolean {
    try {
      if (existsSync(snapshotPath)) {
        unlinkSync(snapshotPath);
        logger.info(`[PlanBackupManager] Deleted snapshot ${basename(snapshotPath)}`);
        // Emit event
        this.emit('snapshot-deleted', snapshotPath);
        return true;
      }
      return false;
    } catch (error) {
      logger.error(`[PlanBackupManager] Failed to delete snapshot ${snapshotPath}: ${error}`);
      return false;
    }
  }

  /**
   * Delete all snapshots for a directory.
   */
  deleteAllSnapshots(dirPath: string): number {
    const backupDir = this.getBackupDirForPath(dirPath);
    if (!existsSync(backupDir)) {
      return 0;
    }

    let deleted = 0;
    const files = readdirSync(backupDir);

    for (const file of files) {
      const match = file.match(SNAPSHOT_FILE_PATTERN);
      if (match) {
        const snapshotPath = join(backupDir, file);
        if (this.deleteSnapshot(snapshotPath)) {
          deleted++;
        }
      }
    }

    return deleted;
  }

  /**
   * Get the path to the backup directory for a given directory path.
   * Directory path is encoded to be filesystem-safe.
   * Colons are replaced with dashes because they are reserved on Windows (drive letter separator).
   */
  private getBackupDirForPath(dirPath: string): string {
    // Encode the directory path to be filesystem-safe
    // Replace backslashes with forward slashes, then encode special chars
    // Colons are replaced to avoid Windows reserved character conflicts
    const encoded = dirPath
      .replace(/\\/g, '/')
      .replace(/:/g, '-')
      .replace(/[^a-zA-Z0-9\-_/]/g, '_');
    return join(this.backupsRootDir, encoded);
  }

  /**
   * Get the next index for a given timestamp (for same-second duplicates).
   */
  private getNextIndexForTimestamp(backupDir: string, timestamp: string): number {
    const files = readdirSync(backupDir);
    let maxIndex = -1;

    for (const file of files) {
      const match = file.match(SNAPSHOT_FILE_PATTERN);
      if (match && match[1] === timestamp) {
        const index = parseInt(match[2], 10);
        if (index > maxIndex) {
          maxIndex = index;
        }
      }
    }

    return maxIndex + 1;
  }

  /**
   * Prune old snapshots to enforce rolling window.
   * Deletes oldest snapshots until we have at most maxSnapshots.
   */
  private pruneOldSnapshots(backupDir: string): void {
    const snapshots: { file: string; timestamp: string; index: number }[] = [];
    const files = readdirSync(backupDir);

    for (const file of files) {
      const match = file.match(SNAPSHOT_FILE_PATTERN);
      if (match) {
        snapshots.push({
          file,
          timestamp: match[1],
          index: parseInt(match[2], 10),
        });
      }
    }

    // Sort by timestamp ascending, then index ascending (oldest first)
    snapshots.sort((a, b) => {
      const timeCompare = a.timestamp.localeCompare(b.timestamp);
      if (timeCompare !== 0) return timeCompare;
      return a.index - b.index;
    });

    // Delete oldest snapshots if we exceed maxSnapshots
    while (snapshots.length > this.config.maxSnapshots) {
      const oldest = snapshots.shift()!;
      const snapshotPath = join(backupDir, oldest.file);
      this.deleteSnapshot(snapshotPath);
    }
  }

  /**
   * Validate snapshot structure.
   */
  private validateSnapshot(snapshot: unknown): snapshot is PlanSnapshot {
    if (typeof snapshot !== 'object' || snapshot === null) {
      return false;
    }

    const s = snapshot as Record<string, unknown>;

    if (typeof s.metadata !== 'object' || s.metadata === null) {
      return false;
    }

    const m = s.metadata as BackupMetadata;

    if (typeof m.timestamp !== 'string' || !ISO_TIMESTAMP_PATTERN.test(m.timestamp)) {
      return false;
    }

    if (typeof m.dirPath !== 'string') {
      return false;
    }

    if (typeof m.planCount !== 'number') {
      return false;
    }

    if (typeof m.dependencyCount !== 'number') {
      return false;
    }

    if (typeof s.planData !== 'object' || s.planData === null) {
      return false;
    }

    const pd = s.planData as DirectoryPlan;

    if (!Array.isArray(pd.items)) {
      return false;
    }

    if (!Array.isArray(pd.dependencies)) {
      return false;
    }

    return true;
  }

  /**
   * Get the oldest snapshot for a directory.
   */
  getOldestSnapshot(dirPath: string): BackupMetadata | null {
    const snapshots = this.listSnapshots(dirPath);
    return snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
  }

  /**
   * Get the newest snapshot for a directory.
   */
  getNewestSnapshot(dirPath: string): BackupMetadata | null {
    const snapshots = this.listSnapshots(dirPath);
    return snapshots.length > 0 ? snapshots[0] : null;
  }
}
