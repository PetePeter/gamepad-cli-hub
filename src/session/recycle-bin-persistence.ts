/**
 * Persistence for the closed-session recycle bin.
 *
 * Mirrors scheduled-task-history-persistence: YAML shape { entries: [...] }
 * written via atomicWriteFileSync. On load, stale entries (closedAt older than
 * the retention window) are defensively dropped so the file cannot grow
 * unbounded even if pruning was skipped.
 */

import { existsSync, readFileSync } from 'node:fs';
import * as YAML from 'yaml';
import { logger } from '../utils/logger.js';
import type { RecycleBinEntry } from '../types/recycle-bin.js';
import { RECYCLE_BIN_FILE } from './persistence-paths.js';
import { atomicWriteFileSync, isRecord } from './persistence-utils.js';

/** Retention window: entries older than this (by closedAt) are discarded. */
export const RECYCLE_BIN_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export function saveRecycleBin(entries: RecycleBinEntry[]): void {
  try {
    atomicWriteFileSync(RECYCLE_BIN_FILE, YAML.stringify({ entries }));
  } catch (err) {
    logger.error(`Failed to save recycle bin: ${err}`);
  }
}

export function loadRecycleBin(): RecycleBinEntry[] {
  try {
    if (!existsSync(RECYCLE_BIN_FILE)) return [];
    const parsed = YAML.parse(readFileSync(RECYCLE_BIN_FILE, 'utf8')) as unknown;
    if (!isRecord(parsed) || !Array.isArray(parsed.entries)) return [];

    const cutoff = Date.now() - RECYCLE_BIN_WINDOW_MS;
    return parsed.entries.filter((e): e is RecycleBinEntry =>
      isRecord(e) &&
      typeof e.closedAt === 'number' && e.closedAt >= cutoff &&
      typeof e.cliSessionName === 'string' && e.cliSessionName.length > 0);
  } catch (err) {
    logger.error(`Failed to load recycle bin: ${err}`);
    return [];
  }
}
