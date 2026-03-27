import { EventEmitter } from 'events';
import type { SessionState } from '../types/session.js';

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
  isActive: boolean;
}

interface SessionTracking {
  state: SessionState;
  questionPending: boolean;
  lastOutputAt: number;
  lastKnownActivity: boolean; // tracks last emitted activity state to avoid duplicate events
}

/** Strip ANSI escape sequences so keyword detection works on raw PTY output. */
function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

/**
 * Keyword → state mapping.
 * AIAGENT-QUESTION is handled separately (sets a flag, not a state).
 */
const KEYWORD_STATE_MAP: Record<string, SessionState> = {
  'AIAGENT-IMPLEMENTING': 'implementing',
  'AIAGENT-PLANNING': 'planning',
  'AIAGENT-IDLE': 'idle',
};

const STATE_KEYWORDS = Object.keys(KEYWORD_STATE_MAP);
const QUESTION_KEYWORD = 'AIAGENT-QUESTION';

/** Default activity timeout: 30 seconds of no output before considering a session inactive */
export const DEFAULT_ACTIVITY_TIMEOUT_MS = 30_000;

/**
 * Detects session state from PTY output by scanning for AIAGENT-* keywords.
 *
 * Events:
 * - 'state-change'      (StateTransition)  — keyword triggered a state change
 * - 'question-detected'  (QuestionDetected) — AIAGENT-QUESTION found
 * - 'question-cleared'   (QuestionCleared)  — new output arrived after question
 * - 'activity-change'   (ActivityChange)   — session transitioned active↔inactive
 *
 * Activity detection uses a per-session debounced timeout: each processOutput()
 * call resets a timer. When the timer fires (no output for activityTimeoutMs),
 * an activity-change event with isActive=false is emitted.
 */
export class StateDetector extends EventEmitter {
  private sessionStates: Map<string, SessionTracking> = new Map();
  private activityTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private readonly activityTimeoutMs: number;

  constructor(activityTimeoutMs: number = DEFAULT_ACTIVITY_TIMEOUT_MS) {
    super();
    this.activityTimeoutMs = activityTimeoutMs;
  }

  /** Feed output data from a session's PTY. */
  processOutput(sessionId: string, data: string): void {
    const tracking = this.getOrCreate(sessionId);
    tracking.lastOutputAt = Date.now();

    // Emit activity-change if transitioning from inactive to active
    if (!tracking.lastKnownActivity) {
      tracking.lastKnownActivity = true;
      this.emit('activity-change', { sessionId, isActive: true } satisfies ActivityChange);
    }

    // Reset the inactivity timer — fires after activityTimeoutMs of silence
    this.resetActivityTimer(sessionId);

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
    this.clearActivityTimer(sessionId);
    this.sessionStates.delete(sessionId);
  }

  /** Clean up all timers (call on shutdown). */
  dispose(): void {
    for (const timer of this.activityTimers.values()) {
      clearTimeout(timer);
    }
    this.activityTimers.clear();
    this.sessionStates.clear();
  }

  // ---------- Activity tracking ------------------------------------------

  /** Get the timestamp of the last output for a session. Returns 0 for unknown sessions. */
  getLastOutputTime(sessionId: string): number {
    return this.sessionStates.get(sessionId)?.lastOutputAt ?? 0;
  }

  /** Reset (or start) the inactivity timer for a session. */
  private resetActivityTimer(sessionId: string): void {
    this.clearActivityTimer(sessionId);
    const timer = setTimeout(() => {
      this.activityTimers.delete(sessionId);
      const tracking = this.sessionStates.get(sessionId);
      if (tracking && tracking.lastKnownActivity) {
        tracking.lastKnownActivity = false;
        this.emit('activity-change', { sessionId, isActive: false } satisfies ActivityChange);
      }
    }, this.activityTimeoutMs);
    this.activityTimers.set(sessionId, timer);
  }

  /** Clear the inactivity timer for a session. */
  private clearActivityTimer(sessionId: string): void {
    const existing = this.activityTimers.get(sessionId);
    if (existing) {
      clearTimeout(existing);
      this.activityTimers.delete(sessionId);
    }
  }

  private getOrCreate(sessionId: string): SessionTracking {
    let tracking = this.sessionStates.get(sessionId);
    if (!tracking) {
      tracking = { state: 'idle', questionPending: false, lastOutputAt: 0, lastKnownActivity: false };
      this.sessionStates.set(sessionId, tracking);
    }
    return tracking;
  }
}
