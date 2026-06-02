/**
 * Tests for useChipActionKeys composable.
 *
 * Alt+1-9 fires the Nth chip bar action for the active session. Mirrors the
 * Ctrl+number session-jump scheme but on Alt so the two don't collide.
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

const mockTriggerAction = vi.fn();
let storeActions: Array<{ label: string; sequence: string; preview: string }> = [];

vi.mock('../renderer/stores/chip-bar.js', () => ({
  useChipBarStore: () => ({
    get actions() { return storeActions; },
    triggerAction: mockTriggerAction,
  }),
}));

import { useChipActionKeys } from '../renderer/composables/useChipActionKeys.js';

function fireAlt(opts: { code?: string; key?: string; ctrlKey?: boolean; shiftKey?: boolean; metaKey?: boolean } = {}): KeyboardEvent {
  const e = new KeyboardEvent('keydown', {
    key: opts.key ?? '',
    code: opts.code,
    altKey: !opts.ctrlKey && !opts.metaKey ? true : opts.ctrlKey ? false : true,
    ctrlKey: opts.ctrlKey ?? false,
    shiftKey: opts.shiftKey ?? false,
    metaKey: opts.metaKey ?? false,
    bubbles: true,
    cancelable: true,
  });
  window.dispatchEvent(e);
  return e;
}

describe('useChipActionKeys', () => {
  beforeEach(() => {
    mockTriggerAction.mockClear();
    unmountedHandler = null;
    storeActions = [
      { label: 'A1', sequence: 'one{Enter}', preview: 'one' },
      { label: 'A2', sequence: 'two{Enter}', preview: 'two' },
      { label: 'A3', sequence: 'three{Enter}', preview: 'three' },
    ];
  });

  afterEach(() => {
    unmountedHandler?.();
    document.querySelectorAll('.modal-overlay.modal--visible').forEach(el => el.remove());
  });

  it('Alt+1 fires the first action', () => {
    useChipActionKeys();
    const e = fireAlt({ code: 'Digit1', key: '1' });
    expect(mockTriggerAction).toHaveBeenCalledOnce();
    expect(mockTriggerAction).toHaveBeenCalledWith('one{Enter}');
    expect(e.defaultPrevented).toBe(true);
  });

  it('Alt+3 fires the third action', () => {
    useChipActionKeys();
    fireAlt({ code: 'Digit3', key: '3' });
    expect(mockTriggerAction).toHaveBeenCalledWith('three{Enter}');
  });

  it('resolves the slot from e.code even when Alt remaps e.key to a symbol', () => {
    useChipActionKeys();
    fireAlt({ code: 'Digit2', key: '™' });
    expect(mockTriggerAction).toHaveBeenCalledWith('two{Enter}');
  });

  it('out-of-range slot is ignored', () => {
    useChipActionKeys();
    const e = fireAlt({ code: 'Digit5', key: '5' });
    expect(mockTriggerAction).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
  });

  it('ignores Alt+number when a modal overlay is visible', () => {
    useChipActionKeys();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay modal--visible';
    document.body.appendChild(overlay);
    const e = fireAlt({ code: 'Digit1', key: '1' });
    expect(mockTriggerAction).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
  });

  it('ignores Ctrl+number (reserved for session jump)', () => {
    useChipActionKeys();
    fireAlt({ code: 'Digit1', key: '1', ctrlKey: true });
    expect(mockTriggerAction).not.toHaveBeenCalled();
  });

  it('ignores Alt+Shift+number and Alt+Meta+number', () => {
    useChipActionKeys();
    fireAlt({ code: 'Digit1', key: '1', shiftKey: true });
    fireAlt({ code: 'Digit1', key: '1', metaKey: true });
    expect(mockTriggerAction).not.toHaveBeenCalled();
  });

  it('listener is removed after teardown', () => {
    useChipActionKeys();
    unmountedHandler?.();
    fireAlt({ code: 'Digit1', key: '1' });
    expect(mockTriggerAction).not.toHaveBeenCalled();
  });
});
