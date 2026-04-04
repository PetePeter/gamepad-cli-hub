import { EventEmitter } from 'events';
import type { SessionState, ActivityLevel } from '../types/session.js';

export interface StateTransition {
  sessionId: string;
  previousState: SessionState;
  newState: SessionState;
}

export interface QuestionDetected {
  sessionId: string;
}

export interface QuestionCleared {
  sessionId: string;
}

export interface ActivityChange {
  sessionId: string;
  level: ActivityLevel;
}

interface SessionTracking {
  state: SessionState;
  questionPending: boolean;
  lastOutputAt: number;
  activityLevel: ActivityLevel;
}

/** Strip ANSI escape sequences so keyword detection works on raw PTY output. */
function stripAnsi(text: string): string {
  return text
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')              // CSI sequences
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')   // Complete OSC sequences
    .replace(/\x1b\][^\x07\x1b]*/g, '');                  // Incomplete OSC (strip prefix)
}

/**
 * Keyword → state mapping.
 * AIAGENT-QUESTION is handled separately (sets a flag, not a state).
 */
const KEYWORD_STATE_MAP: Record<string, SessionState> = {
  'AIAGENT-IMPLEMENTING': 'implementing',
  'AIAGENT-PLANNING': 'planning',
  'AIAGENT-COMPLETED': 'completed',
  'AIAGENT-IDLE': 'idle',
};

const STATE_KEYWORDS = Object.keys(KEYWORD_STATE_MAP);
const QUESTION_KEYWORD = 'AIAGENT-QUESTION';

/** Default timeout before considering a session inactive (no output for 10s) */
export const DEFAULT_INACTIVE_TIMEOUT_MS = 10_000;

/** Default timeout before considering a session idle (no output for 5 minutes) */
export const DEFAULT_IDLE_TIMEOUT_MS = 300_000;

export interface ActivityTimeouts {
  inactiveMs: number;
  idleMs: number;
}

/**
 * Detects session state from PTY output by scanning for AIAGENT-* keywords.
 *
 * Events:
 * - 'state-change'      (StateTransition)  — keyword triggered a state change
 * - 'question-detected'  (QuestionDetected) — AIAGENT-QUESTION found
 * - 'question-cleared'   (QuestionCleared)  — new output arrived after question
 * - 'activity-change'   (ActivityChange)   — session activity level changed
 *
 * Activity detection uses per-session debounced timeouts:
 * - On output: level → 'active', reset both timers
 * - After inactiveMs (10s default): level → 'inactive'
 * - After idleMs (5min default): level → 'idle'
 */
export class StateDetector extends EventEmitter {
  private sessionStates: Map<string, SessionTracking> = new Map();
  private inactiveTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private idleTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private readonly inactiveTimeoutMs: number;
  private readonly idleTimeoutMs: number;

  constructor(timeouts?: Partial<ActivityTimeouts>) {
    super();
    this.inactiveTimeoutMs = timeouts?.inactiveMs ?? DEFAULT_INACTIVE_TIMEOUT_MS;
    this.idleTimeoutMs = timeouts?.idleMs ?? DEFAULT_IDLE_TIMEOUT_MS;
  }

  /** Feed output data from a session's PTY. */
  processOutput(sessionId: string, data: string): void {
    const tracking = this.getOrCreate(sessionId);
    tracking.lastOutputAt = Date.now();

    // Emit activity-change if transitioning to active
    if (tracking.activityLevel !== 'active') {
      tracking.activityLevel = 'active';
      this.emit('activity-change', { sessionId, level: 'active' } satisfies ActivityChange);
    }

    // Reset both inactivity timers
    this.resetActivityTimers(sessionId);

    const clean = stripAnsi(data);

    // Collect all keyword occurrences with their position so we process in order.
    const hits: Array<{ index: number; keyword: string }> = [];

    for (const kw of STATE_KEYWORDS) {
      let pos = 0;
      while ((pos = clean.indexOf(kw, pos)) !== -1) {
        hits.push({ index: pos, keyword: kw });
        pos += kw.length;
      }
    }

    // Check for question keyword occurrences
    let hasQuestion = false;
    {
      let pos = 0;
      while ((pos = clean.indexOf(QUESTION_KEYWORD, pos)) !== -1) {
        hits.push({ index: pos, keyword: QUESTION_KEYWORD });
        hasQuestion = true;
        pos += QUESTION_KEYWORD.length;
      }
    }

    // Sort by position so we honour the order keywords appear in the chunk.
    hits.sort((a, b) => a.index - b.index);

    // If there are no keywords at all but question was pending, clear it.
    if (hits.length === 0 && tracking.questionPending) {
      tracking.questionPending = false;
      this.emit('question-cleared', { sessionId } satisfies QuestionCleared);
      return;
    }

    // Clear question-pending on non-question output if no new question in this chunk.
    if (tracking.questionPending && !hasQuestion) {
      tracking.questionPending = false;
      this.emit('question-cleared', { sessionId } satisfies QuestionCleared);
    }

    for (const hit of hits) {
      if (hit.keyword === QUESTION_KEYWORD) {
        if (!tracking.questionPending) {
          tracking.questionPending = true;
          this.emit('question-detected', { sessionId } satisfies QuestionDetected);
        }
      } else {
        const newState = KEYWORD_STATE_MAP[hit.keyword];
        if (newState && newState !== tracking.state) {
          const previousState = tracking.state;
          tracking.state = newState;
          this.emit('state-change', {
            sessionId,
            previousState,
            newState,
          } satisfies StateTransition);
        }
      }
    }
  }

  /** Get current detected state for a session. */
  getState(sessionId: string): SessionState {
    return this.sessionStates.get(sessionId)?.state ?? 'idle';
  }

  /** Check if a session has a pending question. */
  hasQuestion(sessionId: string): boolean {
    return this.sessionStates.get(sessionId)?.questionPending ?? false;
  }

  /** Remove tracking for a session. */
  removeSession(sessionId: string): void {
    this.clearActivityTimers(sessionId);
    this.sessionStates.delete(sessionId);
  }

  /** Clean up all timers (call on shutdown). */
  dispose(): void {
    for (const timer of this.inactiveTimers.values()) clearTimeout(timer);
    for (const timer of this.idleTimers.values()) clearTimeout(timer);
    this.inactiveTimers.clear();
    this.idleTimers.clear();
    this.sessionStates.clear();
  }

  // ---------- Activity tracking ------------------------------------------

  /** Get the timestamp of the last output for a session. Returns 0 for unknown sessions. */
  getLastOutputTime(sessionId: string): number {
    return this.sessionStates.get(sessionId)?.lastOutputAt ?? 0;
  }

  /** Reset (or start) both activity timers for a session. */
  private resetActivityTimers(sessionId: string): void {
    this.clearActivityTimers(sessionId);

    // Timer 1: inactive after inactiveTimeoutMs of silence
    const inactiveTimer = setTimeout(() => {
      this.inactiveTimers.delete(sessionId);
      const tracking = this.sessionStates.get(sessionId);
      if (tracking && tracking.activityLevel === 'active') {
        tracking.activityLevel = 'inactive';
        this.emit('activity-change', { sessionId, level: 'inactive' } satisfies ActivityChange);
      }
    }, this.inactiveTimeoutMs);
    this.inactiveTimers.set(sessionId, inactiveTimer);

    // Timer 2: idle after idleTimeoutMs of silence
    const idleTimer = setTimeout(() => {
      this.idleTimers.delete(sessionId);
      const tracking = this.sessionStates.get(sessionId);
      if (tracking && tracking.activityLevel !== 'idle') {
        tracking.activityLevel = 'idle';
        this.emit('activity-change', { sessionId, level: 'idle' } satisfies ActivityChange);
      }
    }, this.idleTimeoutMs);
    this.idleTimers.set(sessionId, idleTimer);
  }

  /** Clear both activity timers for a session. */
  private clearActivityTimers(sessionId: string): void {
    const inactiveTimer = this.inactiveTimers.get(sessionId);
    if (inactiveTimer) {
      clearTimeout(inactiveTimer);
      this.inactiveTimers.delete(sessionId);
    }
    const idleTimer = this.idleTimers.get(sessionId);
    if (idleTimer) {
      clearTimeout(idleTimer);
      this.idleTimers.delete(sessionId);
    }
  }

  private getOrCreate(sessionId: string): SessionTracking {
    let tracking = this.sessionStates.get(sessionId);
    if (!tracking) {
      tracking = { state: 'idle', questionPending: false, lastOutputAt: 0, activityLevel: 'idle' };
      this.sessionStates.set(sessionId, tracking);
    }
    return tracking;
  }
}
