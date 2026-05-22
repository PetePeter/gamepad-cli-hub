/**
 * Tests for the Telegram spawn wizard project selection step.
 * Covers pure helper functions that require no mocking of async dependencies.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { groupDirsByProject } from '../src/telegram/callback-handler.js';
import { spawnProjectKeyboard, _resetPathRegistry } from '../src/telegram/keyboards.js';

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ---------------------------------------------------------------------------
// groupDirsByProject
// ---------------------------------------------------------------------------

describe('groupDirsByProject', () => {
  const makeStore = (mapping: Record<string, { id: string; name: string } | undefined>) => ({
    findByPath: (path: string) => mapping[path],
  });

  it('groups dirs that share the same project id under one key', () => {
    const project = { id: 'proj-1', name: 'MyApp' };
    const store = makeStore({
      '/repo/main': project,
      '/repo/feature': project,
    });
    const dirs = [
      { name: 'main', path: '/repo/main' },
      { name: 'feature', path: '/repo/feature' },
    ];

    const groups = groupDirsByProject(dirs, store);

    expect(groups.size).toBe(1);
    const [key, values] = [...groups.entries()][0];
    expect(key.id).toBe('proj-1');
    expect(values).toHaveLength(2);
    expect(values.map(d => d.path)).toEqual(['/repo/main', '/repo/feature']);
  });

  it('skips dirs where findByPath returns undefined', () => {
    const store = makeStore({
      '/repo/known': { id: 'p1', name: 'Known' },
      // '/repo/unknown' not present → undefined
    });
    const dirs = [
      { name: 'known', path: '/repo/known' },
      { name: 'unknown', path: '/repo/unknown' },
    ];

    const groups = groupDirsByProject(dirs, store);

    expect(groups.size).toBe(1);
    const values = [...groups.values()][0];
    expect(values).toHaveLength(1);
    expect(values[0].path).toBe('/repo/known');
  });

  it('creates separate entries for dirs belonging to different projects', () => {
    const projA = { id: 'a', name: 'Alpha' };
    const projB = { id: 'b', name: 'Beta' };
    const store = makeStore({
      '/alpha/src': projA,
      '/beta/src': projB,
    });
    const dirs = [
      { name: 'src', path: '/alpha/src' },
      { name: 'src', path: '/beta/src' },
    ];

    const groups = groupDirsByProject(dirs, store);

    expect(groups.size).toBe(2);
    const ids = [...groups.keys()].map(k => k.id);
    expect(ids).toContain('a');
    expect(ids).toContain('b');
  });

  it('returns empty map when all dirs have no matching project', () => {
    const store = makeStore({});
    const dirs = [{ name: 'x', path: '/x' }];

    const groups = groupDirsByProject(dirs, store);

    expect(groups.size).toBe(0);
  });

  it('returns empty map for empty dirs input', () => {
    const store = makeStore({ '/x': { id: 'p1', name: 'P' } });

    const groups = groupDirsByProject([], store);

    expect(groups.size).toBe(0);
  });

  it('uses a canonical reference so all dirs of the same project share one Map key', () => {
    // findByPath returns a NEW object each call with the same id — groupDirsByProject
    // must deduplicate by id to keep a single Map key
    const store = {
      findByPath: (path: string) =>
        path.startsWith('/proj') ? { id: 'same', name: 'Same' } : undefined,
    };
    const dirs = [
      { name: 'a', path: '/proj/a' },
      { name: 'b', path: '/proj/b' },
      { name: 'c', path: '/proj/c' },
    ];

    const groups = groupDirsByProject(dirs, store);

    expect(groups.size).toBe(1);
    expect([...groups.values()][0]).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// spawnProjectKeyboard
// ---------------------------------------------------------------------------

describe('spawnProjectKeyboard', () => {
  beforeEach(() => {
    _resetPathRegistry();
  });

  it('produces callback_data in spawn:project:{id} format', () => {
    const projects = [{ id: 'abc-123', name: 'MyProject' }];
    const rows = spawnProjectKeyboard(projects);

    const button = rows[0][0];
    expect(button.callback_data).toBe('spawn:project:abc-123');
  });

  it('labels buttons with the project name', () => {
    const projects = [{ id: 'x', name: 'ShortName' }];
    const rows = spawnProjectKeyboard(projects);

    expect(rows[0][0].text).toBe('ShortName');
  });

  it('truncates long project names', () => {
    const projects = [{ id: 'x', name: 'A'.repeat(30) }];
    const rows = spawnProjectKeyboard(projects);

    expect(rows[0][0].text.length).toBeLessThanOrEqual(15);
    expect(rows[0][0].text).toMatch(/…$/);
  });

  it('places at most 3 projects per row', () => {
    const projects = Array.from({ length: 7 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
    const rows = spawnProjectKeyboard(projects);

    // Last row is the Back button — check content rows
    const contentRows = rows.slice(0, -1);
    for (const row of contentRows) {
      expect(row.length).toBeLessThanOrEqual(3);
    }
  });

  it('always has a Back button pointing to spawn:start as the last row', () => {
    const projects = [{ id: 'a', name: 'A' }];
    const rows = spawnProjectKeyboard(projects);

    const lastRow = rows[rows.length - 1];
    expect(lastRow).toHaveLength(1);
    expect(lastRow[0].callback_data).toBe('spawn:start');
    expect(lastRow[0].text).toContain('Back');
  });

  it('returns only the Back row for empty projects list', () => {
    const rows = spawnProjectKeyboard([]);

    expect(rows).toHaveLength(1);
    expect(rows[0][0].callback_data).toBe('spawn:start');
  });

  it('fills rows with exactly 3 items before starting a new row', () => {
    const projects = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
    const rows = spawnProjectKeyboard(projects);

    // 6 projects → 2 content rows of 3 + 1 back row
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveLength(3);
    expect(rows[1]).toHaveLength(3);
  });
});
