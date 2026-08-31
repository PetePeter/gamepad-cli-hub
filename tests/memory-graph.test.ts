import { describe, expect, it } from 'vitest';
import { MemoryGraph, deleteMemoryAndReroute } from '../src/session/memory-graph.js';
import { MemoryManager } from '../src/session/memory-manager.js';
import type { MemoryState } from '../src/types/memory.js';

const record = (id: string) => ({
  id,
  tldr: `summary ${id}`,
  content: `content ${id}`,
  createdAt: 1,
  updatedAt: 1,
  attachments: [],
});

function state(): MemoryState {
  return {
    records: ['a', 'b', 'c'].map(record),
    edges: [
      { fromId: 'a', toId: 'c' },
      { fromId: 'a', toId: 'b' },
      { fromId: 'b', toId: 'c' },
      { fromId: 'c', toId: 'a' },
      { fromId: 'b', toId: 'missing' },
    ],
  };
}

describe('MemoryGraph', () => {
  it('traverses deterministically and preserves shared paths with cycle/reference markers', () => {
    const traversal = new MemoryGraph(state()).traverse('a', 3);

    expect(traversal.rootId).toBe('a');
    expect(traversal.entries.map((entry) => [entry.id, entry.status, entry.path])).toEqual([
      ['a', 'record', ['a']],
      ['b', 'record', ['a', 'b']],
      ['c', 'record', ['a', 'b', 'c']],
      ['a', 'cycle', ['a', 'b', 'c', 'a']],
      ['missing', 'missing', ['a', 'b', 'missing']],
      ['c', 'reference', ['a', 'c']],
    ]);
  });

  it('emits depth-limit markers only when a nonzero depth would be exceeded', () => {
    const graph = new MemoryGraph(state());
    expect(graph.traverse('a', 0).entries.map((entry) => entry.status)).toEqual(['record']);
    expect(graph.traverse('a', 1).entries.map((entry) => entry.status)).toEqual([
      'record', 'record', 'depth-limit', 'depth-limit', 'record', 'cycle',
    ]);
  });

  it('emits depth-limit markers for every branch at the graph-depth boundary', () => {
    const graph = new MemoryGraph({
      records: ['a', 'b', 'c', 'd', 'e'].map(record),
      edges: [
        { fromId: 'a', toId: 'b' },
        { fromId: 'a', toId: 'c' },
        { fromId: 'b', toId: 'd' },
        { fromId: 'c', toId: 'e' },
      ],
    });

    expect(graph.traverse('a', 1).entries.map((entry) => [entry.id, entry.status, entry.path])).toEqual([
      ['a', 'record', ['a']],
      ['b', 'record', ['a', 'b']],
      ['d', 'depth-limit', ['a', 'b', 'd']],
      ['c', 'record', ['a', 'c']],
      ['e', 'depth-limit', ['a', 'c', 'e']],
    ]);
  });

  it('emits a cycle marker with breadcrumbs when a loop reaches the depth boundary', () => {
    const graph = new MemoryGraph({
      records: ['a', 'b'].map(record),
      edges: [{ fromId: 'a', toId: 'b' }, { fromId: 'b', toId: 'a' }],
    });

    const loop = graph.traverse('a', 1).entries.find((entry) => entry.status === 'cycle');
    expect(loop).toMatchObject({
      id: 'a',
      depth: 2,
      path: ['a', 'b', 'a'],
      breadcrumbs: ['a', 'b', 'a'],
    });
  });

  it('rejects negative and noninteger graph depths before traversal', () => {
    const graph = new MemoryGraph(state());
    expect(() => graph.traverse('a', -1)).toThrow(/graphDepth/i);
    expect(() => graph.traverse('a', 1.5)).toThrow(/graphDepth/i);
    expect(() => graph.traverse('a', 10_000)).toThrow(/graphDepth/i);
  });

  it('returns a missing root marker without allocating a neighborhood', () => {
    expect(new MemoryGraph(state()).traverse('unknown', 5)).toEqual({
      rootId: 'unknown',
      graphDepth: 5,
      entries: [{
        id: 'unknown',
        depth: 0,
        path: ['unknown'],
        breadcrumbs: ['unknown'],
        status: 'missing',
      }],
    });
  });

  it('deletes one node, reroutes the incoming/outgoing cross product, and removes dangling edges', () => {
    const result = deleteMemoryAndReroute({
      records: ['a', 'b', 'c', 'd'].map(record),
      edges: [
        { fromId: 'a', toId: 'b' },
        { fromId: 'd', toId: 'b' },
        { fromId: 'b', toId: 'c' },
        { fromId: 'b', toId: 'd' },
        { fromId: 'a', toId: 'd' },
        { fromId: 'c', toId: 'missing' },
      ],
    }, 'b');

    expect(result.records.map((item) => item.id)).toEqual(['a', 'c', 'd']);
    expect(result.edges).toEqual([
      { fromId: 'a', toId: 'c' },
      { fromId: 'a', toId: 'd' },
      { fromId: 'd', toId: 'c' },
      { fromId: 'd', toId: 'd' },
    ]);
  });
});

/**
 * The forest is what the canvas renders: every memory the session owns, not a
 * neighbourhood around one root. A memory with no links is still a memory, and
 * before this existed the only way to reach one was the sidebar list.
 */
describe('session forest', () => {
  const owned = (id: string) => ({ ...record(id), sessionId: 'session-a' });

  function makeManager(state: MemoryState) {
    return new MemoryManager({
      persist: () => {},
      persistence: { load: () => ({ state }), save: () => {} } as never,
    });
  }

  it('includes memories that have no edges at all', () => {
    const manager = makeManager({
      records: [owned('linked-a'), owned('linked-b'), owned('lonely')],
      edges: [{ fromId: 'linked-a', toId: 'linked-b' }],
    });

    const forest = manager.forestForSession('session-a');

    expect(forest.records.map((r) => r.id).sort()).toEqual(['linked-a', 'linked-b', 'lonely']);
    expect(forest.edges).toEqual([{ fromId: 'linked-a', toId: 'linked-b' }]);
  });

  it('excludes records and edges belonging to another session', () => {
    const manager = makeManager({
      records: [owned('mine'), { ...record('theirs'), sessionId: 'session-b' }],
      edges: [{ fromId: 'theirs', toId: 'mine' }],
    });

    const forest = manager.forestForSession('session-a');

    expect(forest.records.map((r) => r.id)).toEqual(['mine']);
    expect(forest.edges).toEqual([]);
  });

  // A dangling edge would have the canvas draw a line to nothing. The rooted
  // traversal keeps such edges so it can show a `missing` marker; the forest
  // cannot, because it has no node to anchor the far end to.
  it('drops edges whose target is missing', () => {
    const manager = makeManager({
      records: [owned('present')],
      edges: [{ fromId: 'present', toId: 'deleted-long-ago' }],
    });

    expect(manager.forestForSession('session-a').edges).toEqual([]);
  });

  it('returns summaries without record content', () => {
    const manager = makeManager({ records: [owned('a')], edges: [] });

    const [summary] = manager.forestForSession('session-a').records;

    expect(summary).toMatchObject({ id: 'a', tldr: 'summary a', attachmentCount: 0 });
    expect(summary).not.toHaveProperty('content');
  });
});
