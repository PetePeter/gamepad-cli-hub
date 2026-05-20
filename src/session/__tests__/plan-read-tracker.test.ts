import { describe, it, expect, beforeEach } from 'vitest';
import { PlanReadTracker } from '../plan-read-tracker';

describe('PlanReadTracker', () => {
  let tracker: PlanReadTracker;

  beforeEach(() => {
    tracker = new PlanReadTracker();
  });

  it('recordRead + getRead round-trips correctly', () => {
    tracker.recordRead('plan-1', 'session-a', 42);
    const record = tracker.getRead('plan-1', 'session-a');
    expect(record).toBeDefined();
    expect(record!.planId).toBe('plan-1');
    expect(record!.sessionId).toBe('session-a');
    expect(record!.ptyWriteCount).toBe(42);
    expect(record!.readAt).toBeGreaterThan(0);
  });

  it('getRead returns undefined for unknown plan/session', () => {
    expect(tracker.getRead('no-plan', 'no-session')).toBeUndefined();
  });

  it('isStale returns false when only time exceeded (writes below threshold)', () => {
    const record = { planId: 'p', sessionId: 's', readAt: 0, ptyWriteCount: 0 };
    const now = 11 * 60 * 1000; // 11 min later
    const currentWriteCount = 10; // only 10 writes (below 50 threshold)
    expect(tracker.isStale(record, currentWriteCount, now)).toBe(false);
  });

  it('isStale returns false when only writes exceeded (time below threshold)', () => {
    const now = Date.now();
    const record = { planId: 'p', sessionId: 's', readAt: now - 1_000, ptyWriteCount: 0 };
    const currentWriteCount = 100; // 100 writes (above 50)
    expect(tracker.isStale(record, currentWriteCount, now)).toBe(false);
  });

  it('isStale returns true when BOTH time and writes exceeded', () => {
    const record = { planId: 'p', sessionId: 's', readAt: 0, ptyWriteCount: 0 };
    const now = 11 * 60 * 1000; // 11 min later
    const currentWriteCount = 60; // 60 writes (above 50)
    expect(tracker.isStale(record, currentWriteCount, now)).toBe(true);
  });

  it('clear(sessionId) removes all records for that session, leaves others', () => {
    tracker.recordRead('plan-1', 'session-a', 0);
    tracker.recordRead('plan-2', 'session-a', 0);
    tracker.recordRead('plan-1', 'session-b', 0);

    tracker.clear('session-a');

    expect(tracker.getRead('plan-1', 'session-a')).toBeUndefined();
    expect(tracker.getRead('plan-2', 'session-a')).toBeUndefined();
    // session-b record must survive
    expect(tracker.getRead('plan-1', 'session-b')).toBeDefined();
  });

  it('recordRead overwrites existing record for same plan+session', () => {
    tracker.recordRead('plan-1', 'session-a', 10);
    tracker.recordRead('plan-1', 'session-a', 99);
    const record = tracker.getRead('plan-1', 'session-a');
    expect(record!.ptyWriteCount).toBe(99);
  });
});
