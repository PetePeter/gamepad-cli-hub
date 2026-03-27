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
      detector.dispose();
      vi.useRealTimers();
    });

    it('processOutput updates lastOutputAt timestamp', () => {
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      detector.processOutput('s1', 'some output');

      expect(detector.getLastOutputTime('s1')).toBe(startTime);
    });

    it('emits activity-change true on first output (inactive→active)', () => {
      const handler = vi.fn();
      detector.on('activity-change', handler);

      detector.processOutput('s1', 'output');

      expect(handler).toHaveBeenCalledWith({
        sessionId: 's1',
        isActive: true,
      } satisfies ActivityChange);
    });

    it('emits activity-change false after timeout expires (active→inactive)', () => {
      const handler = vi.fn();
      detector.on('activity-change', handler);

      detector.processOutput('s1', 'output');
      handler.mockClear();

      // Advance past the 30s default timeout
      vi.advanceTimersByTime(30_001);

      expect(handler).toHaveBeenCalledWith({
        sessionId: 's1',
        isActive: false,
      } satisfies ActivityChange);
    });

    it('does not emit inactive before timeout expires', () => {
      const handler = vi.fn();
      detector.on('activity-change', handler);

      detector.processOutput('s1', 'output');
      handler.mockClear();

      vi.advanceTimersByTime(29_000);

      expect(handler).not.toHaveBeenCalled();
    });

    it('resets timer on rapid output — only one inactive event after final silence', () => {
      const handler = vi.fn();
      detector.on('activity-change', handler);

      detector.processOutput('s1', 'output1');
      handler.mockClear();

      // Output every 10s — timer keeps resetting
      vi.advanceTimersByTime(10_000);
      detector.processOutput('s1', 'output2');

      vi.advanceTimersByTime(10_000);
      detector.processOutput('s1', 'output3');

      // No inactive events during rapid output
      expect(handler).not.toHaveBeenCalled();

      // Now go silent for 30s
      vi.advanceTimersByTime(30_001);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({
        sessionId: 's1',
        isActive: false,
      } satisfies ActivityChange);
    });

    it('re-emits active after inactive→active transition', () => {
      const handler = vi.fn();
      detector.on('activity-change', handler);

      detector.processOutput('s1', 'output1');
      handler.mockClear();

      // Go inactive
      vi.advanceTimersByTime(30_001);
      expect(handler).toHaveBeenCalledWith({ sessionId: 's1', isActive: false });
      handler.mockClear();

      // New output → active again
      detector.processOutput('s1', 'output2');
      expect(handler).toHaveBeenCalledWith({ sessionId: 's1', isActive: true });
    });

    it('does not emit duplicate active events for consecutive output', () => {
      const handler = vi.fn();
      detector.on('activity-change', handler);

      detector.processOutput('s1', 'output1');
      detector.processOutput('s1', 'output2');
      detector.processOutput('s1', 'output3');

      // Only one active event on the first output
      const activeCalls = handler.mock.calls.filter(
        ([e]: [ActivityChange]) => e.sessionId === 's1' && e.isActive === true,
      );
      expect(activeCalls.length).toBe(1);
    });

    it('tracks multiple sessions independently', () => {
      const handler = vi.fn();
      detector.on('activity-change', handler);

      detector.processOutput('s1', 'output1');
      vi.advanceTimersByTime(15_000);
      detector.processOutput('s2', 'output2');

      handler.mockClear();

      // s1 timeout fires at 30s from its last output (15s from now)
      vi.advanceTimersByTime(15_001);
      expect(handler).toHaveBeenCalledWith({ sessionId: 's1', isActive: false });
      expect(handler).not.toHaveBeenCalledWith(expect.objectContaining({ sessionId: 's2', isActive: false }));

      handler.mockClear();

      // s2 timeout fires at 30s from its last output (15s later)
      vi.advanceTimersByTime(15_000);
      expect(handler).toHaveBeenCalledWith({ sessionId: 's2', isActive: false });
    });

    it('removeSession clears the activity timer — no late events', () => {
      const handler = vi.fn();
      detector.on('activity-change', handler);

      detector.processOutput('s1', 'output');
      handler.mockClear();

      detector.removeSession('s1');

      // Timer should have been cleared — no inactive event
      vi.advanceTimersByTime(60_000);
      expect(handler).not.toHaveBeenCalled();
    });

    it('removeSession clears activity tracking data', () => {
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      detector.processOutput('s1', 'output');
      expect(detector.getLastOutputTime('s1')).toBe(startTime);

      detector.removeSession('s1');
      expect(detector.getLastOutputTime('s1')).toBe(0);
    });

    it('dispose clears all timers — no late events', () => {
      const handler = vi.fn();
      detector.on('activity-change', handler);

      detector.processOutput('s1', 'output1');
      detector.processOutput('s2', 'output2');
      handler.mockClear();

      detector.dispose();

      vi.advanceTimersByTime(60_000);
      expect(handler).not.toHaveBeenCalled();
    });

    it('getLastOutputTime returns 0 for unknown session', () => {
      expect(detector.getLastOutputTime('unknown')).toBe(0);
    });

    it('respects custom activityTimeoutMs via constructor', () => {
      const custom = new StateDetector(5000);
      const handler = vi.fn();
      custom.on('activity-change', handler);

      custom.processOutput('s1', 'output');
      handler.mockClear();

      // Not yet timed out at 4s
      vi.advanceTimersByTime(4_000);
      expect(handler).not.toHaveBeenCalled();

      // Times out at 5s
      vi.advanceTimersByTime(1_001);
      expect(handler).toHaveBeenCalledWith({ sessionId: 's1', isActive: false });

      custom.dispose();
    });
  });
});
