/**
 * Shared activity-level-to-color mapping for session activity dots.
 * Used by session cards and overview grid.
 *
 * Activity level is based purely on output timing — independent of AIAGENT session state.
 */

export const ACTIVITY_COLORS: Record<string, string> = {
  active: '#44cc44',    // Green — producing output
  inactive: '#4488ff',  // Blue — no output for >10s
  idle: '#555555',      // Grey — no output for >5min
};

/** Get the color for an activity level, defaulting to idle grey */
export function getActivityColor(activityLevel: string): string {
  return ACTIVITY_COLORS[activityLevel] ?? ACTIVITY_COLORS.idle;
}
