/**
 * Pipeline state for an AI CLI session.
 * Detected from AIAGENT-* keywords in PTY output.
 */
export type SessionState = 'implementing' | 'waiting' | 'planning' | 'idle';

/** Runtime-safe list of valid SessionState values for input validation. */
export const VALID_SESSION_STATES: readonly SessionState[] = ['implementing', 'waiting', 'planning', 'idle'];

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
  /** Process ID */
  processId: number;
  /** Pipeline state detected from PTY output */
  state?: SessionState;
  /** True when AIAGENT-QUESTION detected; clears on next non-question output */
  questionPending?: boolean;
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

/**
 * Emitted when a session's pipeline state changes (detected from AIAGENT-* keywords).
 */
export interface SessionStateChangeEvent {
  sessionId: string;
  previousState: SessionState;
  newState: SessionState;
  timestamp: number;
}
