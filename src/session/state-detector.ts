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

interface SessionTracking {
  state: SessionState;
  questionPending: boolean;
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

/**
 * Detects session state from PTY output by scanning for AIAGENT-* keywords.
 *
 * Events:
 * - 'state-change'      (StateTransition)  — keyword triggered a state change
 * - 'question-detected'  (QuestionDetected) — AIAGENT-QUESTION found
 * - 'question-cleared'   (QuestionCleared)  — new output arrived after question
 */
export class StateDetector extends EventEmitter {
  private sessionStates: Map<string, SessionTracking> = new Map();

  /** Feed output data from a session's PTY. */
  processOutput(sessionId: string, data: string): void {
    const clean = stripAnsi(data);
    const tracking = this.getOrCreate(sessionId);

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

  private getOrCreate(sessionId: string): SessionTracking {
    let tracking = this.sessionStates.get(sessionId);
    if (!tracking) {
      tracking = { state: 'idle', questionPending: false };
      this.sessionStates.set(sessionId, tracking);
    }
    return tracking;
  }
}
