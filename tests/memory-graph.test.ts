import { describe, expect, it } from 'vitest';
import { MemoryGraph, deleteMemoryAndReroute } from '../src/session/memory-graph.js';
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
