/**
 * Unit tests for shouldAllowNativeCopy predicate.
 *
 * The predicate is pure — no DOM mocking required. The thin DOM adapter
 * (window.getSelection / closest) lives in paste-handler.ts and is tested
 * via integration rather than here.
 */

import { describe, it, expect } from 'vitest';
import { shouldAllowNativeCopy } from '../renderer/paste-handler.js';

/** Minimal KeyboardEvent-shaped object — predicate only reads ctrlKey + key. */
function makeEvent(key: string, ctrl = true, meta = false): Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey'> {
  return { key, ctrlKey: ctrl, metaKey: meta };
}

describe('shouldAllowNativeCopy', () => {
  it('Ctrl+C with selection inside artifact doc → true', () => {
    expect(shouldAllowNativeCopy(makeEvent('c'), { collapsed: false, inArtifactDoc: true })).toBe(true);
  });

  it('Ctrl+C (uppercase key) with selection inside artifact doc → true', () => {
    expect(shouldAllowNativeCopy(makeEvent('C'), { collapsed: false, inArtifactDoc: true })).toBe(true);
  });

  it('Ctrl+X with selection inside artifact doc → true', () => {
    expect(shouldAllowNativeCopy(makeEvent('x'), { collapsed: false, inArtifactDoc: true })).toBe(true);
  });

  it('Ctrl+X (uppercase key) with selection inside artifact doc → true', () => {
    expect(shouldAllowNativeCopy(makeEvent('X'), { collapsed: false, inArtifactDoc: true })).toBe(true);
  });

  it('Ctrl+C with COLLAPSED selection inside artifact doc → false (SIGINT preserved)', () => {
    expect(shouldAllowNativeCopy(makeEvent('c'), { collapsed: true, inArtifactDoc: true })).toBe(false);
  });

  it('Ctrl+C with selection NOT inside artifact doc → false', () => {
    expect(shouldAllowNativeCopy(makeEvent('c'), { collapsed: false, inArtifactDoc: false })).toBe(false);
  });

  it('Ctrl+A with selection inside artifact doc → false (non-copy key)', () => {
    expect(shouldAllowNativeCopy(makeEvent('a'), { collapsed: false, inArtifactDoc: true })).toBe(false);
  });

  it('Ctrl+V with selection inside artifact doc → false (non-copy key)', () => {
    expect(shouldAllowNativeCopy(makeEvent('v'), { collapsed: false, inArtifactDoc: true })).toBe(false);
  });

  it('non-Ctrl Ctrl+C (ctrlKey=false) → false', () => {
    expect(shouldAllowNativeCopy(makeEvent('c', false), { collapsed: false, inArtifactDoc: true })).toBe(false);
  });
});
