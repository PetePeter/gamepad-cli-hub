/**
 * RecycleBinManager — rolling 30-day bin of closed, recoverable sessions.
 *
 * Mirrors the rolling-window pattern of ScheduledTaskHistoryManager. In-memory
 * list is newest-first; on every append stale entries (older than
 * RECYCLE_BIN_WINDOW_MS) are pruned and the list is persisted.
 *
 * Only sessions that carried a cliSessionName are recoverable, so only those
 * are ever added (see recordRemovedSession).
 *
 * The clock is injectable so retention pruning is deterministic in tests.
 */

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import {
  saveRecycleBin,
  loadRecycleBin,
  RECYCLE_BIN_WINDOW_MS,
} from './recycle-bin-persistence.js';
import type { RecycleBinEntry } from '../types/recycle-bin.js';
import type { SessionRemovedEvent } from '../types/session.js';

export { RECYCLE_BIN_WINDOW_MS };

export class RecycleBinManager extends EventEmitter {
  private entries: RecycleBinEntry[];

  constructor(private readonly now: () => number = Date.now) {
    super();
    this.entries = loadRecycleBin();
  }

  /**
   * Add a closed session. Assigns an id, inserts newest-first, prunes the
   * retention window, persists, and emits 'recycle-bin:changed'.
   */
  append(entry: Omit<RecycleBinEntry, 'id'>): RecycleBinEntry {
    const created: RecycleBinEntry = { id: randomUUID(), ...entry };
    this.entries.unshift(created);
    this.prune();
    saveRecycleBin(this.entries);
    this.emit('recycle-bin:changed');
    return created;
  }

  /** All entries, newest close first. */
  list(): RecycleBinEntry[] {
    return [...this.entries].sort((a, b) => b.closedAt - a.closedAt);
  }

  /** Number of recoverable entries currently in the bin. */
  count(): number {
    return this.entries.length;
  }

  /**
   * Restore an entry: returns it (so the caller can re-spawn with
   * resumeSessionName) and removes it from the bin. Returns null if unknown.
   */
  restore(id: string): RecycleBinEntry | null {
    const found = this.entries.find(e => e.id === id) ?? null;
    if (found) this.forget(id);
    return found;
  }

  /** Forget (permanently delete) a single entry. */
  forget(id: string): void {
    const before = this.entries.length;
    this.entries = this.entries.filter(e => e.id !== id);
    if (this.entries.length === before) return;
    saveRecycleBin(this.entries);
    this.emit('recycle-bin:changed');
  }

  /** Empty the bin. */
  empty(): void {
    this.entries = [];
    saveRecycleBin(this.entries);
    this.emit('recycle-bin:changed');
  }

  /** Drop entries whose closedAt falls outside the retention window. */
  private prune(): void {
    const cutoff = this.now() - RECYCLE_BIN_WINDOW_MS;
    this.entries = this.entries.filter(e => e.closedAt >= cutoff);
  }
}

/**
 * Wiring helper for the session:removed event. A closed session is recoverable
 * only when it carried both a cliSessionName (resume UUID) and a workingDir —
 * the same condition under which its directory is auto-bookmarked. Keeps that
 * bookmark side effect and the bin append together and unit-testable.
 */
export function recordRemovedSession(
  event: SessionRemovedEvent,
  recycleBin: Pick<RecycleBinManager, 'append'>,
  bookmarkDir: (dir: string) => void,
  runtimeGroup?: { id: string; name: string },
): RecycleBinEntry | null {
  const session = event.session;
  if (!session?.cliSessionName || !session.workingDir) return null;

  bookmarkDir(session.workingDir);
  return recycleBin.append({
    sessionId: event.sessionId,
    name: session.name,
    cliType: session.cliType,
    workingDir: session.workingDir,
    cliSessionName: session.cliSessionName,
    closedAt: event.timestamp,
    // Tag the bin entry with the session's runtime group so restore can re-add
    // it (recreating the group by id+name if it was closed meanwhile).
    ...(runtimeGroup ? { runtimeGroupId: runtimeGroup.id, runtimeGroupName: runtimeGroup.name } : {}),
  });
}
