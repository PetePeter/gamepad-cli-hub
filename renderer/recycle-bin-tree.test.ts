/**
 * buildRecycleTree — pure tree-builder for the Recycle Bin redesign (P-0642).
 *
 * Real function, a fake `resolveProject` (no mocks). Verifies the Project ▸ Group
 * ▸ Folder ▸ sessions bucketing, ungrouped-at-group-level rule, counts, ordering,
 * search filtering, and the regression guard that no expiry data leaks into the
 * built model.
 */

import { describe, it, expect } from 'vitest';
import type { RecycleBinEntry } from '../src/types/recycle-bin.js';
import {
  buildRecycleTree,
  matchesRecycleQuery,
  NO_PROJECT_ID,
  NO_PROJECT_NAME,
  type RecycleFolderNode,
  type RecycleGroupNode,
} from './recycle-bin-tree.js';

let seq = 0;
function makeEntry(overrides: Partial<RecycleBinEntry> = {}): RecycleBinEntry {
  seq += 1;
  return {
    id: `bin-${seq}`,
    sessionId: `sess-${seq}`,
    name: `session-${seq}`,
    cliType: 'claude-code',
    workingDir: 'x:/coding/helm/src',
    cliSessionName: `uuid-${seq}`,
    closedAt: 1_700_000_000_000 + seq * 1000,
    ...overrides,
  };
}

/** resolveProject fake: map by a workingDir prefix → project. Unknown dirs → null. */
function projectResolver(map: Record<string, { id: string; name: string }>) {
  return (entry: RecycleBinEntry) => {
    for (const [prefix, project] of Object.entries(map)) {
      if (entry.workingDir.startsWith(prefix)) return project;
    }
    return null;
  };
}

const HELM = { id: 'p-helm', name: 'Helm' };
const resolveHelm = projectResolver({ 'x:/coding/helm': HELM });

describe('buildRecycleTree', () => {
  it('T1 buckets flat entries into project → group → folder', () => {
    const entries = [
      makeEntry({ workingDir: 'x:/coding/helm/src', runtimeGroupId: 'g1', runtimeGroupName: 'Nightwork' }),
    ];
    const tree = buildRecycleTree(entries, resolveHelm);

    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('p-helm');
    expect(tree[0].name).toBe('Helm');
    const group = tree[0].children[0] as RecycleGroupNode;
    expect(group.kind).toBe('group');
    expect(group.id).toBe('g1');
    expect(group.name).toBe('Nightwork');
    expect(group.folders[0].kind).toBe('folder');
    expect(group.folders[0].fullPath).toBe('x:/coding/helm/src');
    expect(group.folders[0].entries).toHaveLength(1);
  });

  it('T2 ungrouped entry produces a folder node directly at project level (no group wrapper)', () => {
    const entries = [makeEntry({ workingDir: 'x:/coding/helm/renderer' })];
    const tree = buildRecycleTree(entries, resolveHelm);

    const child = tree[0].children[0];
    expect(child.kind).toBe('folder');
    expect((child as RecycleFolderNode).fullPath).toBe('x:/coding/helm/renderer');
  });

  it('T3 grouped entries nest their folder under the correct group id/name', () => {
    const entries = [
      makeEntry({ workingDir: 'x:/coding/helm/a', runtimeGroupId: 'g9', runtimeGroupName: 'Batch' }),
      makeEntry({ workingDir: 'x:/coding/helm/a', runtimeGroupId: 'g9', runtimeGroupName: 'Batch' }),
    ];
    const tree = buildRecycleTree(entries, resolveHelm);

    const group = tree[0].children[0] as RecycleGroupNode;
    expect(group.id).toBe('g9');
    expect(group.folders).toHaveLength(1);
    expect(group.folders[0].entries).toHaveLength(2);
  });

  it('T4 entries with no resolvable project fall under a synthetic (no project) node, ordered last', () => {
    const entries = [
      makeEntry({ workingDir: 'x:/coding/helm/src' }),
      makeEntry({ workingDir: 'x:/elsewhere/thing' }),
    ];
    const tree = buildRecycleTree(entries, resolveHelm);

    expect(tree).toHaveLength(2);
    const last = tree[tree.length - 1];
    expect(last.id).toBe(NO_PROJECT_ID);
    expect(last.name).toBe(NO_PROJECT_NAME);
  });

  it('T5 descendant counts are correct at project / group / folder', () => {
    const entries = [
      makeEntry({ workingDir: 'x:/coding/helm/src', runtimeGroupId: 'g1', runtimeGroupName: 'N' }),
      makeEntry({ workingDir: 'x:/coding/helm/src', runtimeGroupId: 'g1', runtimeGroupName: 'N' }),
      makeEntry({ workingDir: 'x:/coding/helm/renderer' }),
    ];
    const tree = buildRecycleTree(entries, resolveHelm);

    expect(tree[0].count).toBe(3);
    const group = tree[0].children.find(c => c.kind === 'group') as RecycleGroupNode;
    expect(group.count).toBe(2);
    expect(group.folders[0].count).toBe(2);
    const folder = tree[0].children.find(c => c.kind === 'folder') as RecycleFolderNode;
    expect(folder.count).toBe(1);
  });

  it('T6 entries within a folder are newest-first (closedAt desc)', () => {
    const older = makeEntry({ workingDir: 'x:/coding/helm/src', closedAt: 1000 });
    const newer = makeEntry({ workingDir: 'x:/coding/helm/src', closedAt: 5000 });
    const tree = buildRecycleTree([older, newer], resolveHelm);

    const folder = tree[0].children[0] as RecycleFolderNode;
    expect(folder.entries.map(e => e.closedAt)).toEqual([5000, 1000]);
  });

  it('T7 groups render before ungrouped folders within a project', () => {
    const entries = [
      makeEntry({ workingDir: 'x:/coding/helm/renderer' }), // ungrouped
      makeEntry({ workingDir: 'x:/coding/helm/src', runtimeGroupId: 'g1', runtimeGroupName: 'N' }),
    ];
    const tree = buildRecycleTree(entries, resolveHelm);

    expect(tree[0].children[0].kind).toBe('group');
    expect(tree[0].children[1].kind).toBe('folder');
  });

  it('T8 built model exposes no expiry fields (regression guard)', () => {
    const entries = [makeEntry({ workingDir: 'x:/coding/helm/src' })];
    const tree = buildRecycleTree(entries, resolveHelm);
    const folder = tree[0].children[0] as RecycleFolderNode;

    const banned = ['expiresIn', 'isExpiring', 'expiresAt', 'retentionMs'];
    for (const node of [tree[0] as unknown as Record<string, unknown>, folder as unknown as Record<string, unknown>]) {
      for (const key of banned) expect(node).not.toHaveProperty(key);
    }
  });

  it('uses runtimeGroupId as the group name when runtimeGroupName is absent', () => {
    const entries = [makeEntry({ workingDir: 'x:/coding/helm/src', runtimeGroupId: 'g-orphan' })];
    const tree = buildRecycleTree(entries, resolveHelm);
    const group = tree[0].children[0] as RecycleGroupNode;
    expect(group.name).toBe('g-orphan');
  });
});

describe('matchesRecycleQuery', () => {
  const entry = makeEntry({ name: 'Fix Auth', cliType: 'codex', workingDir: 'x:/coding/helm/src' });

  it('empty query matches everything', () => {
    expect(matchesRecycleQuery(entry, '')).toBe(true);
    expect(matchesRecycleQuery(entry, '   ')).toBe(true);
  });

  it('matches on name, cliType, and workingDir case-insensitively', () => {
    expect(matchesRecycleQuery(entry, 'fix auth')).toBe(true);
    expect(matchesRecycleQuery(entry, 'CODEX')).toBe(true);
    expect(matchesRecycleQuery(entry, 'HELM/SRC')).toBe(true);
  });

  it('excludes non-matches', () => {
    expect(matchesRecycleQuery(entry, 'nope')).toBe(false);
  });

  it('T9 search hides emptied levels in the built tree', () => {
    const entries = [
      makeEntry({ name: 'keep-me', workingDir: 'x:/coding/helm/src' }),
      makeEntry({ name: 'drop-me', workingDir: 'x:/coding/helm/renderer' }),
    ];
    const tree = buildRecycleTree(entries, resolveHelm, 'keep-me');
    expect(tree).toHaveLength(1);
    expect(tree[0].children).toHaveLength(1);
    const folder = tree[0].children[0] as RecycleFolderNode;
    expect(folder.entries).toHaveLength(1);
    expect(folder.entries[0].name).toBe('keep-me');
  });
});
