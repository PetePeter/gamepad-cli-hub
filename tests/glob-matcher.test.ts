/**
 * toolGlobMatch unit tests — pure function, `*` is the only wildcard,
 * full-string anchored, all other regex metacharacters are literal.
 */

import { describe, it, expect } from 'vitest';
import { toolGlobMatch } from '../src/utils/glob-matcher.js';

describe('toolGlobMatch', () => {
  it('G1 exact match: identical strings match, different strings do not', () => {
    expect(toolGlobMatch('artifact_get', 'artifact_get')).toBe(true);
    expect(toolGlobMatch('artifact_get', 'artifact_set')).toBe(false);
  });

  it('G2 prefix glob: session_* matches session_send_text', () => {
    expect(toolGlobMatch('session_*', 'session_send_text')).toBe(true);
    expect(toolGlobMatch('session_*', 'session_')).toBe(true); // * matches empty run
  });

  it('G3 anchored: session_* does NOT match x_session_send', () => {
    expect(toolGlobMatch('session_*', 'x_session_send')).toBe(false);
  });

  it('G4 bare star matches anything, including empty', () => {
    expect(toolGlobMatch('*', 'anything_at_all')).toBe(true);
    expect(toolGlobMatch('*', '')).toBe(true);
  });

  it('G5 regex metacharacters in the pattern are literal, not regex', () => {
    // `.` must be literal — `a.b` matches only the literal "a.b", not "axb".
    expect(toolGlobMatch('a.b', 'a.b')).toBe(true);
    expect(toolGlobMatch('a.b', 'axb')).toBe(false);
    // `+ ( ) [ ]` etc. are literal too.
    expect(toolGlobMatch('a+b(c)', 'a+b(c)')).toBe(true);
    expect(toolGlobMatch('a+b(c)', 'aaab(c)')).toBe(false);
  });

  it('G6 empty pattern matches only the empty string', () => {
    expect(toolGlobMatch('', '')).toBe(true);
    expect(toolGlobMatch('', 'x')).toBe(false);
  });

  it('G7 multiple stars and mid-pattern star', () => {
    expect(toolGlobMatch('*get*', 'artifact_get_thing')).toBe(true);
    expect(toolGlobMatch('session_*_text', 'session_send_text')).toBe(true);
    expect(toolGlobMatch('session_*_text', 'session_send_input')).toBe(false);
  });

  it('G8 multi-star interior literals advance correctly', () => {
    expect(toolGlobMatch('a*b*c', 'axxbyyc')).toBe(true);
    expect(toolGlobMatch('a*b*c', 'axxc')).toBe(false); // missing interior "b"
  });

  it('G9 pathological multi-star pattern returns false without catastrophic backtracking', () => {
    // Under the old `*`→`.*` regex this ReDoS'd; the linear matcher returns
    // quickly. Correctness assertion is the guard (no timing flake).
    const evil = 'a*a*a*a*a*b';
    const long = 'a'.repeat(64); // ends in 'a', never the required 'b'
    expect(toolGlobMatch(evil, long)).toBe(false);
  });
});
