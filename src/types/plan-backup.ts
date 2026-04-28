/**
 * Plan Backup & Restore System Types
 *
 * Provides per-directory plan backup with rolling window storage.
 * Snapshots are stored in config/plan-backups/{encoded-dir-path}/.
 */

import type { DirectoryPlan } from './plan.js';

/** Snapshot status indicates whether the backup completed successfully */
export type SnapshotStatus = 'complete' | 'partial' | 'error';

/**
 * Metadata for a single plan backup snapshot.
 * Stored alongside the snapshot file for quick inspection.
 */
export interface BackupMetadata {
  /** ISO timestamp when snapshot was created */
  timestamp: string;
  /** Directory path this backup represents (decoded from directory name) */
  dirPath: string;
  /** Number of plan items in the snapshot */
  planCount: number;
  /** Number of dependencies in the snapshot */
  dependencyCount: number;
  /** Whether the snapshot completed successfully */
  status: SnapshotStatus;
  /** Error message if status is 'error' */
  error?: string;
  /** Snapshot file size in bytes */
  sizeBytes?: number;
  /** Index for same-second duplicates (0, 1, 2, ...) */
  index: number;
  /** Full path to the snapshot file (populated when listed) */
  snapshotPath?: string;
}

/**
 * A complete plan snapshot containing all plans and dependencies.
 * This is the content of the snapshot JSON file.
 */
export interface PlanSnapshot {
  /** Snapshot metadata */
  metadata: BackupMetadata;
  /** Full directory plan data */
  planData: DirectoryPlan;
}

/**
 * Configuration for the backup system.
 * Stored in settings.yaml under `planBackups` key.
 */
export interface BackupConfig {
  /** Whether automatic backups are enabled */
  enabled: boolean;
  /** Maximum number of snapshots to keep per directory (rolling window) */
  maxSnapshots: number;
  /** Interval between automatic backups in milliseconds */
  snapshotIntervalMs: number;
  /** Optional list of directory paths to exclude from backups */
  excludePaths?: string[];
}

/** Default configuration values */
export const DEFAULT_BACKUP_CONFIG: BackupConfig = {
  enabled: true,
  maxSnapshots: 10,
  snapshotIntervalMs: 3600000, // 1 hour
  excludePaths: [],
};

/**
 * Result of a backup operation.
 */
export interface BackupResult {
  /** Whether the backup completed successfully */
  success: boolean;
  /** The snapshot metadata (if successful) */
  metadata?: BackupMetadata;
  /** The full path to the snapshot file (if successful) */
  snapshotPath?: string;
  /** Error message (if failed) */
  error?: string;
}

/**
 * Result of a restore operation.
 */
export interface RestoreResult {
  /** Whether the restore completed successfully */
  success: boolean;
  /** Number of plans restored */
  planCount?: number;
  /** Number of dependencies restored */
  dependencyCount?: number;
  /** Error message (if failed) */
  error?: string;
}

/**
 * Summary of backups available for a directory.
 */
export interface BackupSummary {
  /** Directory path */
  dirPath: string;
  /** Number of snapshots available */
  snapshotCount: number;
  /** Total size of all snapshots in bytes */
  totalSizeBytes: number;
  /** Oldest snapshot timestamp */
  oldestSnapshot?: string;
  /** Newest snapshot timestamp */
  newestSnapshot?: string;
  /** List of snapshots (newest first) */
  snapshots: BackupMetadata[];
}
