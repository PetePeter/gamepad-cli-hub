import type {
  MemoryForest,
  MemoryTraversal,
  MemoryTraversalEntry,
} from '../../src/types/memory.js';

export interface MemoryGraphLayoutNode extends MemoryTraversalEntry {
  key: string;
  x: number;
  y: number;
  label: string;
}

export interface MemoryGraphLayoutEdge {
  from: string;
  to: string;
}

export interface MemoryGraphLayout {
  graphDepth: number;
  zoom: number;
  nodes: MemoryGraphLayoutNode[];
  edges: MemoryGraphLayoutEdge[];
}

const COLUMN_WIDTH = 230;
const ROW_HEIGHT = 130;
const ORIGIN = 40;

const MAX_GRAPH_DEPTH = 100;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.5;

export function memoryOccurrenceKey(path: readonly string[]): string {
  return path.join('\u0000');
}

function compareEntries(a: MemoryTraversalEntry, b: MemoryTraversalEntry): number {
  return a.depth - b.depth
    || memoryOccurrenceKey(a.path).localeCompare(memoryOccurrenceKey(b.path))
    || a.status.localeCompare(b.status);
}

export function buildMemoryGraphLayout(
  traversal: MemoryTraversal,
  options: { zoom?: number } = {},
): MemoryGraphLayout {
  const graphDepth = Math.min(Math.max(0, traversal.graphDepth), MAX_GRAPH_DEPTH);
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, options.zoom ?? 1));
  const entries = [...traversal.entries].sort(compareEntries);
  const depthIndexes = new Map<number, number>();
  const nodes = entries.map((entry) => {
    const index = depthIndexes.get(entry.depth) ?? 0;
    depthIndexes.set(entry.depth, index + 1);
    return {
      ...entry,
      key: memoryOccurrenceKey(entry.path),
      x: ORIGIN + entry.depth * COLUMN_WIDTH,
      y: ORIGIN + index * ROW_HEIGHT,
      label: entry.record?.tldr ?? `${entry.id} (${entry.status})`,
      breadcrumbs: [...entry.breadcrumbs],
      path: [...entry.path],
      ...(entry.via ? { via: { ...entry.via } } : {}),
      ...(entry.record ? { record: { ...entry.record, attachments: entry.record.attachments.map((a) => ({ ...a })) } } : {}),
    };
  });
  const keys = new Set(nodes.map((node) => node.key));
  const edges = nodes
    .filter((node) => node.path.length > 1)
    .map((node) => ({
      from: memoryOccurrenceKey(node.path.slice(0, -1)),
      to: node.key,
    }))
    .filter((edge) => keys.has(edge.from));
  return { graphDepth, zoom, nodes, edges };
}

/**
 * Depth of every node, measured as the LONGEST path reaching it.
 *
 * Shortest-path depth would let an edge point backwards: with a->b, b->c and
 * a->c, `c` would sit beside `b` and the a->c line would run right-to-left.
 * Nodes on a cycle keep the best depth found before the cycle closed, which is
 * what stops the walk from recursing forever.
 */
function computeDepths(ids: readonly string[], edges: ReadonlyArray<{ fromId: string; toId: string }>): Map<string, number> {
  const children = new Map<string, string[]>();
  for (const id of ids) children.set(id, []);
  for (const edge of edges) {
    if (edge.fromId === edge.toId) continue;
    children.get(edge.fromId)?.push(edge.toId);
  }

  const depths = new Map<string, number>(ids.map((id) => [id, 0]));
  const walking = new Set<string>();

  const visit = (id: string, depth: number): void => {
    if (walking.has(id)) return;
    if (depth <= (depths.get(id) ?? 0) && depth !== 0) return;
    depths.set(id, Math.max(depths.get(id) ?? 0, depth));
    walking.add(id);
    for (const child of children.get(id) ?? []) visit(child, depth + 1);
    walking.delete(id);
  };

  const targeted = new Set(edges.filter((e) => e.fromId !== e.toId).map((edge) => edge.toId));
  const roots = ids.filter((id) => !targeted.has(id));
  // A pure cycle has no root; entering at its lowest id keeps layout stable.
  for (const id of roots.length > 0 ? roots : ids) visit(id, 0);
  return depths;
}

/**
 * Lay out the whole session forest.
 *
 * Unlinked memories are banked into a column of their own past the deepest
 * linked node: they belong to no chain, and mixing them into column 0 would
 * imply they were roots of something.
 */
export function buildMemoryForestLayout(
  forest: MemoryForest,
  options: { zoom?: number } = {},
): MemoryGraphLayout {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, options.zoom ?? 1));
  const records = [...forest.records].sort((a, b) => a.id.localeCompare(b.id));
  const ids = records.map((record) => record.id);
  const connected = new Set<string>();
  for (const edge of forest.edges) {
    connected.add(edge.fromId);
    connected.add(edge.toId);
  }

  const depths = computeDepths(ids.filter((id) => connected.has(id)), forest.edges);
  const isolatedColumn = Math.max(-1, ...depths.values()) + 1;
  const rowsPerColumn = new Map<number, number>();

  const nodes: MemoryGraphLayoutNode[] = records.map((record) => {
    const column = connected.has(record.id) ? depths.get(record.id) ?? 0 : isolatedColumn;
    const row = rowsPerColumn.get(column) ?? 0;
    rowsPerColumn.set(column, row + 1);
    return {
      id: record.id,
      depth: column,
      path: [record.id],
      breadcrumbs: [record.tldr],
      status: 'record',
      key: record.id,
      x: ORIGIN + column * COLUMN_WIDTH,
      y: ORIGIN + row * ROW_HEIGHT,
      label: record.tldr,
    };
  });

  return {
    graphDepth: isolatedColumn,
    zoom,
    nodes,
    edges: forest.edges.map((edge) => ({ from: edge.fromId, to: edge.toId })),
  };
}
