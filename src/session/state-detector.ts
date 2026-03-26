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
const DEFAULT_ACTIVITY_TIMEOUT_MS = 30000;

/**
 * Detects session state from PTY output by scanning for AIAGENT-* keywords.
 *
 * Events:
 * - 'state-change'      (StateTransition)  — keyword triggered a state change
 * - 'question-detected'  (QuestionDetected) — AIAGENT-QUESTION found
 * - 'question-cleared'   (QuestionCleared)  — new output arrived after question
 * - 'activity-change'   (ActivityChange)   — session transitioned active↔inactive
 */
export class StateDetector extends EventEmitter {
  private sessionStates: Map<string, SessionTracking> = new Map();

  /** Feed output data from a session's PTY. */
  processOutput(sessionId: string, data: string): void {
    const tracking = this.getOrCreate(sessionId);
    const now = Date.now();
    const wasActive = tracking.lastOutputAt > 0 && (now - tracking.lastOutputAt) < 30000;
    tracking.lastOutputAt = now;
    const isNowActive = true;

    // Emit activity-change if transitioning from inactive to active
    if (!wasActive && isNowActive) {
      tracking.lastKnownActivity = true;
      this.emit('activity-change', { sessionId, isActive: true } satisfies ActivityChange);
    }

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
    this.sessionStates.delete(sessionId);
  }

  // ---------- Activity tracking ------------------------------------------

  /** Get the timestamp of the last output for a session. Returns 0 for unknown sessions. */
  getLastOutputTime(sessionId: string): number {
    return this.sessionStates.get(sessionId)?.lastOutputAt ?? 0;
  }

  /** Check if a session is currently active (output within timeoutMs). */
  isSessionActive(sessionId: string, timeoutMs: number): boolean {
    const lastOutput = this.getLastOutputTime(sessionId);
    if (lastOutput === 0) return false;
    return (Date.now() - lastOutput) < timeoutMs;
  }

  /** Check activity for a single session and emit event if state changed. */
  checkActivity(sessionId: string, timeoutMs: number): void {
    const tracking = this.sessionStates.get(sessionId);
    if (!tracking) return;

    const isActive = this.isSessionActive(sessionId, timeoutMs);
    if (isActive !== tracking.lastKnownActivity) {
      tracking.lastKnownActivity = isActive;
      this.emit('activity-change', { sessionId, isActive } satisfies ActivityChange);
    }
  }

  /** Check activity for all tracked sessions. */
  checkAllActivities(timeoutMs: number): void {
    for (const [sessionId] of this.sessionStates) {
      this.checkActivity(sessionId, timeoutMs);
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
