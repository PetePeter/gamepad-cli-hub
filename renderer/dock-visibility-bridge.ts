/**
 * Pane visibility bridge — the seam between the dock workspace and the legacy
 * imperative gamepad navigation in `renderer/screens/`.
 *
 * Navigation needs to know whether a zone can receive focus so it can skip it.
 * Before the dock existed that question was answered by a second collapse
 * system (`sidebar/section-collapse.ts`) holding its own booleans. The dock now
 * owns collapse — via dock mode, rail state and active tab — so there is exactly
 * one answer, and this module hands it to code that cannot inject Vue state.
 *
 * The shell installs the real predicate on bootstrap; the permissive default
 * keeps the nav modules usable in isolation (tests, snap-out windows) rather
 * than making every caller null-check.
 */

import type { PaneId } from './dock-types.js';

type PaneVisibilityPredicate = (paneId: PaneId) => boolean;

let predicate: PaneVisibilityPredicate = () => true;

/** Install the workspace's own `isVisible`. Called once by the docking shell. */
export function setPaneVisibilityBridge(next: PaneVisibilityPredicate): void {
  predicate = next;
}

/** Restore the permissive default — for tests and shell teardown. */
export function resetPaneVisibilityBridge(): void {
  predicate = () => true;
}

/** True when the pane is on screen and can take focus. */
export function isPaneVisible(paneId: PaneId): boolean {
  return predicate(paneId);
}
