/**
 * Sidebar — barrel module that composes the three sidebar components
 * (session list, spawn grid, folder planner).
 *
 * Callers should import from this module rather than the individual
 * components so the internal structure can evolve without churn.
 */

import * as sessionList from './session-list.js';
import * as spawnGrid from './spawn-grid.js';
import * as folderPlanner from './folder-planner.js';

export { sessionList, spawnGrid, folderPlanner };

/** Refresh every sidebar section. Called after major state changes. */
export function refreshAll(): void {
  sessionList.refresh();
  spawnGrid.refresh();
  folderPlanner.refresh();
}
