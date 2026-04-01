/**
 * Shared state-to-color mapping for session state dots.
 * Used by session cards, overview grid, and tab bar.
 */

export const STATE_COLORS: Record<string, string> = {
  implementing: '#44cc44',
  waiting: '#ffaa00',
  planning: '#4488ff',
  completed: '#ffd700',
  idle: '#555555',
};

/** Get the color for a session state, defaulting to idle grey */
export function getStateColor(sessionState: string): string {
  return STATE_COLORS[sessionState] ?? STATE_COLORS.idle;
}
