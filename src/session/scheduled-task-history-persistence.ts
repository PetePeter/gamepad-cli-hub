/**
 * Persistence for scheduled-task run history.
 *
 * Mirrors scheduled-task-persistence: YAML shape { entries: [...] } written via
 * atomicWriteFileSync. Dates (endDate) serialize as ISO strings. On load, stale
 * entries (ranAt older than the 7-day window) are defensively dropped so the
 * file cannot grow unbounded even if pruning was skipped.
 */

import { existsSync, readFileSync } from 'node:fs';
import * as YAML from 'yaml';
import { logger } from '../utils/logger.js';
import type { ScheduledTaskHistoryEntry } from '../types/scheduled-task.js';
import { SCHEDULED_TASK_HISTORY_FILE } from './persistence-paths.js';
import { atomicWriteFileSync, isRecord } from './persistence-utils.js';

/** Retention window: entries older than this (by ranAt) are discarded. */
export const HISTORY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function saveScheduledTaskHistory(entries: ScheduledTaskHistoryEntry[]): void {
  try {
    const data = {
      entries: entries.map(e => ({
        ...e,
        ...(e.endDate ? { endDate: e.endDate.toISOString() } : {}),
      })),
    };
    atomicWriteFileSync(SCHEDULED_TASK_HISTORY_FILE, YAML.stringify(data));
  } catch (err) {
    logger.error(`Failed to save scheduled task history: ${err}`);
  }
}

export function loadScheduledTaskHistory(): ScheduledTaskHistoryEntry[] {
  try {
    if (!existsSync(SCHEDULED_TASK_HISTORY_FILE)) return [];
    const parsed = YAML.parse(readFileSync(SCHEDULED_TASK_HISTORY_FILE, 'utf8')) as unknown;
    if (!isRecord(parsed) || !Array.isArray(parsed.entries)) return [];

    const cutoff = Date.now() - HISTORY_WINDOW_MS;
    return parsed.entries
      .filter((e): e is Record<string, unknown> =>
        isRecord(e) && typeof e.ranAt === 'number' && e.ranAt >= cutoff)
      .map(e => ({
        ...(e as any),
        ...(typeof e.endDate === 'string' ? { endDate: new Date(e.endDate) } : {}),
      })) as ScheduledTaskHistoryEntry[];
  } catch (err) {
    logger.error(`Failed to load scheduled task history: ${err}`);
    return [];
  }
}
