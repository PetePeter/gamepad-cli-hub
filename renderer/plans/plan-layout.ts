/**
 * Auto-layout for plan DAGs — left-to-right layered layout (Sugiyama-style).
 *
 * 1. Topological sort (Kahn's algorithm)
 * 2. Layer assignment (longest path from roots)
 * 3. Within-layer ordering (barycenter heuristic — two passes)
 * 4. Coordinate assignment (layer × horizontalSpacing, position × verticalSpacing)
 */

import type { PlanItem, PlanDependency } from '../../src/types/plan.js';

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  layer: number;
  order: number;
}

export interface LayoutResult {
  nodes: LayoutNode[];
  width: number;
  height: number;
}

export interface LayoutOptions {
  /** Horizontal spacing between layers (px). Default: 280 */
  horizontalSpacing?: number;
  /** Vertical spacing between nodes in a layer (px). Default: 150 */
  verticalSpacing?: number;
  /** Horizontal padding from canvas edge (px). Default: 60 */
  paddingX?: number;
  /** Vertical padding from canvas edge (px). Default: 60 */
  paddingY?: number;
  /** Node width for centering (px). Default: 200 */
  nodeWidth?: number;
  /** Node height for centering (px). Default: 102 */
  nodeHeight?: number;
  /** Extra vertical gap between sequence bands and non-members (px). Default: 68 */
  sequenceGroupGap?: number;
}

const DEFAULTS: Required<LayoutOptions> = {
  horizontalSpacing: 280,
  verticalSpacing: 150,
  paddingX: 60,
  paddingY: 60,
  nodeWidth: 200,
  nodeHeight: 102,
  sequenceGroupGap: 68,
};

/**
 * Compute left-to-right layered layout for a set of plan items and dependencies.
 * Empty input returns empty layout. Handles disconnected components.
 *
 * When sequences exist, unlinked plans are partitioned into a separate
 * right-side zone with a visual gap from the sequence-grouped plans.
 */
export function computeLayout(
  items: PlanItem[],
  dependencies: PlanDependency[],
  options?: LayoutOptions,
): LayoutResult {
  if (items.length === 0) {
    return { nodes: [], width: 0, height: 0 };
  }

  const opts = { ...DEFAULTS, ...options };
  const hasSequences = items.some(i => !!i.sequenceId);

  if (!hasSequences) {
    return layoutGroup(items, dependencies, opts);
  }

  // Partition into sequenced and unlinked
  const sequencedItems = items.filter(i => !!i.sequenceId);
  const unlinkedItems = items.filter(i => !i.sequenceId);

  // If everything is sequenced (or nothing), no partitioning needed
  if (unlinkedItems.length === 0) {
    return layoutGroup(items, dependencies, opts);
  }

  // Layout sequenced items first
  const seqLayout = layoutGroup(sequencedItems, dependencies, opts);
  // Layout unlinked items
  const unlinkLayout = layoutGroup(unlinkedItems, dependencies, opts);

  // Offset unlinked nodes to the right of sequenced area
  const unlinkOffset = seqLayout.width + opts.sequenceGroupGap;
  for (const node of unlinkLayout.nodes) {
    node.x += unlinkOffset;
  }

  // Merge and compute overall dimensions
  const merged = [...seqLayout.nodes, ...unlinkLayout.nodes];
  let maxY = 0;
  for (const n of merged) maxY = Math.max(maxY, n.y + opts.nodeHeight);
  const totalWidth = Math.max(seqLayout.width, unlinkOffset + unlinkLayout.width);

  return { nodes: merged, width: totalWidth, height: maxY + opts.paddingY + 26 };
}

/** Run the full layout pipeline for a single group of items. */
function layoutGroup(
  items: PlanItem[],
  dependencies: PlanDependency[],
  opts: Required<LayoutOptions>,
): LayoutResult {
  const ids = new Set(items.map(i => i.id));
  const deps = dependencies.filter(d => ids.has(d.fromId) && ids.has(d.toId));

  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const id of ids) {
    outgoing.set(id, []);
    incoming.set(id, []);
  }
  for (const d of deps) {
    outgoing.get(d.fromId)!.push(d.toId);
    incoming.get(d.toId)!.push(d.fromId);
  }

  const sorted = topologicalSort(ids, outgoing, incoming);
  const layers = assignLayers(sorted, incoming);
  const layerGroups = groupByLayer(sorted, layers);
  orderWithinLayers(layerGroups, outgoing, incoming);
  const rawLayout = assignCoordinates(layerGroups, opts);

  const hasSequences = items.some(i => !!i.sequenceId);
  if (hasSequences) {
    const sequenceMap = new Map(items.map(i => [i.id, i.sequenceId]));
    const adjusted = applySequenceBandLayout(rawLayout.nodes, layerGroups, sequenceMap, opts);
    let maxY = 0;
    for (const n of adjusted) maxY = Math.max(maxY, n.y + opts.nodeHeight);
    return { nodes: adjusted, width: rawLayout.width, height: maxY + opts.paddingY + 26 };
  }

  return rawLayout;
}

/**
 * Post-process layout: give each sequence its own vertical band while
 * preserving dependency layers horizontally.
 */
function applySequenceBandLayout(
  nodes: LayoutNode[],
  layerGroups: string[][],
  sequenceMap: Map<string, string | undefined>,
  opts: Required<LayoutOptions>,
): LayoutNode[] {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const sequenceOrder: string[] = [];
  const seenSequences = new Set<string>();

  for (const layer of layerGroups) {
    const sorted = [...layer].sort((a, b) => nodeMap.get(a)!.y - nodeMap.get(b)!.y);
    for (const id of sorted) {
      const seqId = sequenceMap.get(id);
      if (!seqId || seenSequences.has(seqId)) continue;
      seenSequences.add(seqId);
      sequenceOrder.push(seqId);
    }
  }

  const bandHeights = new Map<string, number>();
  for (const seqId of sequenceOrder) {
    let maxLayerCount = 0;
    for (const layer of layerGroups) {
      const count = layer.filter(id => sequenceMap.get(id) === seqId).length;
      maxLayerCount = Math.max(maxLayerCount, count);
    }
    bandHeights.set(seqId, opts.nodeHeight + Math.max(0, maxLayerCount - 1) * opts.verticalSpacing);
  }

  const bandStarts = new Map<string, number>();
  let nextY = opts.paddingY;
  for (const seqId of sequenceOrder) {
    bandStarts.set(seqId, nextY);
    nextY += (bandHeights.get(seqId) ?? opts.nodeHeight) + opts.sequenceGroupGap;
  }

  const result = new Map(nodes.map(n => [n.id, { ...n }]));
  for (const layer of layerGroups) {
    const bySequence = new Map<string, string[]>();
    const sorted = [...layer].sort((a, b) => nodeMap.get(a)!.y - nodeMap.get(b)!.y);
    for (const id of sorted) {
      const seqId = sequenceMap.get(id);
      if (!seqId) continue;
      const ids = bySequence.get(seqId) ?? [];
      ids.push(id);
      bySequence.set(seqId, ids);
    }

    for (const [seqId, ids] of bySequence) {
      const bandStart = bandStarts.get(seqId) ?? opts.paddingY;
      ids.forEach((id, index) => {
        const node = result.get(id);
        if (node) {
          node.y = bandStart + index * opts.verticalSpacing;
          node.order = index;
        }
      });
    }
  }

  return [...result.values()];
}

/** Kahn's topological sort. Returns IDs in topological order. */
function topologicalSort(
  ids: Set<string>,
  outgoing: Map<string, string[]>,
  incoming: Map<string, string[]>,
): string[] {
  const inDegree = new Map<string, number>();
  for (const id of ids) {
    inDegree.set(id, incoming.get(id)!.length);
  }

  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  // Stable sort: alphabetical tie-breaking for deterministic output
  queue.sort();

  const result: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    result.push(node);

    const neighbors = [...outgoing.get(node)!];
    neighbors.sort();
    for (const neighbor of neighbors) {
      const newDeg = inDegree.get(neighbor)! - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) {
        // Insert sorted position
        const insertIdx = queue.findIndex(q => q > neighbor);
        if (insertIdx < 0) queue.push(neighbor);
        else queue.splice(insertIdx, 0, neighbor);
      }
    }
  }

  return result;
}

/** Assign layers via longest path from roots (0-indexed). */
function assignLayers(
  sorted: string[],
  incoming: Map<string, string[]>,
): Map<string, number> {
  const layers = new Map<string, number>();

  for (const id of sorted) {
    const parents = incoming.get(id)!;
    if (parents.length === 0) {
      layers.set(id, 0);
    } else {
      const maxParentLayer = Math.max(...parents.map(p => layers.get(p) ?? 0));
      layers.set(id, maxParentLayer + 1);
    }
  }

  return layers;
}

/** Group nodes by their layer index. Returns array of layers (each layer is array of node IDs). */
function groupByLayer(
  sorted: string[],
  layers: Map<string, number>,
): string[][] {
  const maxLayer = Math.max(...[...layers.values()], 0);
  const groups: string[][] = Array.from({ length: maxLayer + 1 }, () => []);

  for (const id of sorted) {
    const layer = layers.get(id)!;
    groups[layer].push(id);
  }

  return groups;
}

/**
 * Barycenter heuristic: reorder nodes within each layer to minimize edge crossings.
 * Two passes: left-to-right then right-to-left.
 */
function orderWithinLayers(
  layerGroups: string[][],
  outgoing: Map<string, string[]>,
  incoming: Map<string, string[]>,
): void {
  // Forward pass: order each layer by average position of incoming neighbors in previous layer
  for (let i = 1; i < layerGroups.length; i++) {
    const prevLayer = layerGroups[i - 1];
    const prevPositions = new Map<string, number>();
    prevLayer.forEach((id, idx) => prevPositions.set(id, idx));

    const barycenters = new Map<string, number>();
    for (const id of layerGroups[i]) {
      const parents = incoming.get(id)!.filter(p => prevPositions.has(p));
      if (parents.length > 0) {
        const avg = parents.reduce((sum, p) => sum + prevPositions.get(p)!, 0) / parents.length;
        barycenters.set(id, avg);
      } else {
        barycenters.set(id, Infinity);
      }
    }

    layerGroups[i].sort((a, b) => {
      const diff = (barycenters.get(a) ?? 0) - (barycenters.get(b) ?? 0);
      return diff !== 0 ? diff : a.localeCompare(b);
    });
  }

  // Backward pass: order each layer by average position of outgoing neighbors in next layer
  for (let i = layerGroups.length - 2; i >= 0; i--) {
    const nextLayer = layerGroups[i + 1];
    const nextPositions = new Map<string, number>();
    nextLayer.forEach((id, idx) => nextPositions.set(id, idx));

    const barycenters = new Map<string, number>();
    for (const id of layerGroups[i]) {
      const children = outgoing.get(id)!.filter(c => nextPositions.has(c));
      if (children.length > 0) {
        const avg = children.reduce((sum, c) => sum + nextPositions.get(c)!, 0) / children.length;
        barycenters.set(id, avg);
      } else {
        barycenters.set(id, Infinity);
      }
    }

    layerGroups[i].sort((a, b) => {
      const diff = (barycenters.get(a) ?? 0) - (barycenters.get(b) ?? 0);
      return diff !== 0 ? diff : a.localeCompare(b);
    });
  }
}

/** Convert layer groups into pixel coordinates. */
function assignCoordinates(
  layerGroups: string[][],
  opts: Required<LayoutOptions>,
): LayoutResult {
  const nodes: LayoutNode[] = [];
  let maxX = 0;
  let maxY = 0;

  for (let layerIdx = 0; layerIdx < layerGroups.length; layerIdx++) {
    const layer = layerGroups[layerIdx];
    for (let orderIdx = 0; orderIdx < layer.length; orderIdx++) {
      const x = opts.paddingX + layerIdx * opts.horizontalSpacing;
      const y = opts.paddingY + orderIdx * opts.verticalSpacing;
      nodes.push({
        id: layer[orderIdx],
        x,
        y,
        layer: layerIdx,
        order: orderIdx,
      });
      maxX = Math.max(maxX, x + opts.nodeWidth);
      maxY = Math.max(maxY, y + opts.nodeHeight);
    }
  }

  return {
    nodes,
    width: maxX + opts.paddingX,
    height: maxY + opts.paddingY,
  };
}
