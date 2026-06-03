/**
 * Pure resolver for a popout's Ctrl+<n> focus-slot request, handled by the
 * main window (the single authority on slot→session ordering).
 *
 * Returns the session to focus plus whether the main window should switch to
 * that session's terminal: a local session switches the view to its terminal,
 * while a session living in another popout is only raised — the main window's
 * current view (plan/overview/terminal) is left untouched.
 */
export interface FocusSlotAction {
  sessionId: string;
  /** True only for local sessions — switch the main window to the terminal. */
  switchToTerminal: boolean;
}

export function resolveFocusSlot(
  slot: number,
  shortcutMap: Map<string, number>,
  isSnappedOut: (sessionId: string) => boolean,
): FocusSlotAction | null {
  for (const [sessionId, assignedSlot] of shortcutMap) {
    if (assignedSlot !== slot) continue;
    return { sessionId, switchToTerminal: !isSnappedOut(sessionId) };
  }
  return null;
}
