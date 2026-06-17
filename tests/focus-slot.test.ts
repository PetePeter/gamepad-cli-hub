/**
 * Tests for resolveFocusSlot — the main window's resolution of a popout's
 * Ctrl+<n> focus-slot request.
 *
 * Snapped-out sessions are excluded from the shortcut map entirely (by
 * getOrderedSessionIds), so every resolved session is local; the resolver just
 * returns the session id occupying the requested display slot.
 */

import { describe, it, expect } from 'vitest';
import { resolveFocusSlot } from '../renderer/composables/focus-slot.js';

const map = new Map<string, number>([
  ['local-a', 1],
  ['local-b', 2],
  ['local-c', 0], // slot 0 = 10th position
]);

describe('resolveFocusSlot', () => {
  it('returns the session id mapped to the requested slot', () => {
    expect(resolveFocusSlot(1, map)).toBe('local-a');
  });

  it('resolves slot 0 to the 10th-position session', () => {
    expect(resolveFocusSlot(0, map)).toBe('local-c');
  });

  it('unmapped slot → null', () => {
    expect(resolveFocusSlot(5, map)).toBeNull();
  });

  it('empty map → null', () => {
    expect(resolveFocusSlot(1, new Map())).toBeNull();
  });
});
