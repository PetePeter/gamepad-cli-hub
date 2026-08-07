import { describe, it, expect } from 'vitest';

import { resolveSuccessorSessionId } from '../renderer/terminal/successor-pick';

/**
 * The visible order argument mirrors getTabCycleSessionIds() — navList order with
 * collapsed-group, hidden, and snapped-out sessions already filtered out. At the
 * moment a session closes the list still contains the closing session, because
 * navList is only rebuilt by the refreshSessions() that follows.
 */
describe('resolveSuccessorSessionId', () => {
  it('picks the next visible session after the closed one', () => {
    const next = resolveSuccessorSessionId(['a', 'b', 'c'], ['a', 'c'], 'b');
    expect(next).toBe('c');
  });

  it('wraps to the first visible session when the closed one was last', () => {
    const next = resolveSuccessorSessionId(['a', 'b', 'c'], ['a', 'b'], 'c');
    expect(next).toBe('a');
  });

  it('skips ordered ids that have no live terminal', () => {
    // 'b' is listed but its terminal is gone (e.g. still settling after a close)
    const next = resolveSuccessorSessionId(['a', 'b', 'c'], ['a', 'c'], 'a');
    expect(next).toBe('c');
  });

  it('never picks a session in a collapsed group — absent from the visible order', () => {
    // 'hidden-1' has a live terminal but is not in the visible order
    const next = resolveSuccessorSessionId(['a', 'b'], ['a', 'hidden-1'], 'b');
    expect(next).toBe('a');
  });

  it('returns null when no visible session survives', () => {
    const next = resolveSuccessorSessionId(['a'], ['hidden-1', 'hidden-2'], 'a');
    expect(next).toBeNull();
  });

  it('returns the first visible session when the closed id is not in the order', () => {
    // Closed session was itself hidden/snapped-out, so it never appeared in navList
    const next = resolveSuccessorSessionId(['a', 'b'], ['a', 'b'], 'snapped-out');
    expect(next).toBe('a');
  });

  it('returns null for an empty visible order', () => {
    expect(resolveSuccessorSessionId([], ['a'], 'a')).toBeNull();
  });
});
