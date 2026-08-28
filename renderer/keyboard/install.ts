/**
 * Router installation — the wiring that turns app state into a `KeyEnvironment`.
 *
 * Kept out of `router.ts` so the router core stays free of store imports and
 * testable without Pinia, and out of the shell components so the "what counts
 * as a modal" answer has exactly one definition across every window.
 */

import { isAnyBridgeModalVisible } from '../stores/modal-bridge.js';
import { useModalStack } from '../composables/useModalStack.js';
import { hasAttachedModal } from '../modals/modal-base.js';
import type { PaneId } from '../dock-types.js';
import { installKeyRouter, type KeyEnvironment } from './router.js';

/**
 * Does something modal own the keyboard right now?
 *
 * Sourced from the modal systems' own lifecycles — the Vue modal stack, the
 * bridge modals, and the imperative modal-base attachments — rather than from
 * `querySelector('.modal-overlay.modal--visible')`. The DOM probe was copied
 * into eight call sites and could not see a modal that had not rendered yet.
 */
export function isKeyboardModalOpen(): boolean {
  return useModalStack().isOpen.value || isAnyBridgeModalVisible() || hasAttachedModal();
}

/**
 * Install the router for a single-pane window (snap-out terminal, planner
 * pop-out, memory pop-out). Such a window has no dock, so its one pane is by
 * definition both focused and visible.
 */
export function installSinglePaneKeyRouter(
  pane: PaneId,
  getActiveSessionId: () => string | null,
): () => void {
  return installKeyRouter({
    getActiveSessionId,
    getFocusedPane: () => pane,
    isPaneVisible: (candidate) => candidate === pane,
    isModalOpen: isKeyboardModalOpen,
  });
}

/** Install the router for the main window, whose panes come from the dock. */
export function installDockKeyRouter(env: {
  getActiveSessionId: () => string | null;
  getFocusedPane: () => PaneId | null;
  isPaneVisible: (pane: PaneId) => boolean;
  /** Panels that take over the shell without being modals (settings, draft editor). */
  isPanelOpen: () => boolean;
}): () => void {
  const environment: KeyEnvironment = {
    getActiveSessionId: env.getActiveSessionId,
    getFocusedPane: env.getFocusedPane,
    isPaneVisible: env.isPaneVisible,
    // A full-shell panel blocks workspace keys exactly like a modal does, which
    // is what every hand-rolled guard used to do inline.
    isModalOpen: () => isKeyboardModalOpen() || env.isPanelOpen(),
  };

  return installKeyRouter(environment);
}
