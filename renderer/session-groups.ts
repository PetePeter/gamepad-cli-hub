/**
 * Session groups — pure grouping, flat nav list, and reorder logic.
 * No DOM, no side effects — easy to test.
 */

import type { Session } from './state.js';

// ============================================================================
// Types
// ============================================================================

export interface SessionGroup {
  /** Working directory path (grouping key). */
  dirPath: string;
  /** Display name for the group header (custom config name, or folder name extracted from path). */
  displayName: string;
  /** Sessions belonging to this group. */
  sessions: Session[];
  /** Whether this group is collapsed. */
  collapsed: boolean;
}

export type NavItemType = 'overview-button' | 'group-header' | 'session-card';

export interface NavItem {
  type: NavItemType;
  /** For overview-button: "overview". For group-header: dirPath. For session-card: session id. */
  id: string;
  /** Index of the group this item belongs to (in the groups array). -1 for overview-button. */
  groupIndex: number;
}

export interface SessionGroupPrefs {
  /** Working directory paths in display order. */
  order: string[];
  /** Working directory paths that are collapsed. */
  collapsed: string[];
  /** Bookmarked directory paths — persist as empty groups even with no sessions. */
  bookmarked?: string[];
  /** Stable session keys hidden from overview. Falls back to session id when unavailable. */
  overviewHidden?: string[];
}

// ============================================================================
// Grouping
// ============================================================================

/**
 * Extract the display name (last path segment) from a directory path.
 * Handles both Windows backslash and Unix forward slash paths.
 */
export function dirDisplayName(dirPath: string): string {
  const trimmed = dirPath.replace(/[\\/]+$/, '');
  const sep = trimmed.lastIndexOf('\\') !== -1 ? '\\' : '/';
  const last = trimmed.split(sep).pop();
  return last || dirPath;
}

/**
 * Case-insensitive path equality check on Windows.
 * Lowercases both sides when running on win32 so that mixed-case paths
 * from different sources (project store vs session config) match reliably.
 */
export function pathsMatch(a: string, b: string): boolean {
  const platform = typeof process !== 'undefined' ? process.platform : undefined;
  if (platform === 'win32' || platform === undefined) {
    return a.toLowerCase() === b.toLowerCase();
  }
  return a === b;
}

/**
 * Resolve the best display name for a directory path.
 * Priority: project name > configured directory name > path tail.
 */
export function resolveGroupDisplayName(
  dirPath: string,
  directories: Array<{ name: string; path: string }>,
  projects?: Array<{ name: string; canonicalPath: string; alternatePaths: string[] }>,
): string {
  // Project identity is the durable owner. Directory labels are only fallback aliases.
  if (projects) {
    for (const project of projects) {
      if (pathsMatch(project.canonicalPath, dirPath)) return project.name;
      if (project.alternatePaths.some(alt => pathsMatch(alt, dirPath))) return project.name;
    }
  }

  const dirMatch = directories.find(d => pathsMatch(d.path, dirPath));
  if (dirMatch) return dirMatch.name;

  // 3. Fallback to last path segment
  return dirDisplayName(dirPath);
}

/**
 * Group sessions by working directory.
 *
 * Groups are ordered according to `prefs.order`. Directories not in the
 * order list are appended alphabetically at the end. Collapse state is
 * read from `prefs.collapsed`.
 *
 * @param sessions    All sessions to group.
 * @param getDir      Function to get the working directory for a session id.
 * @param prefs       Persisted group order and collapse state.
 */
export function groupSessionsByDirectory(
  sessions: Session[],
  getDir: (id: string) => string,
  prefs: SessionGroupPrefs = { order: [], collapsed: [] },
): SessionGroup[] {
  // Bucket sessions by directory
  const buckets = new Map<string, Session[]>();
  for (const session of sessions) {
    const dir = session.projectPath || getDir(session.id) || session.workingDir || '';
    if (!buckets.has(dir)) buckets.set(dir, []);
    buckets.get(dir)!.push(session);
  }

  // Include bookmarked dirs as empty buckets so they always appear
  for (const dir of prefs.bookmarked ?? []) {
    if (!buckets.has(dir)) buckets.set(dir, []);
  }

  // Build ordered list of dirPaths
  const orderedDirs: string[] = [];
  const seen = new Set<string>();

  // First: dirs from prefs.order that have sessions or are bookmarked
  for (const dir of prefs.order) {
    if (buckets.has(dir) && !seen.has(dir)) {
      orderedDirs.push(dir);
      seen.add(dir);
    }
  }

  // Then: remaining dirs alphabetically
  const remaining = [...buckets.keys()]
    .filter(d => !seen.has(d))
    .sort((a, b) => dirDisplayName(a).localeCompare(dirDisplayName(b)));
  orderedDirs.push(...remaining);

  const collapsedSet = new Set(prefs.collapsed);

  return orderedDirs.map(dir => ({
    dirPath: dir,
    displayName: dirDisplayName(dir),
    sessions: buckets.get(dir) || [],
    collapsed: collapsedSet.has(dir),
  }));
}

// ============================================================================
// Flat navigation list
// ============================================================================

/**
 * Build a flat navigation list from grouped sessions.
 * Includes group headers and (for expanded groups) their session cards.
 */
export function buildFlatNavList(groups: SessionGroup[]): NavItem[] {
  const items: NavItem[] = [];
  const hasSessions = groups.some(group => group.sessions.length > 0);
  if (hasSessions) {
    items.push({ type: 'overview-button', id: 'overview', groupIndex: -1 });
  }
  for (let gi = 0; gi < groups.length; gi++) {
    const group = groups[gi];
    if (group.sessions.length === 0) continue;
    items.push({ type: 'group-header', id: group.dirPath, groupIndex: gi });
    if (!group.collapsed) {
      for (const session of group.sessions) {
        items.push({ type: 'session-card', id: session.id, groupIndex: gi });
      }
    }
  }
  return items;
}

export function getVisibleSessions(
  groups: SessionGroup[],
  prefs: SessionGroupPrefs = { order: [], collapsed: [] },
): Session[] {
  return groups.flatMap(group => group.sessions.filter(session => !isSessionHiddenFromOverview(session, prefs)));
}

export function getSessionOverviewKey(session: Session): string {
  return session.cliSessionName || session.id;
}

export function getSessionOverviewAliases(session: Session): string[] {
  const stableKey = getSessionOverviewKey(session);
  return stableKey === session.id ? [stableKey] : [stableKey, session.id];
}

export function isSessionHiddenFromOverview(
  session: Session,
  prefs: SessionGroupPrefs = { order: [], collapsed: [] },
): boolean {
  const hidden = new Set(prefs.overviewHidden ?? []);
  return getSessionOverviewAliases(session).some(key => hidden.has(key));
}

/**
 * Find the nav list index for a given session id.
 * Returns -1 if not found (e.g. in a collapsed group).
 */
export function findNavIndexBySessionId(navList: NavItem[], sessionId: string): number {
  return navList.findIndex(item => item.type === 'session-card' && item.id === sessionId);
}

// ============================================================================
// Group reordering
// ============================================================================

/**
 * Move a group up in the order. Returns a new order array.
 * No-op if already first.
 */
export function moveGroupUp(order: string[], dirPath: string): string[] {
  const idx = order.indexOf(dirPath);
  if (idx <= 0) return order;
  const next = [...order];
  [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
  return next;
}

/**
 * Move a group down in the order. Returns a new order array.
 * No-op if already last.
 */
export function moveGroupDown(order: string[], dirPath: string): string[] {
  const idx = order.indexOf(dirPath);
  if (idx < 0 || idx >= order.length - 1) return order;
  const next = [...order];
  [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
  return next;
}

/**
 * Toggle collapse state for a directory. Returns a new collapsed array.
 */
export function toggleCollapse(collapsed: string[], dirPath: string): string[] {
  return collapsed.includes(dirPath)
    ? collapsed.filter(d => d !== dirPath)
    : [...collapsed, dirPath];
}
