/**
 * SessionList component — the vertical list of session cards grouped by
 * working directory, rendered in the sidebar (#sidePanel).
 *
 * Thin wrapper over the existing render + focus helpers. The underlying
 * implementation lives in `screens/sessions-render.ts` and
 * `screens/sessions-spawn.ts` (focus management). This component exposes
 * a stable mount/refresh API so future refactors can migrate the
 * implementations here without touching callers.
 */

import { renderSessions, updateStatusCounts } from '../screens/sessions-render.js';
import { autoSelectFocusedSession } from '../screens/sessions-spawn.js';

/** Refresh the session list DOM from current state. */
export function refresh(): void {
  renderSessions();
  updateStatusCounts();
}

/** Auto-select the session currently focused by D-pad navigation. */
export function selectFocused(): void {
  autoSelectFocusedSession();
}
