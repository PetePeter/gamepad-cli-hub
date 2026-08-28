/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  modalStack: {
    isOpen: { value: false },
    topInterceptKeys: { value: new Set<string>() },
    handleInput: vi.fn(),
  },
  escProtection: {
    isProtecting: { value: false },
    dismissProtection: vi.fn(),
  },
  getActiveInputContext: vi.fn(() => 'screen'),
  isEditableElement: vi.fn(() => false),
  isEditableElementInContainer: vi.fn(() => false),
}));

vi.mock('../../renderer/composables/useModalStack.js', () => ({ useModalStack: () => mocks.modalStack }));
vi.mock('../../renderer/composables/useEscProtection.js', () => ({ useEscProtection: () => mocks.escProtection }));
vi.mock('../../renderer/input/input-ownership.js', () => ({
  MODAL_NAVIGATION_SELECTOR: '.modal-overlay.modal--visible',
  getActiveInputContext: mocks.getActiveInputContext,
  isEditableElement: mocks.isEditableElement,
  isEditableElementInContainer: mocks.isEditableElementInContainer,
}));

import { useModalKeyboardBridge } from '../../renderer/composables/useModalKeyboardBridge.js';

function fire(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', { key, bubbles: true, ...init });
}

const ALL_KEYS = new Set(['arrows', 'tab', 'enter', 'space', 'escape', 'digits']);

describe('useModalKeyboardBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.modalStack.isOpen.value = true;
    mocks.modalStack.topInterceptKeys.value = ALL_KEYS;
    mocks.modalStack.handleInput.mockReturnValue(true);
    mocks.escProtection.isProtecting.value = false;
    mocks.getActiveInputContext.mockReturnValue('screen');
    mocks.isEditableElement.mockReturnValue(false);
    mocks.isEditableElementInContainer.mockReturnValue(false);
  });

  it('maps ArrowUp to DPadUp', () => {
    const { handler } = useModalKeyboardBridge();
    handler(fire('ArrowUp'));
    expect(mocks.modalStack.handleInput).toHaveBeenCalledWith('DPadUp');
  });

  it('maps ArrowDown to DPadDown', () => {
    const { handler } = useModalKeyboardBridge();
    handler(fire('ArrowDown'));
    expect(mocks.modalStack.handleInput).toHaveBeenCalledWith('DPadDown');
  });

  it('maps ArrowLeft/ArrowRight', () => {
    const { handler } = useModalKeyboardBridge();
    handler(fire('ArrowLeft'));
    handler(fire('ArrowRight'));
    expect(mocks.modalStack.handleInput).toHaveBeenCalledWith('DPadLeft');
    expect(mocks.modalStack.handleInput).toHaveBeenCalledWith('DPadRight');
  });

  it('maps Enter and Space to A', () => {
    const { handler } = useModalKeyboardBridge();
    handler(fire('Enter'));
    handler(fire(' '));
    expect(mocks.modalStack.handleInput).toHaveBeenNthCalledWith(1, 'A');
    expect(mocks.modalStack.handleInput).toHaveBeenNthCalledWith(2, 'A');
  });

  it('maps Escape to B', () => {
    const { handler } = useModalKeyboardBridge();
    handler(fire('Escape'));
    expect(mocks.modalStack.handleInput).toHaveBeenCalledWith('B');
  });

  it('maps Tab and Shift+Tab', () => {
    const { handler } = useModalKeyboardBridge();
    handler(fire('Tab'));
    handler(fire('Tab', { shiftKey: true }));
    expect(mocks.modalStack.handleInput).toHaveBeenNthCalledWith(1, 'Tab');
    expect(mocks.modalStack.handleInput).toHaveBeenNthCalledWith(2, 'ShiftTab');
  });

  it('maps bare digits to Digit{n}', () => {
    const { handler } = useModalKeyboardBridge();
    handler(fire('3'));
    expect(mocks.modalStack.handleInput).toHaveBeenCalledWith('Digit3');
  });

  it('ignores digits with modifiers', () => {
    const { handler } = useModalKeyboardBridge();
    handler(fire('3', { ctrlKey: true }));
    expect(mocks.modalStack.handleInput).not.toHaveBeenCalled();
  });

  it('no-ops when the stack is closed', () => {
    mocks.modalStack.isOpen.value = false;
    const { handler } = useModalKeyboardBridge();
    handler(fire('ArrowUp'));
    expect(mocks.modalStack.handleInput).not.toHaveBeenCalled();
  });

  it('respects interceptKeys — no-op when key not in set', () => {
    mocks.modalStack.topInterceptKeys.value = new Set(['escape']);
    const { handler } = useModalKeyboardBridge();
    handler(fire('ArrowUp'));
    expect(mocks.modalStack.handleInput).not.toHaveBeenCalled();

    handler(fire('Escape'));
    expect(mocks.modalStack.handleInput).toHaveBeenCalledWith('B');
  });

  it('respects the editable-in-modal guard for arrows', () => {
    mocks.getActiveInputContext.mockReturnValue('editable-field');
    mocks.isEditableElement.mockReturnValue(true);
    mocks.isEditableElementInContainer.mockReturnValue(true);
    const { handler } = useModalKeyboardBridge();
    handler(fire('ArrowDown'));
    expect(mocks.modalStack.handleInput).not.toHaveBeenCalled();
  });

  // The bridge reports consumption and the keyboard router suppresses the
  // event; handlers no longer call preventDefault/stopPropagation themselves.
  it('dismisses ESC protection on non-Escape key without forwarding', () => {
    mocks.escProtection.isProtecting.value = true;
    const { handler } = useModalKeyboardBridge();

    const consumed = handler(fire('x'));

    expect(mocks.escProtection.dismissProtection).toHaveBeenCalled();
    expect(consumed).toBe(true);
    expect(mocks.modalStack.handleInput).not.toHaveBeenCalled();
  });

  it('reports a key it did not consume so later handlers still see it', () => {
    const { handler } = useModalKeyboardBridge();

    expect(handler(fire('F7'))).toBe(false);
  });
});
