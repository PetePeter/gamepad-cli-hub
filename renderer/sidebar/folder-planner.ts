/**
 * FolderPlanner component — the grid of directory plan buttons at the
 * bottom of the sidebar. Each button opens the planner canvas for one
 * working directory.
 *
 * Thin wrapper over `screens/sessions-plans.ts`. Exposes a stable
 * mount/refresh/badges API for future refactors.
 */

import { renderPlansGrid, refreshPlanBadges, updatePlansFocus } from '../screens/sessions-plans.js';

/** Refresh the folder planner grid DOM from current state. */
export function refresh(): void {
  renderPlansGrid();
}

/** Recompute and re-render plan badges on session + folder cards. */
export function refreshBadges(): Promise<void> {
  return refreshPlanBadges();
}

/** Apply current focus highlight to the folder planner grid. */
export function updateFocus(): void {
  updatePlansFocus();
}
