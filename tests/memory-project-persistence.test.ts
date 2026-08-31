/**
 * The v1 → v2 memory store migration.
 *
 * Every existing user has a v1 store. If the upgrade loses records, or
 * back-fills a project onto memories whose session is long gone, the feature
 * destroys the knowledge it exists to preserve.
 */

import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemoryPersistence } from '../src/session/memory-persistence.js';
import { MemoryManager } from '../src/session/memory-manager.js';

function withStore(contents: unknown, run: (filePath: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'helm-memory-'));
  const filePath = join(dir, 'memories.json');
  writeFileSync(filePath, `${JSON.stringify(contents, null, 2)}\n`, 'utf8');
  try {
    run(filePath);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const V1_STORE = {
  version: 1,
  records: [
    {
      id: 'old-1', sessionId: 'session-live', tldr: 'legacy fact', content: 'body',
      createdAt: 1, updatedAt: 2, attachments: [],
    },
    {
      id: 'old-2', sessionId: 'session-dead', tldr: 'orphan fact', content: 'body',
      createdAt: 1, updatedAt: 2, attachments: [],
    },
  ],
  edges: [{ fromId: 'old-1', toId: 'old-2' }],
};

describe('v1 to v2 migration', () => {
  it('loads a v1 store with the new fields absent and nothing lost', () => {
    withStore(V1_STORE, (filePath) => {
      const loaded = new MemoryPersistence(filePath).load();

      expect(loaded.diagnostic).toBeUndefined();
      expect(loaded.version).toBe(1);
      expect(loaded.state.records.map((r) => r.id)).toEqual(['old-1', 'old-2']);
      expect(loaded.state.records[0].projectId).toBeUndefined();
      expect(loaded.state.records[0].createdAtEpoch).toBeUndefined();
      expect(loaded.state.edges).toEqual([{ fromId: 'old-1', toId: 'old-2' }]);
    });
  });

  // Back-fill is the difference between an upgrade that preserves what live
  // sessions know and one that silently purges it on the next session close.
  it('back-fills a project only where the owning session still resolves', () => {
    withStore(V1_STORE, (filePath) => {
      const manager = new MemoryManager({
        persistence: new MemoryPersistence(filePath),
        resolveSessionProject: (id) => (id === 'session-live' ? 'project-alpha' : null),
      });

      expect(manager.getRecord('old-1')!.projectId).toBe('project-alpha');
      expect(manager.getRecord('old-2')!.projectId).toBeUndefined();
    });
  });

  it('round-trips the new fields and the project epochs', () => {
    withStore(V1_STORE, (filePath) => {
      const persistence = new MemoryPersistence(filePath);
      persistence.save({
        records: [{
          id: 'm1', sessionId: 's1', projectId: 'p1', planId: 'plan-1',
          tldr: 'a', content: 'b', createdAt: 1, updatedAt: 2,
          lastAccessedAt: 3, recallSessionCount: 2, lastRecallSessionId: 's2',
          dormantSince: 4, createdAtEpoch: 5, attachments: [],
        }],
        edges: [],
        projectEpochs: { p1: { epoch: 7, lastSessionId: 's2' } },
      });

      const reloaded = new MemoryPersistence(filePath).load();

      expect(reloaded.version).toBe(2);
      expect(reloaded.state.records[0]).toMatchObject({
        projectId: 'p1', planId: 'plan-1', lastAccessedAt: 3,
        recallSessionCount: 2, lastRecallSessionId: 's2',
        dormantSince: 4, createdAtEpoch: 5,
      });
      expect(reloaded.state.projectEpochs).toEqual({ p1: { epoch: 7, lastSessionId: 's2' } });
    });
  });

  it('rejects a store from a future version rather than silently dropping fields', () => {
    withStore({ ...V1_STORE, version: 3 }, (filePath) => {
      expect(new MemoryPersistence(filePath).load().diagnostic?.kind).toBe('unsupported');
    });
  });
});
