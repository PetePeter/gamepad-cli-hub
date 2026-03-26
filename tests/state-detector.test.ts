import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StateDetector } from '../src/session/state-detector';
import type { StateTransition, QuestionDetected, QuestionCleared, ActivityChange } from '../src/session/state-detector';

describe('StateDetector', () => {
  let detector: StateDetector;

  beforeEach(() => {
    detector = new StateDetector();
  });

  describe('initial state', () => {
    it('returns idle for unknown session', () => {
      expect(detector.getState('unknown')).toBe('idle');
    });

    it('returns false for hasQuestion on unknown session', () => {
      expect(detector.hasQuestion('unknown')).toBe(false);
    });
  });

  describe('state transitions', () => {
    it('detects AIAGENT-IMPLEMENTING', () => {
      const handler = vi.fn();
      detector.on('state-change', handler);

      detector.processOutput('s1', 'some output AIAGENT-IMPLEMENTING more output');

      expect(detector.getState('s1')).toBe('implementing');
      expect(handler).toHaveBeenCalledWith({
        sessionId: 's1',
        previousState: 'idle',
        newState: 'implementing',
      } satisfies StateTransition);
    });

    it('detects AIAGENT-PLANNING', () => {
      detector.processOutput('s1', 'AIAGENT-PLANNING');
      expect(detector.getState('s1')).toBe('planning');
    });

    it('detects AIAGENT-IDLE', () => {
      detector.processOutput('s1', 'AIAGENT-IMPLEMENTING');
      detector.processOutput('s1', 'AIAGENT-IDLE');
      expect(detector.getState('s1')).toBe('idle');
    });

    it('does not emit state-change when state is the same', () => {
      const handler = vi.fn();
      detector.processOutput('s1', 'AIAGENT-IMPLEMENTING');
      detector.on('state-change', handler);

      detector.processOutput('s1', 'AIAGENT-IMPLEMENTING');

      expect(handler).not.toHaveBeenCalled();
      expect(detector.getState('s1')).toBe('implementing');
    });

    it('processes multiple keywords in order within one chunk', () => {
      const states: string[] = [];
      detector.on('state-change', (t: StateTransition) => states.push(t.newState));

      detector.processOutput('s1', 'AIAGENT-IMPLEMENTING then AIAGENT-PLANNING then AIAGENT-IDLE');

      expect(states).toEqual(['implementing', 'planning', 'idle']);
      expect(detector.getState('s1')).toBe('idle');
    });
  });

  describe('ANSI stripping', () => {
    it('detects keywords wrapped in ANSI escape codes', () => {
      detector.processOutput('s1', '\x1b[32mAIAGENT-IMPLEMENTING\x1b[0m');
      expect(detector.getState('s1')).toBe('implementing');
    });

    it('detects keywords with ANSI codes interspersed', () => {
      detector.processOutput('s1', '\x1b[1;34mAIAGENT-PLANNING\x1b[0m done');
      expect(detector.getState('s1')).toBe('planning');
    });
  });

  describe('question detection', () => {
    it('sets questionPending on AIAGENT-QUESTION', () => {
      const handler = vi.fn();
      detector.on('question-detected', handler);

      detector.processOutput('s1', 'AIAGENT-QUESTION');

      expect(detector.hasQuestion('s1')).toBe(true);
      expect(handler).toHaveBeenCalledWith({ sessionId: 's1' } satisfies QuestionDetected);
    });

    it('AIAGENT-QUESTION does NOT change state', () => {
      detector.processOutput('s1', 'AIAGENT-IMPLEMENTING');
      detector.processOutput('s1', 'AIAGENT-QUESTION');

      expect(detector.getState('s1')).toBe('implementing');
      expect(detector.hasQuestion('s1')).toBe(true);
    });

    it('clears questionPending when non-question output arrives', () => {
      const clearedHandler = vi.fn();
      detector.on('question-cleared', clearedHandler);

      detector.processOutput('s1', 'AIAGENT-QUESTION');
      expect(detector.hasQuestion('s1')).toBe(true);

      detector.processOutput('s1', 'normal output without keywords');

      expect(detector.hasQuestion('s1')).toBe(false);
      expect(clearedHandler).toHaveBeenCalledWith({ sessionId: 's1' } satisfies QuestionCleared);
    });

    it('does not clear questionPending if AIAGENT-QUESTION appears again', () => {
      const clearedHandler = vi.fn();
      detector.on('question-cleared', clearedHandler);

      detector.processOutput('s1', 'AIAGENT-QUESTION');
      detector.processOutput('s1', 'AIAGENT-QUESTION');

      expect(detector.hasQuestion('s1')).toBe(true);
      expect(clearedHandler).not.toHaveBeenCalled();
    });

    it('handles question + state change in same chunk', () => {
      detector.processOutput('s1', 'AIAGENT-QUESTION then AIAGENT-IMPLEMENTING');

      expect(detector.hasQuestion('s1')).toBe(true);
      expect(detector.getState('s1')).toBe('implementing');
    });
  });

  describe('session isolation', () => {
    it('tracks state independently per session', () => {
      detector.processOutput('s1', 'AIAGENT-IMPLEMENTING');
      detector.processOutput('s2', 'AIAGENT-PLANNING');

      expect(detector.getState('s1')).toBe('implementing');
      expect(detector.getState('s2')).toBe('planning');
    });

    it('tracks questions independently per session', () => {
      detector.processOutput('s1', 'AIAGENT-QUESTION');
      detector.processOutput('s2', 'normal output');

      expect(detector.hasQuestion('s1')).toBe(true);
      expect(detector.hasQuestion('s2')).toBe(false);
    });
  });

  describe('removeSession', () => {
    it('resets state to idle after removal', () => {
      detector.processOutput('s1', 'AIAGENT-IMPLEMENTING');
      detector.removeSession('s1');

      expect(detector.getState('s1')).toBe('idle');
      expect(detector.hasQuestion('s1')).toBe(false);
    });

    it('does not throw for unknown session', () => {
      expect(() => detector.removeSession('nonexistent')).not.toThrow();
    });
  });

  describe('activity tracking', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('processOutput updates lastOutputAt timestamp', () => {
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      detector.processOutput('s1', 'some output');

      expect(detector.getLastOutputTime('s1')).toBe(startTime);
    });

    it('isSessionActive returns true when output within timeout', () => {
      const timeout = 30000;
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      detector.processOutput('s1', 'output');
      expect(detector.isSessionActive('s1', timeout)).toBe(true);

      // 29 seconds later - still active
      vi.setSystemTime(startTime + 29000);
      expect(detector.isSessionActive('s1', timeout)).toBe(true);
    });

    it('isSessionActive returns false when output exceeds timeout', () => {
      const timeout = 30000;
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      detector.processOutput('s1', 'output');
      expect(detector.isSessionActive('s1', timeout)).toBe(true);

      // 31 seconds later - inactive
      vi.setSystemTime(startTime + 31000);
      expect(detector.isSessionActive('s1', timeout)).toBe(false);
    });

    it('emits activity-change event when session transitions active→inactive', () => {
      const timeout = 30000;
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      const handler = vi.fn();
      detector.on('activity-change', handler);

      detector.processOutput('s1', 'output'); // becomes active

      // Move past timeout
      vi.setSystemTime(startTime + 31000);
      detector.checkActivity('s1', timeout); // trigger check

      expect(handler).toHaveBeenCalledWith({
        sessionId: 's1',
        isActive: false,
      } satisfies ActivityChange);
    });

    it('emits activity-change event when session transitions inactive→active', () => {
      const timeout = 30000;
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      // Session is inactive (no output yet)
      vi.setSystemTime(startTime + 31000);

      const handler = vi.fn();
      detector.on('activity-change', handler);

      // New output makes it active again
      detector.processOutput('s1', 'new output');

      expect(handler).toHaveBeenCalledWith({
        sessionId: 's1',
        isActive: true,
      } satisfies ActivityChange);
    });

    it('does not emit activity-change when state remains the same', () => {
      const timeout = 30000;
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      detector.processOutput('s1', 'output');

      const handler = vi.fn();
      detector.on('activity-change', handler);

      // Still active - no change
      vi.setSystemTime(startTime + 10000);
      detector.checkActivity('s1', timeout);

      expect(handler).not.toHaveBeenCalled();
    });

    it('tracks multiple sessions independently', () => {
      const timeout = 30000;
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      detector.processOutput('s1', 'output1');
      vi.setSystemTime(startTime + 20000);
      detector.processOutput('s2', 'output2');

      // s1 is inactive, s2 is active
      vi.setSystemTime(startTime + 35000);
      expect(detector.isSessionActive('s1', timeout)).toBe(false);
      expect(detector.isSessionActive('s2', timeout)).toBe(true);
    });

    it('getLastOutputTime returns 0 for unknown session', () => {
      expect(detector.getLastOutputTime('unknown')).toBe(0);
    });

    it('isSessionActive returns false for unknown session', () => {
      expect(detector.isSessionActive('unknown', 30000)).toBe(false);
    });

    it('removeSession clears activity tracking', () => {
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      detector.processOutput('s1', 'output');
      expect(detector.getLastOutputTime('s1')).toBe(startTime);

      detector.removeSession('s1');
      expect(detector.getLastOutputTime('s1')).toBe(0);
    });

    it('checkAllActivities emits changes for all tracked sessions', () => {
      const timeout = 30000;
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      detector.processOutput('s1', 'output1');
      detector.processOutput('s2', 'output2');

      const handler = vi.fn();
      detector.on('activity-change', handler);

      // Both sessions go inactive
      vi.setSystemTime(startTime + 31000);
      detector.checkAllActivities(timeout);

      expect(handler).toHaveBeenCalledTimes(2);
      expect(handler).toHaveBeenCalledWith({
        sessionId: 's1',
        isActive: false,
      } satisfies ActivityChange);
      expect(handler).toHaveBeenCalledWith({
        sessionId: 's2',
        isActive: false,
      } satisfies ActivityChange);
    });
  });
});
