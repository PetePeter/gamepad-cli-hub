/**
 * Recycle-bin persistence tests.
 *
 * Round-trips through the real recycle-bin file (same approach as the
 * scheduled-task-history persistence tests).
 */

import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  saveRecycleBin,
  loadRecycleBin,
  RECYCLE_BIN_WINDOW_MS,
} from './recycle-bin-persistence.js';
import { RECYCLE_BIN_FILE } from './persistence-paths.js';
import type { RecycleBinEntry } from '../types/recycle-bin.js';

function entry(overrides: Partial<RecycleBinEntry> = {}): RecycleBinEntry {
  return {
    id: 'id-1',
    sessionId: 'sess-1',
    name: 'claude-opus',
    cliType: 'claude-code',
    workingDir: 'X:\\coding\\test',
    cliSessionName: 'a1b2c3d4-e5f6-7890-abcd-ef0123456789',
    closedAt: Date.now(),
    ...overrides,
  };
}

describe('recycle-bin persistence', () => {
  afterEach(() => {
    saveRecycleBin([]);
  });

  it('round-trips entries through YAML', () => {
    saveRecycleBin([entry({ id: 'a', name: 'codex' })]);

    const loaded = loadRecycleBin();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('a');
    expect(loaded[0].name).toBe('codex');
    expect(loaded[0].cliSessionName).toBe('a1b2c3d4-e5f6-7890-abcd-ef0123456789');
  });

  it('filters out entries older than the 30-day window on load', () => {
    const now = Date.now();
    saveRecycleBin([
      entry({ id: 'fresh', closedAt: now - 1000 }),
      entry({ id: 'stale', closedAt: now - RECYCLE_BIN_WINDOW_MS - 5000 }),
    ]);

    const ids = loadRecycleBin().map(e => e.id);
    expect(ids).toContain('fresh');
    expect(ids).not.toContain('stale');
  });

  it('drops entries missing a cliSessionName (not recoverable)', () => {
    const now = Date.now();
    saveRecycleBin([
      entry({ id: 'ok', closedAt: now }),
      { ...entry({ id: 'bad', closedAt: now }), cliSessionName: '' },
    ]);

    const ids = loadRecycleBin().map(e => e.id);
    expect(ids).toEqual(['ok']);
  });

  it('returns [] for a missing file', () => {
    saveRecycleBin([]);
    expect(loadRecycleBin()).toEqual([]);
  });

  it('returns [] for a corrupt file', () => {
    mkdirSync(dirname(RECYCLE_BIN_FILE), { recursive: true });
    writeFileSync(RECYCLE_BIN_FILE, ':::not yaml: [unclosed', 'utf8');
    expect(loadRecycleBin()).toEqual([]);
    expect(existsSync(RECYCLE_BIN_FILE)).toBe(true);
  });
});
