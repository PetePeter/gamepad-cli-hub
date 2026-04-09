/**
 * Tab cycling — resolves the next terminal to switch to.
 *
 * Uses the navList-derived visual order (group-aware, sorted) so Ctrl+Tab
 * matches what the user sees on screen, not insertion/creation order.
 * Sessions in collapsed groups are appended after visible ones.
 */

/**
 * Given the sorted session IDs (display order), the set of IDs that have
 * active terminals, the currently active ID, and a direction (+1 forward,
 * -1 backward), returns the next terminal ID to switch to — or null when
 * no switch is possible (0-1 terminals, no active terminal, etc.).
 */
export function resolveNextTerminalId(
  sortedSessionIds: string[],
  terminalSessionIds: string[],
  activeId: string | null,
  direction: 1 | -1,
): string | null {
  const terminalSet = new Set(terminalSessionIds);
  const sorted = sortedSessionIds.filter(id => terminalSet.has(id));

  if (sorted.length <= 1 || !activeId) return null;

  const currentIdx = sorted.indexOf(activeId);
  if (currentIdx === -1) return null;

  const newIdx = (currentIdx + direction + sorted.length) % sorted.length;
  return sorted[newIdx];
}
