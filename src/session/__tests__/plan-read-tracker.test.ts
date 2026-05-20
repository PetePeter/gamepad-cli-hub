import { describe, it, expect, beforeEach } from 'vitest';
import { PlanReadTracker } from '../plan-read-tracker';

describe('PlanReadTracker', () => {
  let tracker: PlanReadTracker;

  beforeEach(() => {
    tracker = new PlanReadTracker();
  });

  it('recordRead + getRead round-trips correctly', () => {
    tracker.recordRead('plan-1', 'session-a');
    const record = tracker.getRead('plan-1', 'session-a');
    expect(record).toBeDefined();
    expect(record!.planId).toBe('plan-1');
    expect(record!.sessionId).toBe('session-a');
    expect(record!.readAt).toBeGreaterThan(0);
  });

  it('getRead returns undefined for unknown plan/session', () => {
    expect(tracker.getRead('no-plan', 'no-session')).toBeUndefined();
  });

  it('isStale returns false when read within 3 minutes', () => {
    const now = Date.now();
    const record = { planId: 'p', sessionId: 's', readAt: now - 60_000 }; // 1 min ago
    expect(tracker.isStale(record, now)).toBe(false);
  });

  it('isStale returns true when read more than 3 minutes ago', () => {
    const record = { planId: 'p', sessionId: 's', readAt: 0 };
    const now = 4 * 60 * 1000; // 4 min later
    expect(tracker.isStale(record, now)).toBe(true);
  });

  it('clear(sessionId) removes all records for that session, leaves others', () => {
    tracker.recordRead('plan-1', 'session-a');
    tracker.recordRead('plan-2', 'session-a');
    tracker.recordRead('plan-1', 'session-b');

    tracker.clear('session-a');

    expect(tracker.getRead('plan-1', 'session-a')).toBeUndefined();
    expect(tracker.getRead('plan-2', 'session-a')).toBeUndefined();
    expect(tracker.getRead('plan-1', 'session-b')).toBeDefined();
  });

  it('recordRead overwrites existing record for same plan+session', () => {
    tracker.recordRead('plan-1', 'session-a');
    const first = tracker.getRead('plan-1', 'session-a')!.readAt;
    tracker.recordRead('plan-1', 'session-a');
    const second = tracker.getRead('plan-1', 'session-a')!.readAt;
    expect(second).toBeGreaterThanOrEqual(first);
  });
});
