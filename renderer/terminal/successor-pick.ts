/**
 * Successor selection — which terminal takes over when the active one goes away.
 *
 * Mirrors tab-cycling.ts: both resolve a target from the navList-derived visual
 * order so the choice matches what the user sees, not Map insertion order.
 * Sessions in collapsed groups (and hidden / snapped-out ones) are absent from
 * that order by construction, so they can never be auto-selected.
 */

/**
 * Given the visible session IDs in display order, the IDs that still have live
 * terminals, and the session that just closed, returns the ID to activate — or
 * null when no visible session survives (caller should deselect rather than
 * silently activate something the user cannot see).
 *
 * The closed session is normally still present in `orderedVisibleIds`, because
 * the sidebar rebuild happens after the terminal teardown; that position is what
 * lets us pick its true neighbour instead of restarting from the top.
 */
export function resolveSuccessorSessionId(
  orderedVisibleIds: string[],
  liveTerminalIds: string[],
  closedSessionId: string,
): string | null {
  const live = new Set(liveTerminalIds);
  const closedIdx = orderedVisibleIds.indexOf(closedSessionId);

  // Walk forward from the closed slot, wrapping once, and take the first survivor.
  const start = closedIdx >= 0 ? closedIdx + 1 : 0;
  for (let step = 0; step < orderedVisibleIds.length; step++) {
    const id = orderedVisibleIds[(start + step) % orderedVisibleIds.length];
    if (id !== closedSessionId && live.has(id)) return id;
  }

  return null;
}
