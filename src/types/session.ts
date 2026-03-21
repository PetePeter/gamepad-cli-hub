/**
 * CLI session information
 */
export interface SessionInfo {
  /** Unique session identifier */
  id: string;
  /** Display name for the session */
  name: string;
  /** Type of CLI (e.g., 'claude-code', 'copilot-cli') */
  cliType: string;
  /** OS window handle (hex string) */
  windowHandle: string;
  /** Process ID */
  processId: number;
}

/**
 * Session change event data
 */
export interface SessionChangeEvent {
  /** The session that became active */
  sessionId: string | null;
  /** Previous session ID */
  previousSessionId: string | null;
  /** Timestamp of change */
  timestamp: number;
}

/**
 * Session added event data
 */
export interface SessionAddedEvent extends SessionInfo {
  timestamp: number;
}

/**
 * Session removed event data
 */
export interface SessionRemovedEvent {
  sessionId: string;
  timestamp: number;
}
