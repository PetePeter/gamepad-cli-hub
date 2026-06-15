/**
 * ScheduledTaskHistoryManager Tests
 *
 * Uses the real manager + real persistence (writes to the actual config history
 * file). Each test clears history via clear() in afterEach to avoid leakage.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ScheduledTaskHistoryEntry } from '../types/scheduled-task.js';

// Isolate from disk: keep persistence purely in-memory so parallel test files
// do not contend on the shared scheduled-task-history.yaml.
let diskStore: ScheduledTaskHistoryEntry[] = [];
vi.mock('./scheduled-task-history-persistence.js', () => ({
  HISTORY_WINDOW_MS: 7 * 24 * 60 * 60 * 1000,
  saveScheduledTaskHistory: (entries: ScheduledTaskHistoryEntry[]) => { diskStore = [...entries]; },
  loadScheduledTaskHistory: () => [...diskStore],
}));

const {
  ScheduledTaskHistoryManager,
  HISTORY_WINDOW_MS,
} = await import('./scheduled-task-history-manager.js');

type NewEntry = Omit<ScheduledTaskHistoryEntry, 'id'>;

function makeEntry(overrides: Partial<NewEntry> = {}): NewEntry {
  return {
    taskId: 'task-1',
    title: 'Nightly report',
    initialPrompt: 'do the thing',
    cliType: 'claude-code',
    dirPath: 'X:\\coding\\test',
    planIds: [],
    ranAt: Date.now(),
    outcome: 'done',
    ...overrides,
  };
}

describe('ScheduledTaskHistoryManager', () => {
  let manager: InstanceType<typeof ScheduledTaskHistoryManager>;

  beforeEach(() => {
    manager = new ScheduledTaskHistoryManager();
    manager.clear();
  });

  afterEach(() => {
    manager.clear();
  });

  it('append assigns a UUID id and emits history:changed', () => {
    const listener = vi.fn();
    manager.on('history:changed', listener);

    const created = manager.append(makeEntry());

    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.title).toBe('Nightly report');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(manager.list()).toHaveLength(1);
  });

  it('list returns entries newest-first by ranAt', () => {
    const base = Date.now();
    manager.append(makeEntry({ taskId: 'old', ranAt: base - 3_000 }));
    manager.append(makeEntry({ taskId: 'new', ranAt: base - 1_000 }));
    manager.append(makeEntry({ taskId: 'mid', ranAt: base - 2_000 }));

    const ids = manager.list().map((e: ScheduledTaskHistoryEntry) => e.taskId);
    expect(ids).toEqual(['new', 'mid', 'old']);
  });

  it('prunes entries older than the 7-day window using injected clock', () => {
    const fixedNow = 1_000_000_000_000;
    manager = new ScheduledTaskHistoryManager(() => fixedNow);
    manager.clear();

    manager.append(makeEntry({ taskId: 'fresh', ranAt: fixedNow - 1000 }));
    manager.append(makeEntry({ taskId: 'stale', ranAt: fixedNow - HISTORY_WINDOW_MS - 1 }));

    const ids = manager.list().map((e: ScheduledTaskHistoryEntry) => e.taskId);
    expect(ids).toContain('fresh');
    expect(ids).not.toContain('stale');
  });

  it('clear empties the history', () => {
    manager.append(makeEntry());
    expect(manager.list()).toHaveLength(1);

    const listener = vi.fn();
    manager.on('history:changed', listener);
    manager.clear();

    expect(manager.list()).toHaveLength(0);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
