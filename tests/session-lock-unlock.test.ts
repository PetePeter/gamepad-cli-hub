/**
 * Unlocking a session — both routes were broken.
 *
 * 1. MCP: `session_set_locked` validated its `locked` argument with
 *    requireBooleanResult, an assertion helper that THROWS on a falsy value
 *    and always returns true. `locked: false` therefore raised "locked is
 *    required" and unlocking was impossible; `locked: true` was the only
 *    accepted input. (The pre-existing tsc error on that line was this bug.)
 *
 * 2. UI: refreshSessions rebuilds each renderer Session from an explicit field
 *    list that omitted `locked`, so the card fell back to 🔓 on every refresh
 *    and its click always asked to LOCK — never to unlock.
 */

import { describe, it, expect } from 'vitest';
import { asBoolean } from '../src/mcp/tools/validation.js';

describe('asBoolean', () => {
  it('accepts false — the whole point, since false is what unlocks', () => {
    expect(asBoolean(false, 'locked is required')).toBe(false);
  });

  it('accepts true', () => {
    expect(asBoolean(true, 'locked is required')).toBe(true);
  });

  it('rejects a missing value', () => {
    expect(() => asBoolean(undefined, 'locked is required')).toThrow('locked is required');
  });

  it('rejects a non-boolean rather than coercing it', () => {
    expect(() => asBoolean('false', 'locked is required')).toThrow('locked is required');
    expect(() => asBoolean(0, 'locked is required')).toThrow('locked is required');
  });
});
