/**
 * Forest layout — the whole session graph on one canvas.
 *
 * The rooted layout in memory-graph-layout could only ever draw what was
 * reachable from a selected root, so an unlinked memory was invisible and the
 * sidebar list was the only way to reach it.
 */

import { describe, expect, it } from 'vitest';
import type { MemoryForest, MemorySummary } from '../src/types/memory.js';
import { buildMemoryForestLayout } from '../renderer/memories/memory-graph-layout.js';

const summary = (id: string): MemorySummary => ({
  id,
  tldr: `summary ${id}`,
  createdAt: 1,
  updatedAt: 1,
  attachmentCount: 0,
});

function forest(ids: string[], edges: Array<[string, string]>): MemoryForest {
  return {
    records: ids.map(summary),
    edges: edges.map(([fromId, toId]) => ({ fromId, toId })),
  };
}

describe('memory forest layout', () => {
  it('renders memories that have no edges at all', () => {
    const layout = buildMemoryForestLayout(forest(['a', 'b', 'lonely'], [['a', 'b']]));

    expect(layout.nodes.map((node) => node.id).sort()).toEqual(['a', 'b', 'lonely']);
  });

  // Two unrelated clusters must not be drawn on top of each other.
  it('gives every node a distinct position across disconnected clusters', () => {
    const layout = buildMemoryForestLayout(
      forest(['a', 'b', 'c', 'd'], [['a', 'b'], ['c', 'd']]),
    );

    const positions = layout.nodes.map((node) => `${node.x},${node.y}`);
    expect(new Set(positions).size).toBe(positions.length);
  });

  // Depth is the LONGEST path to a node, not the first one found. With a->b,
  // b->c and a->c, `c` must sit past `b` or the a->c edge would point backwards.
  it('ranks a node past every one of its ancestors', () => {
    const layout = buildMemoryForestLayout(
      forest(['a', 'b', 'c'], [['a', 'b'], ['b', 'c'], ['a', 'c']]),
    );
    const depthOf = (id: string) => layout.nodes.find((node) => node.id === id)!.depth;

    expect(depthOf('a')).toBe(0);
    expect(depthOf('b')).toBe(1);
    expect(depthOf('c')).toBe(2);
  });

  it('separates isolated memories from the linked ones', () => {
    const layout = buildMemoryForestLayout(forest(['a', 'b', 'lonely'], [['a', 'b']]));
    const columnOf = (id: string) => layout.nodes.find((node) => node.id === id)!.x;

    expect(columnOf('lonely')).not.toBe(columnOf('a'));
    expect(columnOf('lonely')).not.toBe(columnOf('b'));
  });

  it('terminates on a cycle', () => {
    const layout = buildMemoryForestLayout(
      forest(['a', 'b', 'c'], [['a', 'b'], ['b', 'c'], ['c', 'a']]),
    );

    expect(layout.nodes).toHaveLength(3);
    expect(layout.edges).toHaveLength(3);
  });

  it('handles a self-link without losing the node', () => {
    const layout = buildMemoryForestLayout(forest(['a'], [['a', 'a']]));

    expect(layout.nodes.map((node) => node.id)).toEqual(['a']);
  });

  // The canvas must not reshuffle under the user when they click something.
  it('is stable across rebuilds', () => {
    const build = () => buildMemoryForestLayout(
      forest(['a', 'b', 'c', 'lonely'], [['a', 'b'], ['b', 'c']]),
    );

    expect(build()).toEqual(build());
  });

  it('carries every edge through for drawing', () => {
    const layout = buildMemoryForestLayout(forest(['a', 'b'], [['a', 'b']]));

    expect(layout.edges).toEqual([{ from: 'a', to: 'b' }]);
  });

  it('labels nodes with their tldr', () => {
    const layout = buildMemoryForestLayout(forest(['a'], []));

    expect(layout.nodes[0].label).toBe('summary a');
  });

  it('clamps zoom to the same range as the rooted layout', () => {
    expect(buildMemoryForestLayout(forest(['a'], []), { zoom: 99 }).zoom).toBe(2.5);
    expect(buildMemoryForestLayout(forest(['a'], []), { zoom: 0 }).zoom).toBe(0.5);
  });

  it('produces an empty layout for a session with no memories', () => {
    const layout = buildMemoryForestLayout(forest([], []));

    expect(layout.nodes).toEqual([]);
    expect(layout.edges).toEqual([]);
  });
});
