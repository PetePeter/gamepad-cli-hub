/**
 * SpawnGrid component — the grid of spawn-new-session buttons at the
 * bottom of the sidebar.
 *
 * Thin wrapper over existing helpers in `screens/sessions-spawn.ts`.
 * Exposes a stable mount/refresh API so the underlying implementation
 * can be migrated here without touching callers.
 */

import { renderSpawnGrid, spawnNewSession } from '../screens/sessions-spawn.js';

/** Refresh the spawn grid DOM from current state. */
export function refresh(): void {
  renderSpawnGrid();
}

/** Start a new session spawn flow (opens dir picker if no preselected path). */
export function spawn(cliType?: string, preselectedPath?: string): Promise<void> {
  return spawnNewSession(cliType, preselectedPath);
}
