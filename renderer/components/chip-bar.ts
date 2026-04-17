/**
 * ChipBar component — the horizontal strip above the terminal that
 * shows draft pills and plan chips for the active context.
 *
 * Thin wrapper that composes draft-strip + plan-chips. Exposes a
 * stable mount/refresh API so future refactors can move the logic
 * here without touching callers.
 *
 * The strip is context-aware: in the terminal view it shows drafts +
 * plan chips for the active session; in the plan view it shows plan
 * chips for the directory (drafts hidden).
 */

import { initDraftStrip, dismissDraftStrip } from '../drafts/draft-strip.js';
import { renderPlanChips } from '../plans/plan-chips.js';
import { state } from '../state.js';

/** One-time setup — creates the DOM container above the terminal area. */
export function init(): void {
  initDraftStrip();
}

/** Refresh chips for a session (defaults to the active session). */
export function refresh(sessionId?: string): Promise<void> {
  const id = sessionId ?? state.activeSessionId;
  if (!id) return Promise.resolve();
  return renderPlanChips(id);
}

/** Hide the strip (e.g. when entering a modal that covers it). */
export function dismiss(): void {
  dismissDraftStrip();
}
