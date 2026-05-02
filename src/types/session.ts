/**
 * Pipeline state for an AI CLI session.
 * Detected from AIAGENT-* keywords in PTY output.
 */
export type SessionState = 'implementing' | 'waiting' | 'planning' | 'completed' | 'idle';

/** Runtime-safe list of valid SessionState values for input validation. */
export const VALID_SESSION_STATES: readonly SessionState[] = ['implementing', 'waiting', 'planning', 'completed', 'idle'];

/**
 * Output-timing based activity level for the visual dot indicator.
 * Independent of SessionState — purely based on stdout/stderr output timing.
 */
export type ActivityLevel = 'active' | 'inactive' | 'idle';

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
  /** Working directory the session was spawned in */
  workingDir?: string;
  /** Pipeline state detected from PTY output */
  state?: SessionState;
  /** True when AIAGENT-QUESTION detected; clears on next non-question output */
  questionPending?: boolean;
  /** CLI-internal session name used for resume (UUID v4, e.g., 'a1b2c3d4-e5f6-...'). Set after spawn. */
  cliSessionName?: string;
  /** Explicit plan item to show on the session row as the current working plan. */
  currentPlanId?: string;
  /** Telegram forum topic ID for this session's topic thread */
  topicId?: number;
  /** Last real PTY output or session/input activity timestamp for elapsed timers. */
  lastOutputAt?: number;
  /** BrowserWindow ID if this session is snapped out to a child window. Undefined/null means main window. */
  windowId?: number;
  /** AIAGENT state controlled by external agents (planning, implementing, completed, idle). Persists across restarts. */
  aiagentState?: 'planning' | 'implementing' | 'completed' | 'idle';
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
  /** Snapshot of the session at removal time (for cleanup handlers). */
  session: SessionInfo;
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

/**
 * A draft prompt memo attached to a session.
 * Composed while the CLI is busy, sent later when ready.
 */
export interface DraftPrompt {
  /** Unique draft identifier (UUID v4) */
  id: string;
  /** Owning session ID */
  sessionId: string;
  /** Short title for pill display */
  label: string;
  /** Full prompt content (sequence parser syntax) */
  text: string;
  /** Creation timestamp */
  createdAt: number;
}
