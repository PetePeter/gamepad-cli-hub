/**
 * Types for Directory Plans (NCN — Network Connected Nodes).
 * Per-directory DAG of work items with dependency tracking.
 */

/** Lifecycle status of a plan item. */
export type PlanStatus = 'pending' | 'startable' | 'doing' | 'wait-tests' | 'blocked' | 'question' | 'done';

/** A single plan item (node in the DAG). */
export interface PlanItem {
  /** Unique identifier (UUID v4) */
  id: string;
  /** Directory this plan belongs to */
  dirPath: string;
  /** Short title displayed on the node */
  title: string;
  /** Longer description / prompt content */
  description: string;
  /** Current lifecycle status */
  status: PlanStatus;
  /** Session ID when status is 'doing' or 'wait-tests' (which session picked it up) */
  sessionId?: string;
  /** Extra context for blocked/question states */
  stateInfo?: string;
  /** Creation timestamp */
  createdAt: number;
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
