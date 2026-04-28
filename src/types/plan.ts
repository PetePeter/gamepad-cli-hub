/**
 * Types for Directory Plans (NCN — Network Connected Nodes).
 * Per-directory DAG of work items with dependency tracking.
 */

/** Lifecycle status of a plan item.
 * - planning: initial state, may be blocked by dependencies
 * - ready: all dependencies satisfied, ready for agent to pick up (computed state, not set directly)
 * - coding: agent is actively working on it
 * - review: awaiting human review before completion
 * - blocked: unable to proceed (requires mandatory stateInfo reason)
 * - done: completed (only reachable via plan_complete endpoint)
 */
export type PlanStatus = 'planning' | 'ready' | 'coding' | 'review' | 'blocked' | 'done';

/** Type classification for a plan item. */
export type PlanType = 'bug' | 'feature' | 'research';

/** A single plan item (node in the DAG). */
export interface PlanItem {
  /** Unique identifier (UUID v4) */
  id: string;
  /** Human-readable stable identifier for UI/MCP references (for example, P-0007). */
  humanId?: string;
  /** Directory this plan belongs to */
  dirPath: string;
  /** Short title displayed on the node */
  title: string;
  /** Longer description / prompt content */
  description: string;
  /** Current lifecycle status */
  status: PlanStatus;
  /** Session ID when status is 'coding' or 'review' (which session picked it up) */
  sessionId?: string;
  /** Extra context for blocked/question states */
  stateInfo?: string;
  /** Documentation of what was accomplished when completing this plan (required by plan_complete) */
  completionNotes?: string;
  /** Type classification: bug, feature, or research */
  type?: PlanType;
  /** Creation timestamp */
  createdAt: number;
  /** Timestamp when the current lifecycle status last changed. */
  stateUpdatedAt?: number;
  /** Last update timestamp */
  updatedAt: number;
}

/** A dependency edge: fromId (blocker) must be done before toId (blocked) can start. */
export interface PlanDependency {
  /** The blocker item ID */
  fromId: string;
  /** The blocked item ID */
  toId: string;
}

/** All plan data for a single directory. */
export interface DirectoryPlan {
  dirPath: string;
  items: PlanItem[];
  dependencies: PlanDependency[];
}

/**
 * Get the display title for a plan item with type prefix.
 * - If type is undefined, returns title unchanged.
 * - If title already starts with the appropriate prefix, no double-prefix.
 * - Otherwise, prepends [B], [F], or [R] based on type.
 */
export function getDisplayTitle(title: string, type?: PlanType): string {
  if (!type) return title;

  const prefixMap = { bug: '[B]', feature: '[F]', research: '[R]' };
  const prefix = prefixMap[type];

  // Check if already prefixed
  if (title.startsWith(prefix)) return title;

  return `${prefix} ${title}`;
}

/**
 * Compute whether a plan item is startable (all dependencies satisfied).
 * A plan is startable if:
 * - It has no blocking dependencies, OR
 * - All items it depends on are done
 *
 * Note: This is a computed property, not stored as a state.
 * The actual status should be 'ready' when isStartable returns true for non-active items.
 */
export function isStartable(item: PlanItem, allDeps: PlanDependency[], allItems: PlanItem[]): boolean {
  const blockers = allDeps
    .filter(d => d.toId === item.id)
    .map(d => allItems.find(x => x.id === d.fromId))
    .filter(Boolean);

  if (blockers.length === 0) return true;
  return blockers.every(b => b!.status === 'done');
}
