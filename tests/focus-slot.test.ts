/**
 * Tests for resolveFocusSlot — the main window's resolution of a popout's
 * Ctrl+<n> focus-slot request.
 */

import { describe, it, expect } from 'vitest';
import { resolveFocusSlot } from '../renderer/composables/focus-slot.js';

const map = new Map<string, number>([
  ['local-a', 1],
  ['popped-b', 2],
  ['local-c', 0], // slot 0 = 10th position
]);

const isSnappedOut = (id: string) => id === 'popped-b';

describe('resolveFocusSlot', () => {
  it('local session → switchToTerminal true', () => {
    expect(resolveFocusSlot(1, map, isSnappedOut)).toEqual({ sessionId: 'local-a', switchToTerminal: true });
  });

  it('snapped-out session → switchToTerminal false (leave main view untouched)', () => {
    expect(resolveFocusSlot(2, map, isSnappedOut)).toEqual({ sessionId: 'popped-b', switchToTerminal: false });
  });

  it('resolves slot 0 to the 10th-position session', () => {
    expect(resolveFocusSlot(0, map, isSnappedOut)).toEqual({ sessionId: 'local-c', switchToTerminal: true });
  });

  it('unmapped slot → null', () => {
    expect(resolveFocusSlot(5, map, isSnappedOut)).toBeNull();
  });
});
