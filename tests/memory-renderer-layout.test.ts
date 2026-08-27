import { describe, expect, it } from 'vitest';
import type { MemoryTraversal } from '../src/types/memory.js';
import { buildMemoryGraphLayout } from '../renderer/memories/memory-graph-layout.js';

function traversal(): MemoryTraversal {
  return {
    rootId: 'a',
    graphDepth: 3,
    entries: [
      { id: 'a', depth: 0, path: ['a'], breadcrumbs: ['Root'], status: 'record', record: { id: 'a', tldr: 'Root', content: 'A', createdAt: 1, updatedAt: 1, attachments: [] } },
      { id: 'b', depth: 1, path: ['a', 'b'], breadcrumbs: ['Root', 'Branch'], status: 'record', via: { fromId: 'a', toId: 'b' }, record: { id: 'b', tldr: 'Branch', content: 'B', createdAt: 2, updatedAt: 2, attachments: [] } },
      { id: 'a', depth: 2, path: ['a', 'b', 'a'], breadcrumbs: ['Root', 'Branch', 'Root'], status: 'cycle', via: { fromId: 'b', toId: 'a' } },
      { id: 'missing', depth: 1, path: ['a', 'missing'], breadcrumbs: ['Root', 'Missing'], status: 'missing', via: { fromId: 'a', toId: 'missing' } },
    ],
  };
}

describe('memory graph renderer layout', () => {
  it('lays out entries deterministically by depth and path and preserves traversal markers', () => {
    const first = buildMemoryGraphLayout(traversal());
    const second = buildMemoryGraphLayout(traversal());

    expect(first).toEqual(second);
    expect(first.nodes.map(node => [node.id, node.status, node.depth])).toEqual([
      ['a', 'record', 0],
      ['b', 'record', 1],
      ['missing', 'missing', 1],
      ['a', 'cycle', 2],
    ]);
    expect(first.nodes.find(node => node.status === 'cycle')?.breadcrumbs).toEqual(['Root', 'Branch', 'Root']);
    expect(first.edges).toEqual([
      { from: 'a', to: 'a\u0000b' },
      { from: 'a', to: 'a\u0000missing' },
      { from: 'a\u0000b', to: 'a\u0000b\u0000a' },
    ]);
  });

  it('clamps depth and zoom inputs to safe renderer bounds', () => {
    const layout = buildMemoryGraphLayout({ ...traversal(), graphDepth: 1000 }, { zoom: 99 });
    expect(layout.graphDepth).toBe(100);
    expect(layout.zoom).toBe(2.5);
  });
});
