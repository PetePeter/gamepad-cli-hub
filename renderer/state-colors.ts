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

/**
 * Peer link status dot colors (federation Peers tab). Green = online,
 * amber = pairing in progress, grey = offline. Kept alongside the activity
 * colors so every status dot in the app shares one palette source.
 */
export const PEER_STATUS_COLORS: Record<string, string> = {
  online: '#44cc44',   // Green — link is up
  pairing: '#ff9f1a',  // Amber — handshake in progress
  offline: '#555555',  // Grey — no link
};

/** Get the color for a peer status, defaulting to offline grey. */
export function getPeerStatusColor(status: string): string {
  return PEER_STATUS_COLORS[status] ?? PEER_STATUS_COLORS.offline;
}
