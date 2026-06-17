/**
 * Pure resolver for a popout's Ctrl+<n> focus-slot request, handled by the
 * main window (the single authority on slot→session ordering).
 *
 * Returns the id of the session occupying the given display slot, or null when
 * no session maps to it. Snapped-out sessions are excluded from the shortcut
 * map by getOrderedSessionIds, so every resolved session is local — the call
 * site switches the main window to its terminal and raises its window.
 */
export function resolveFocusSlot(
  slot: number,
  shortcutMap: Map<string, number>,
): string | null {
  for (const [sessionId, assignedSlot] of shortcutMap) {
    if (assignedSlot === slot) return sessionId;
  }
  return null;
}
