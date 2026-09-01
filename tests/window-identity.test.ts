/**
 * Window identity parsing — the single authority for "which window am I?".
 *
 * Every window-scoped registry (plan-screen callbacks today, dock profiles next)
 * keys off this, so a half-formed identity would silently split state between
 * two keys that should be one.
 *
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import {
  currentWindowIdentity,
  parseWindowIdentity,
  windowIdentityKey,
} from '../renderer/window-identity.js';

function setSearch(search: string): void {
  Object.defineProperty(window, 'location', { value: { search }, writable: true });
}

describe('parseWindowIdentity', () => {
  it('treats an empty query as the main window', () => {
    expect(parseWindowIdentity('')).toEqual({ kind: 'main' });
    expect(parseWindowIdentity('?')).toEqual({ kind: 'main' });
    expect(parseWindowIdentity('?foo=bar')).toEqual({ kind: 'main' });
  });

  it('reads a session snap-out identity', () => {
    expect(parseWindowIdentity('?snapOut=1&sessionId=X')).toEqual({ kind: 'session', sessionId: 'X' });
  });

  it('reads a planner pop-out identity', () => {
    expect(parseWindowIdentity('?plannerPopOut=1&dirPath=D')).toEqual({ kind: 'planner', dirPath: 'D' });
  });

  it('accepts a query string without the leading question mark', () => {
    expect(parseWindowIdentity('snapOut=1&sessionId=X')).toEqual({ kind: 'session', sessionId: 'X' });
  });

  // A pop-out with no target is not a pop-out: keying state on `planner:` with an
  // empty path would collide with every other pathless planner window.
  it('falls back to main when the identifying parameter is missing or blank', () => {
    expect(parseWindowIdentity('?snapOut=1')).toEqual({ kind: 'main' });
    expect(parseWindowIdentity('?snapOut=1&sessionId=')).toEqual({ kind: 'main' });
    expect(parseWindowIdentity('?snapOut=1&sessionId=%20%20')).toEqual({ kind: 'main' });
    expect(parseWindowIdentity('?plannerPopOut=1')).toEqual({ kind: 'main' });
    expect(parseWindowIdentity('?plannerPopOut=1&dirPath=')).toEqual({ kind: 'main' });
  });

  it('ignores a flag that is present but not "1"', () => {
    expect(parseWindowIdentity('?snapOut=0&sessionId=X')).toEqual({ kind: 'main' });
    expect(parseWindowIdentity('?plannerPopOut=yes&dirPath=D')).toEqual({ kind: 'main' });
  });

  // Both flags on one URL is malformed; the snap-out wins deterministically so
  // two windows can never disagree about the same URL.
  it('prefers the session identity when both flags are present', () => {
    expect(parseWindowIdentity('?snapOut=1&sessionId=X&plannerPopOut=1&dirPath=D'))
      .toEqual({ kind: 'session', sessionId: 'X' });
  });
});

describe('windowIdentityKey', () => {
  it('formats one stable key per identity', () => {
    expect(windowIdentityKey({ kind: 'main' })).toBe('main');
    expect(windowIdentityKey({ kind: 'planner', dirPath: 'X:\\code' })).toBe('planner:X:\\code');
    expect(windowIdentityKey({ kind: 'session', sessionId: 'abc' })).toBe('session:abc');
  });

  it('gives distinct keys to distinct targets of the same kind', () => {
    expect(windowIdentityKey({ kind: 'session', sessionId: 'a' }))
      .not.toBe(windowIdentityKey({ kind: 'session', sessionId: 'b' }));
  });
});

describe('currentWindowIdentity', () => {
  it('reads the live location', () => {
    setSearch('?plannerPopOut=1&dirPath=/test/dir');
    expect(currentWindowIdentity()).toEqual({ kind: 'planner', dirPath: '/test/dir' });
    setSearch('');
    expect(currentWindowIdentity()).toEqual({ kind: 'main' });
  });
});
