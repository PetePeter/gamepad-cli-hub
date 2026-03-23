import { EventEmitter } from 'events';
import type { SessionInfo, SessionChangeEvent, SessionAddedEvent, SessionRemovedEvent } from '../types/session.js';

/**
 * Manages CLI sessions, tracking active sessions and handling focus switching.
 *
 * ## Events
 *
 * SessionManager extends EventEmitter and emits the following events that
 * external code can subscribe to:
 *
 * - `session:added`   (SessionAddedEvent)   — A new session was registered.
 * - `session:removed` (SessionRemovedEvent)  — A session was removed.
 * - `session:changed` (SessionChangeEvent)   — The active session changed
 *                                              (including when cleared to null).
 */
export class SessionManager extends EventEmitter {
  private sessions: Map<string, SessionInfo> = new Map();
  private activeSessionId: string | null = null;
  private sessionOrder: string[] = [];

  constructor() {
    super();
  }

  /**
   * Add a new CLI session
   * @param sessionInfo - Session information
   */
  addSession(sessionInfo: SessionInfo): void {
    const { id } = sessionInfo;

    if (this.sessions.has(id)) {
      throw new Error(`Session with id "${id}" already exists`);
    }

    this.sessions.set(id, sessionInfo);
    this.sessionOrder.push(id);

    // Set as active if it's the first session
    if (this.sessions.size === 1) {
      this.setActiveSession(id);
    }

    const event: SessionAddedEvent = {
      ...sessionInfo,
      timestamp: Date.now()
    };
    this.emit('session:added', event);
  }

  /**
   * Remove a session
   * @param sessionId - Session ID to remove
   */
  removeSession(sessionId: string): void {
    if (!this.sessions.has(sessionId)) {
      throw new Error(`Session with id "${sessionId}" does not exist`);
    }

    this.sessions.delete(sessionId);
    this.sessionOrder = this.sessionOrder.filter(id => id !== sessionId);

    // If we removed the active session, switch to another
    if (this.activeSessionId === sessionId) {
      if (this.sessionOrder.length > 0) {
        // Switch to the next available session
        this.setActiveSession(this.sessionOrder[0]);
      } else {
        this.activeSessionId = null;
        const event: SessionChangeEvent = {
          sessionId: null,
          previousSessionId: sessionId,
          timestamp: Date.now()
        };
        this.emit('session:changed', event);
      }
    }

    const event: SessionRemovedEvent = {
      sessionId,
      timestamp: Date.now()
    };
    this.emit('session:removed', event);
  }

  /**
   * Switch to the next session in order
   */
  nextSession(): void {
    if (this.sessionOrder.length === 0) {
      return;
    }

    const currentIndex = this.activeSessionId
      ? this.sessionOrder.indexOf(this.activeSessionId)
      : -1;

    const nextIndex = (currentIndex + 1) % this.sessionOrder.length;
    this.setActiveSession(this.sessionOrder[nextIndex]);
  }

  /**
   * Switch to the previous session in order
   */
  previousSession(): void {
    if (this.sessionOrder.length === 0) {
      return;
    }

    const currentIndex = this.activeSessionId
      ? this.sessionOrder.indexOf(this.activeSessionId)
      : -1;

    const prevIndex = currentIndex <= 0
      ? this.sessionOrder.length - 1
      : currentIndex - 1;

    this.setActiveSession(this.sessionOrder[prevIndex]);
  }

  /**
   * Get the current active session
   * @returns Active session info or null if no active session
   */
  getActiveSession(): SessionInfo | null {
    if (!this.activeSessionId) {
      return null;
    }
    return this.sessions.get(this.activeSessionId) ?? null;
  }

  /**
   * Set a session as active
   * @param sessionId - Session ID to activate
   */
  setActiveSession(sessionId: string): void {
    if (!this.sessions.has(sessionId)) {
      throw new Error(`Session with id "${sessionId}" does not exist`);
    }

    const previousId = this.activeSessionId;

    // Only emit if actually changing
    if (previousId !== sessionId) {
      this.activeSessionId = sessionId;

      const event: SessionChangeEvent = {
        sessionId,
        previousSessionId: previousId,
        timestamp: Date.now()
      };
      this.emit('session:changed', event);
    }
  }

  /**
   * Get a session by ID
   * @param sessionId - Session ID
   * @returns Session info or null if not found
   */
  getSession(sessionId: string): SessionInfo | null {
    return this.sessions.get(sessionId) ?? null;
  }

  /**
   * Get all sessions
   * @returns Array of all sessions in order
   */
  getAllSessions(): SessionInfo[] {
    return this.sessionOrder
      .map(id => this.sessions.get(id))
      .filter((session): session is SessionInfo => session !== undefined);
  }

  /**
   * Get the number of active sessions
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Check if a session exists
   * @param sessionId - Session ID to check
   */
  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /**
   * Clear all sessions
   */
  clear(): void {
    this.sessions.clear();
    this.sessionOrder = [];
    const previousId = this.activeSessionId;
    this.activeSessionId = null;

    if (previousId !== null) {
      const event: SessionChangeEvent = {
        sessionId: null,
        previousSessionId: previousId,
        timestamp: Date.now()
      };
      this.emit('session:changed', event);
    }
  }
}
