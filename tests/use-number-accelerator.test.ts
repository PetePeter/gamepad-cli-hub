/**
 * Tests for useNumberAccelerator — the generic Ctrl/Alt + number accelerator
 * shared by the session-jump (Ctrl) and chip-action (Alt) schemes.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let unmountedHandler: (() => void) | null = null;

vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue');
  return {
    ...actual,
    onMounted: vi.fn((fn: () => void) => { fn(); }),
    onUnmounted: vi.fn((fn: () => void) => { unmountedHandler = fn; }),
  };
});

import { useNumberAccelerator, slotToIndex } from '../renderer/composables/useNumberAccelerator.js';

function fire(opts: { code?: string; key?: string; ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean; metaKey?: boolean }): KeyboardEvent {
  const e = new KeyboardEvent('keydown', {
    key: opts.key ?? '',
    code: opts.code,
    ctrlKey: opts.ctrlKey ?? false,
    altKey: opts.altKey ?? false,
    shiftKey: opts.shiftKey ?? false,
    metaKey: opts.metaKey ?? false,
    bubbles: true,
    cancelable: true,
  });
  document.dispatchEvent(e);
  return e;
}

describe('useNumberAccelerator', () => {
  beforeEach(() => { unmountedHandler = null; });
  afterEach(() => {
    unmountedHandler?.();
    document.querySelectorAll('.modal-overlay.modal--visible').forEach(el => el.remove());
  });

  it('ctrl: digits 1-9 emit the matching slot', () => {
    const onSlot = vi.fn().mockReturnValue(true);
    useNumberAccelerator({ modifier: 'ctrl', onSlot });
    for (let n = 1; n <= 9; n++) {
      fire({ code: `Digit${n}`, key: String(n), ctrlKey: true });
      expect(onSlot).toHaveBeenLastCalledWith(n);
    }
  });

  it('ctrl: digit 0 emits slot 0', () => {
    const onSlot = vi.fn().mockReturnValue(true);
    useNumberAccelerator({ modifier: 'ctrl', onSlot });
    fire({ code: 'Digit0', key: '0', ctrlKey: true });
    expect(onSlot).toHaveBeenCalledWith(0);
  });

  it('alt: digit 0 emits slot 0', () => {
    const onSlot = vi.fn().mockReturnValue(true);
    useNumberAccelerator({ modifier: 'alt', onSlot });
    fire({ code: 'Digit0', key: '0', altKey: true });
    expect(onSlot).toHaveBeenCalledWith(0);
  });

  it('alt: digits 1-9 emit the matching slot', () => {
    const onSlot = vi.fn().mockReturnValue(true);
    useNumberAccelerator({ modifier: 'alt', onSlot });
    fire({ code: 'Digit4', key: '4', altKey: true });
    expect(onSlot).toHaveBeenCalledWith(4);
  });

  it('ignores the wrong modifier (alt event on a ctrl instance)', () => {
    const onSlot = vi.fn().mockReturnValue(true);
    useNumberAccelerator({ modifier: 'ctrl', onSlot });
    fire({ code: 'Digit1', key: '1', altKey: true });
    expect(onSlot).not.toHaveBeenCalled();
  });

  it('ignores extra modifiers (ctrl+shift, ctrl+meta)', () => {
    const onSlot = vi.fn().mockReturnValue(true);
    useNumberAccelerator({ modifier: 'ctrl', onSlot });
    fire({ code: 'Digit1', key: '1', ctrlKey: true, shiftKey: true });
    fire({ code: 'Digit1', key: '1', ctrlKey: true, metaKey: true });
    expect(onSlot).not.toHaveBeenCalled();
  });

  it('resolves slot from e.code when alt remaps e.key to a symbol', () => {
    const onSlot = vi.fn().mockReturnValue(true);
    useNumberAccelerator({ modifier: 'alt', onSlot });
    fire({ code: 'Digit2', key: '™', altKey: true });
    expect(onSlot).toHaveBeenCalledWith(2);
  });

  it('suppressed while a modal overlay is visible', () => {
    const onSlot = vi.fn().mockReturnValue(true);
    useNumberAccelerator({ modifier: 'ctrl', onSlot });
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay modal--visible';
    document.body.appendChild(overlay);
    const e = fire({ code: 'Digit1', key: '1', ctrlKey: true });
    expect(onSlot).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
  });

  it('preventDefault + stop only when onSlot consumes (returns true)', () => {
    const onSlot = vi.fn().mockReturnValue(true);
    useNumberAccelerator({ modifier: 'ctrl', onSlot });
    const downstream = vi.fn();
    document.addEventListener('keydown', downstream);
    try {
      const e = fire({ code: 'Digit1', key: '1', ctrlKey: true });
      expect(e.defaultPrevented).toBe(true);
      expect(downstream).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('keydown', downstream);
    }
  });

  it('falls through when onSlot does not consume (returns false)', () => {
    const onSlot = vi.fn().mockReturnValue(false);
    useNumberAccelerator({ modifier: 'ctrl', onSlot });
    const e = fire({ code: 'Digit5', key: '5', ctrlKey: true });
    expect(onSlot).toHaveBeenCalledWith(5);
    expect(e.defaultPrevented).toBe(false);
  });

  it('listener removed on unmount', () => {
    const onSlot = vi.fn().mockReturnValue(true);
    useNumberAccelerator({ modifier: 'ctrl', onSlot });
    unmountedHandler?.();
    fire({ code: 'Digit1', key: '1', ctrlKey: true });
    expect(onSlot).not.toHaveBeenCalled();
  });

  it('slotToIndex maps 1-9 → 0-8 and 0 → 9', () => {
    expect(slotToIndex(1)).toBe(0);
    expect(slotToIndex(9)).toBe(8);
    expect(slotToIndex(0)).toBe(9);
  });
});
