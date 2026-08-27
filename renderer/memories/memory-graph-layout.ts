import type { MemoryTraversal, MemoryTraversalEntry } from '../../src/types/memory.js';

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
      x: 40 + entry.depth * 230,
      y: 40 + index * 130,
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
