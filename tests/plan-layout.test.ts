/**
 * Tests for plan DAG auto-layout algorithm.
 *
 * Verifies left-to-right layered layout: topological sort, layer assignment,
 * barycenter ordering, and coordinate output.
 */

import { describe, it, expect } from 'vitest';
import { computeLayout, type LayoutOptions } from '../renderer/plans/plan-layout.js';
import type { PlanItem, PlanDependency } from '../src/types/plan.js';

function item(id: string, dirPath = '/proj', sequenceId?: string): PlanItem {
  return {
    id,
    dirPath,
    title: id,
    description: '',
    status: 'ready',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    sequenceId,
  };
}

const defaultOpts: LayoutOptions = {
  horizontalSpacing: 280,
  verticalSpacing: 150,
  paddingX: 60,
  paddingY: 60,
  nodeWidth: 200,
  nodeHeight: 102,
};

describe('computeLayout', () => {
  // ─── Empty & trivial ──────────────────────────────────

  it('returns empty layout for empty input', () => {
    const result = computeLayout([], []);
    expect(result.nodes).toHaveLength(0);
    expect(result.width).toBe(0);
    expect(result.height).toBe(0);
  });

  it('places a single node at padding origin', () => {
    const result = computeLayout([item('A')], [], defaultOpts);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]).toMatchObject({ id: 'A', x: 60, y: 60, layer: 0, order: 0 });
  });

  // ─── Linear chain ─────────────────────────────────────

  it('lays out a linear chain A→B→C left to right', () => {
    const items = [item('A'), item('B'), item('C')];
    const deps: PlanDependency[] = [
      { fromId: 'A', toId: 'B' },
      { fromId: 'B', toId: 'C' },
    ];
    const result = computeLayout(items, deps, defaultOpts);
    const nodeMap = new Map(result.nodes.map(n => [n.id, n]));

    expect(nodeMap.get('A')!.layer).toBe(0);
    expect(nodeMap.get('B')!.layer).toBe(1);
    expect(nodeMap.get('C')!.layer).toBe(2);

    // All same vertical position (single node per layer)
    expect(nodeMap.get('A')!.y).toBe(nodeMap.get('B')!.y);
    expect(nodeMap.get('B')!.y).toBe(nodeMap.get('C')!.y);

    // X increases left to right
    expect(nodeMap.get('A')!.x).toBeLessThan(nodeMap.get('B')!.x);
    expect(nodeMap.get('B')!.x).toBeLessThan(nodeMap.get('C')!.x);
  });

  // ─── Parallel branches ────────────────────────────────

  it('places parallel branches in the same layer', () => {
    // A → B, A → C (B and C are parallel)
    const items = [item('A'), item('B'), item('C')];
    const deps: PlanDependency[] = [
      { fromId: 'A', toId: 'B' },
      { fromId: 'A', toId: 'C' },
    ];
    const result = computeLayout(items, deps, defaultOpts);
    const nodeMap = new Map(result.nodes.map(n => [n.id, n]));

    expect(nodeMap.get('A')!.layer).toBe(0);
    expect(nodeMap.get('B')!.layer).toBe(1);
    expect(nodeMap.get('C')!.layer).toBe(1);

    // B and C should have different vertical positions
    expect(nodeMap.get('B')!.y).not.toBe(nodeMap.get('C')!.y);
  });

  // ─── Diamond graph ────────────────────────────────────

  it('handles diamond: A→B, A→C, B→D, C→D', () => {
    const items = [item('A'), item('B'), item('C'), item('D')];
    const deps: PlanDependency[] = [
      { fromId: 'A', toId: 'B' },
      { fromId: 'A', toId: 'C' },
      { fromId: 'B', toId: 'D' },
      { fromId: 'C', toId: 'D' },
    ];
    const result = computeLayout(items, deps, defaultOpts);
    const nodeMap = new Map(result.nodes.map(n => [n.id, n]));

    expect(nodeMap.get('A')!.layer).toBe(0);
    expect(nodeMap.get('B')!.layer).toBe(1);
    expect(nodeMap.get('C')!.layer).toBe(1);
    expect(nodeMap.get('D')!.layer).toBe(2);
  });

  // ─── Disconnected components ──────────────────────────

  it('handles disconnected components (no edges)', () => {
    const items = [item('X'), item('Y'), item('Z')];
    const result = computeLayout(items, [], defaultOpts);

    // All in layer 0
    for (const node of result.nodes) {
      expect(node.layer).toBe(0);
    }
    // Each has different vertical position
    const ys = result.nodes.map(n => n.y);
    expect(new Set(ys).size).toBe(3);
  });

  // ─── Longest path layer assignment ────────────────────

  it('uses longest path for layer assignment with converging deps', () => {
    // A→B→D, A→C, C→D
    // D should be in layer 2 (longest path: A→B→D), not layer 1
    const items = [item('A'), item('B'), item('C'), item('D')];
    const deps: PlanDependency[] = [
      { fromId: 'A', toId: 'B' },
      { fromId: 'A', toId: 'C' },
      { fromId: 'B', toId: 'D' },
      { fromId: 'C', toId: 'D' },
    ];
    const result = computeLayout(items, deps, defaultOpts);
    const nodeMap = new Map(result.nodes.map(n => [n.id, n]));

    expect(nodeMap.get('D')!.layer).toBe(2);
  });

  // ─── Custom spacing ───────────────────────────────────

  it('respects custom spacing options', () => {
    const items = [item('A'), item('B')];
    const deps: PlanDependency[] = [{ fromId: 'A', toId: 'B' }];
    const result = computeLayout(items, deps, {
      horizontalSpacing: 400,
      verticalSpacing: 200,
      paddingX: 100,
      paddingY: 80,
      nodeWidth: 200,
      nodeHeight: 80,
    });
    const nodeMap = new Map(result.nodes.map(n => [n.id, n]));

    expect(nodeMap.get('A')!.x).toBe(100);    // paddingX
    expect(nodeMap.get('A')!.y).toBe(80);      // paddingY
    expect(nodeMap.get('B')!.x).toBe(500);     // paddingX + horizontalSpacing
    expect(nodeMap.get('B')!.y).toBe(80);      // paddingY (same layer order)
  });

  // ─── Width and height ─────────────────────────────────

  it('computes correct width and height', () => {
    const items = [item('A'), item('B'), item('C')];
    const deps: PlanDependency[] = [
      { fromId: 'A', toId: 'B' },
      { fromId: 'A', toId: 'C' },
    ];
    const result = computeLayout(items, deps, defaultOpts);

    // Layer 0: A at x=60, Layer 1: B,C at x=340
    // Width = max(x + nodeWidth) + paddingX = (340 + 200) + 60 = 600
    expect(result.width).toBe(600);

    // Layer 1 has 2 nodes: y=60, y=210
    // Height = max(y + nodeHeight) + paddingY = (210 + 102) + 60 = 372
    expect(result.height).toBe(372);
  });

  // ─── Deterministic output ─────────────────────────────

  it('produces deterministic output for same input', () => {
    const items = [item('C'), item('A'), item('B')]; // different order
    const deps: PlanDependency[] = [
      { fromId: 'A', toId: 'C' },
      { fromId: 'B', toId: 'C' },
    ];
    const result1 = computeLayout(items, deps, defaultOpts);
    const result2 = computeLayout([...items].reverse(), deps, defaultOpts);

    // Same layout regardless of input order
    const sorted1 = [...result1.nodes].sort((a, b) => a.id.localeCompare(b.id));
    const sorted2 = [...result2.nodes].sort((a, b) => a.id.localeCompare(b.id));
    expect(sorted1).toEqual(sorted2);
  });

  // ─── Barycenter ordering ──────────────────────────────

  it('orders nodes to minimize crossings (barycenter)', () => {
    // A→C, B→D, A→D, B→C
    // Optimal: A,B in layer 0 with C,D in layer 1 — barycenter should avoid crossing
    const items = [item('A'), item('B'), item('C'), item('D')];
    const deps: PlanDependency[] = [
      { fromId: 'A', toId: 'C' },
      { fromId: 'A', toId: 'D' },
      { fromId: 'B', toId: 'C' },
      { fromId: 'B', toId: 'D' },
    ];
    const result = computeLayout(items, deps, defaultOpts);
    const nodeMap = new Map(result.nodes.map(n => [n.id, n]));

    // All should be placed
    expect(result.nodes).toHaveLength(4);
    expect(nodeMap.get('A')!.layer).toBe(0);
    expect(nodeMap.get('B')!.layer).toBe(0);
    expect(nodeMap.get('C')!.layer).toBe(1);
    expect(nodeMap.get('D')!.layer).toBe(1);
  });

  // ─── Filters out irrelevant deps ──────────────────────

  it('ignores dependencies referencing unknown item IDs', () => {
    const items = [item('A'), item('B')];
    const deps: PlanDependency[] = [
      { fromId: 'A', toId: 'B' },
      { fromId: 'A', toId: 'GHOST' },   // unknown
      { fromId: 'PHANTOM', toId: 'B' }, // unknown
    ];
    const result = computeLayout(items, deps, defaultOpts);
    const nodeMap = new Map(result.nodes.map(n => [n.id, n]));

    expect(result.nodes).toHaveLength(2);
    expect(nodeMap.get('A')!.layer).toBe(0);
    expect(nodeMap.get('B')!.layer).toBe(1);
  });

  // ─── Wide graph ────────────────────────────────────────

  it('handles a wider graph (5 layers deep)', () => {
    const items = [item('A'), item('B'), item('C'), item('D'), item('E')];
    const deps: PlanDependency[] = [
      { fromId: 'A', toId: 'B' },
      { fromId: 'B', toId: 'C' },
      { fromId: 'C', toId: 'D' },
      { fromId: 'D', toId: 'E' },
    ];
    const result = computeLayout(items, deps, defaultOpts);
    const nodeMap = new Map(result.nodes.map(n => [n.id, n]));

    expect(nodeMap.get('A')!.layer).toBe(0);
    expect(nodeMap.get('E')!.layer).toBe(4);
    expect(result.nodes).toHaveLength(5);
  });

  // ─── Multiple roots ───────────────────────────────────

  it('handles multiple root nodes', () => {
    // R1→A, R2→A, R1→B (two roots)
    const items = [item('R1'), item('R2'), item('A'), item('B')];
    const deps: PlanDependency[] = [
      { fromId: 'R1', toId: 'A' },
      { fromId: 'R2', toId: 'A' },
      { fromId: 'R1', toId: 'B' },
    ];
    const result = computeLayout(items, deps, defaultOpts);
    const nodeMap = new Map(result.nodes.map(n => [n.id, n]));

    expect(nodeMap.get('R1')!.layer).toBe(0);
    expect(nodeMap.get('R2')!.layer).toBe(0);
    expect(nodeMap.get('A')!.layer).toBe(1);
    expect(nodeMap.get('B')!.layer).toBe(1);
  });

  // ─── Node properties ──────────────────────────────────

  it('includes all required properties on each layout node', () => {
    const result = computeLayout([item('A')], [], defaultOpts);
    const node = result.nodes[0];

    expect(node).toHaveProperty('id');
    expect(node).toHaveProperty('x');
    expect(node).toHaveProperty('y');
    expect(node).toHaveProperty('layer');
    expect(node).toHaveProperty('order');
    expect(typeof node.x).toBe('number');
    expect(typeof node.y).toBe('number');
  });

  // ─── Fan-out graph ────────────────────────────────────

  it('handles fan-out: one root with many children', () => {
    const items = [item('root'), item('c1'), item('c2'), item('c3'), item('c4'), item('c5')];
    const deps: PlanDependency[] = items.slice(1).map(i => ({ fromId: 'root', toId: i.id }));

    const result = computeLayout(items, deps, defaultOpts);
    const nodeMap = new Map(result.nodes.map(n => [n.id, n]));

    expect(nodeMap.get('root')!.layer).toBe(0);
    for (const child of items.slice(1)) {
      expect(nodeMap.get(child.id)!.layer).toBe(1);
    }

    // All children should have distinct Y positions
    const childYs = items.slice(1).map(i => nodeMap.get(i.id)!.y);
    expect(new Set(childYs).size).toBe(5);
  });

  // ─── Fan-in graph ─────────────────────────────────────

  it('handles fan-in: many roots merging into one', () => {
    const items = [item('r1'), item('r2'), item('r3'), item('sink')];
    const deps: PlanDependency[] = [
      { fromId: 'r1', toId: 'sink' },
      { fromId: 'r2', toId: 'sink' },
      { fromId: 'r3', toId: 'sink' },
    ];
    const result = computeLayout(items, deps, defaultOpts);
    const nodeMap = new Map(result.nodes.map(n => [n.id, n]));

    expect(nodeMap.get('r1')!.layer).toBe(0);
    expect(nodeMap.get('r2')!.layer).toBe(0);
    expect(nodeMap.get('r3')!.layer).toBe(0);
    expect(nodeMap.get('sink')!.layer).toBe(1);
  });
});

describe('sequence band spacing', () => {
  const seqOpts: LayoutOptions = { ...defaultOpts, sequenceGroupGap: 68 };

  it('places unlinked items in a separate right-side zone', () => {
    const items = [item('A', '/p', 'seq1'), item('B', '/p')];
    const deps: PlanDependency[] = [];
    const result = computeLayout(items, deps, seqOpts);
    const nodeMap = new Map(result.nodes.map(n => [n.id, n]));

    // A (seq1) in left zone, B (no seq) in right zone
    expect(nodeMap.get('A')!.y).toBe(60);
    expect(nodeMap.get('B')!.y).toBe(60);
    expect(nodeMap.get('B')!.x).toBeGreaterThan(nodeMap.get('A')!.x);
  });

  it('places sequenced items in left zone when unlinked comes first', () => {
    const items = [item('A', '/p'), item('B', '/p', 'seq1')];
    const result = computeLayout(items, [] as PlanDependency[], seqOpts);
    const nodeMap = new Map(result.nodes.map(n => [n.id, n]));

    // A (no seq) in right zone, B (seq1) in left zone
    expect(nodeMap.get('A')!.y).toBe(60);
    expect(nodeMap.get('B')!.y).toBe(60);
    expect(nodeMap.get('A')!.x).toBeGreaterThan(nodeMap.get('B')!.x);
  });

  it('does not add gap when all nodes in layer share same sequence', () => {
    const items = [item('A', '/p', 'seq1'), item('B', '/p', 'seq1')];
    const result = computeLayout(items, [], seqOpts);
    const nodeMap = new Map(result.nodes.map(n => [n.id, n]));

    expect(nodeMap.get('A')!.y).toBe(60);
    expect(nodeMap.get('B')!.y).toBe(60 + 150);
  });

  it('places different sequences in separate vertical bands', () => {
    const items = [item('A', '/p', 'seq1'), item('B', '/p', 'seq2')];
    const result = computeLayout(items, [], seqOpts);
    const nodeMap = new Map(result.nodes.map(n => [n.id, n]));

    expect(nodeMap.get('A')!.x).toBe(nodeMap.get('B')!.x);
    expect(nodeMap.get('B')!.y).toBeGreaterThanOrEqual(nodeMap.get('A')!.y + 102 + 68);
  });

  it('sizes each sequence band to its busiest dependency layer', () => {
    const items = [
      item('A', '/p', 'seq1'),
      item('B', '/p', 'seq1'),
      item('C', '/p', 'seq2'),
    ];
    const result = computeLayout(items, [], seqOpts);
    const nodeMap = new Map(result.nodes.map(n => [n.id, n]));

    expect(nodeMap.get('A')!.y).toBe(60);
    expect(nodeMap.get('B')!.y).toBe(210);
    expect(nodeMap.get('C')!.y).toBeGreaterThanOrEqual(60 + 102 + 150 + 68);
  });

  it('does not add gap when no nodes have a sequenceId', () => {
    const items = [item('A'), item('B')];
    const result = computeLayout(items, [], seqOpts);
    const nodeMap = new Map(result.nodes.map(n => [n.id, n]));

    expect(nodeMap.get('A')!.y).toBe(60);
    expect(nodeMap.get('B')!.y).toBe(60 + 150);
  });

  it('partitions sequenced and unlinked into separate horizontal zones', () => {
    const items = [
      item('A', '/p', 'seq1'),
      item('B', '/p', 'seq1'),
      item('C', '/p'),
      item('D', '/p', 'seq2'),
      item('E', '/p'),
    ];
    const result = computeLayout(items, [], seqOpts);
    const nodeMap = new Map(result.nodes.map(n => [n.id, n]));

    // Sequenced items (A, B, D) in left zone
    const seqNodes = [nodeMap.get('A')!, nodeMap.get('B')!, nodeMap.get('D')!];
    // Unlinked items (C, E) in right zone
    const unlinkNodes = [nodeMap.get('C')!, nodeMap.get('E')!];

    const seqMinX = Math.min(...seqNodes.map(n => n.x));
    const unlinkMinX = Math.min(...unlinkNodes.map(n => n.x));

    // Unlinked zone is to the right of sequenced zone
    expect(unlinkMinX).toBeGreaterThan(seqMinX);

    // All items have valid Y coordinates (vertical layout within each zone)
    for (const n of result.nodes) {
      expect(n.y).toBeGreaterThanOrEqual(60);
    }
  });

  it('canvas width accommodates both zones with gap', () => {
    const items = [item('A', '/p', 's1'), item('B', '/p')];
    const result = computeLayout(items, [], seqOpts);
    const nodeMap = new Map(result.nodes.map(n => [n.id, n]));

    // Canvas width must be larger than the rightmost node
    const rightmostX = Math.max(nodeMap.get('A')!.x, nodeMap.get('B')!.x);
    expect(result.width).toBeGreaterThan(rightmostX);
  });
});
