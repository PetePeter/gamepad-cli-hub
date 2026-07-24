/**
 * recycle-bin-tree — pure builder for the Recycle Bin's nested tree (P-0642).
 *
 * Turns a flat `RecycleBinEntry[]` into a Project ▸ Group ▸ Folder ▸ sessions
 * hierarchy. Kept free of Vue/state so it is unit-testable with a plain fake
 * `resolveProject`. Ordering is deterministic (newest-first at every level) and
 * NO expiry information is surfaced — retention/purge lives in the manager, not
 * the UI.
 */

import type { RecycleBinEntry } from '../src/types/recycle-bin.js';

/** Synthetic bucket for entries whose working dir maps to no known project. */
export const NO_PROJECT_ID = '__no_project__';
export const NO_PROJECT_NAME = '(no project)';

export interface RecycleFolderNode {
  kind: 'folder';
  /** Working directory — unique within its parent, used as the Vue key. */
  key: string;
  /** Shortened path for compact display. */
  label: string;
  /** Full working directory (tooltip + row path line). */
  fullPath: string;
  count: number;
  /** Entries newest-first. */
  entries: RecycleBinEntry[];
}

export interface RecycleGroupNode {
  kind: 'group';
  id: string;
  name: string;
  count: number;
  folders: RecycleFolderNode[];
}

export interface RecycleProjectNode {
  kind: 'project';
  /** Project id, or NO_PROJECT_ID for the synthetic bucket. */
  id: string;
  name: string;
  count: number;
  /** Groups first, then ungrouped folders. */
  children: Array<RecycleGroupNode | RecycleFolderNode>;
}

/** Resolve an entry to its owning project, or null when none applies. */
export type ResolveProject = (entry: RecycleBinEntry) => { id: string; name: string } | null;

/** Case-insensitive match over name, cliType, and workingDir. Empty query → all. */
export function matchesRecycleQuery(entry: RecycleBinEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    entry.name.toLowerCase().includes(q) ||
    entry.cliType.toLowerCase().includes(q) ||
    entry.workingDir.toLowerCase().includes(q)
  );
}

/** Compact a path to its last two segments, prefixed with an ellipsis. */
export function shortenPath(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean);
  if (parts.length <= 2) return path;
  return '.../' + parts.slice(-2).join('/');
}

interface FolderBucket {
  fullPath: string;
  entries: RecycleBinEntry[];
}
interface GroupBucket {
  id: string;
  name: string;
  folders: Map<string, FolderBucket>;
}
interface ProjectBucket {
  id: string;
  name: string;
  groups: Map<string, GroupBucket>;
  ungrouped: Map<string, FolderBucket>;
}

/** Newest closedAt among a set of entries (for section ordering). */
function newest(entries: RecycleBinEntry[]): number {
  return entries.reduce((max, e) => (e.closedAt > max ? e.closedAt : max), -Infinity);
}

function buildFolderNode(bucket: FolderBucket): RecycleFolderNode {
  const entries = [...bucket.entries].sort((a, b) => b.closedAt - a.closedAt);
  return {
    kind: 'folder',
    key: bucket.fullPath,
    label: shortenPath(bucket.fullPath),
    fullPath: bucket.fullPath,
    count: entries.length,
    entries,
  };
}

/** Sort folder nodes newest-first by their most recent entry (non-mutating). */
function sortFolders(nodes: RecycleFolderNode[]): RecycleFolderNode[] {
  return [...nodes].sort((a, b) => newest(b.entries) - newest(a.entries));
}

/**
 * Build the Project ▸ Group ▸ Folder tree from a flat entry list.
 * `query` filters entries first, so empty levels never appear.
 */
export function buildRecycleTree(
  entries: RecycleBinEntry[],
  resolveProject: ResolveProject,
  query = '',
): RecycleProjectNode[] {
  const projects = new Map<string, ProjectBucket>();

  for (const entry of entries) {
    if (!matchesRecycleQuery(entry, query)) continue;

    const resolved = resolveProject(entry);
    const projectId = resolved?.id ?? NO_PROJECT_ID;
    const projectName = resolved?.name ?? NO_PROJECT_NAME;

    let project = projects.get(projectId);
    if (!project) {
      project = { id: projectId, name: projectName, groups: new Map(), ungrouped: new Map() };
      projects.set(projectId, project);
    }

    const dir = entry.workingDir;
    if (entry.runtimeGroupId) {
      let group = project.groups.get(entry.runtimeGroupId);
      if (!group) {
        group = {
          id: entry.runtimeGroupId,
          name: entry.runtimeGroupName || entry.runtimeGroupId,
          folders: new Map(),
        };
        project.groups.set(entry.runtimeGroupId, group);
      }
      pushFolder(group.folders, dir, entry);
    } else {
      pushFolder(project.ungrouped, dir, entry);
    }
  }

  return finalizeProjects(projects);
}

function pushFolder(folders: Map<string, FolderBucket>, dir: string, entry: RecycleBinEntry): void {
  let folder = folders.get(dir);
  if (!folder) {
    folder = { fullPath: dir, entries: [] };
    folders.set(dir, folder);
  }
  folder.entries.push(entry);
}

function finalizeProjects(projects: Map<string, ProjectBucket>): RecycleProjectNode[] {
  const nodes: RecycleProjectNode[] = [];

  for (const project of projects.values()) {
    // Groups (each a node with folders) followed by ungrouped folders.
    const groupNodes: RecycleGroupNode[] = [...project.groups.values()].map(group => {
      const folders = sortFolders([...group.folders.values()].map(buildFolderNode));
      const count = folders.reduce((sum, f) => sum + f.count, 0);
      return { kind: 'group', id: group.id, name: group.name, count, folders };
    });
    groupNodes.sort((a, b) => newestOfGroup(b) - newestOfGroup(a));

    const ungroupedNodes = sortFolders([...project.ungrouped.values()].map(buildFolderNode));

    const children: Array<RecycleGroupNode | RecycleFolderNode> = [...groupNodes, ...ungroupedNodes];
    const count = children.reduce((sum, c) => sum + c.count, 0);
    nodes.push({ kind: 'project', id: project.id, name: project.name, count, children });
  }

  // Real projects newest-first; the synthetic (no project) bucket always last.
  nodes.sort((a, b) => {
    if (a.id === NO_PROJECT_ID) return 1;
    if (b.id === NO_PROJECT_ID) return -1;
    return newestOfProject(b) - newestOfProject(a);
  });
  return nodes;
}

function newestOfGroup(group: RecycleGroupNode): number {
  return group.folders.reduce((max, f) => Math.max(max, newest(f.entries)), -Infinity);
}

function newestOfProject(project: RecycleProjectNode): number {
  return project.children.reduce((max, child) => {
    const folders = child.kind === 'group' ? child.folders : [child];
    return folders.reduce((m, f) => Math.max(m, newest(f.entries)), max);
  }, -Infinity);
}
