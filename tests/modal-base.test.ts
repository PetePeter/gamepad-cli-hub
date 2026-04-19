// @vitest-environment jsdom
vi.mock('vue', () => ({ reactive: (obj: any) => obj }));

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { attachModalKeyboard } from '../renderer/modals/modal-base.js';
import { showFormModal } from '../renderer/utils.js';
import { formModal } from '../renderer/stores/modal-bridge.js';

describe('modal-base', () => {
  describe('attachModalKeyboard', () => {
    let onAccept: ReturnType<typeof vi.fn>;
    let onCancel: ReturnType<typeof vi.fn>;
    let cleanup: () => void;

    beforeEach(() => {
      onAccept = vi.fn();
      onCancel = vi.fn();
      cleanup = attachModalKeyboard({ onAccept, onCancel });
    });

    afterEach(() => {
      cleanup();
    });

    it('calls onCancel when ESC is pressed', () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(onCancel).toHaveBeenCalledOnce();
      expect(onAccept).not.toHaveBeenCalled();
    });

    it('calls onAccept when Enter is pressed', () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(onAccept).toHaveBeenCalledOnce();
      expect(onCancel).not.toHaveBeenCalled();
    });

    it('does NOT call onAccept when Enter is pressed in a modal-internal textarea', () => {
      // Create modal structure with textarea inside
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay modal--visible';
      const modal = document.createElement('div');
      modal.className = 'modal';
      const textarea = document.createElement('textarea');
      modal.appendChild(textarea);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      textarea.focus();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(onAccept).not.toHaveBeenCalled();
      document.body.removeChild(overlay);
    });

    it('DOES call onAccept when Enter is pressed with an external textarea focused', () => {
      // External textarea (e.g. xterm hidden textarea) should NOT block modal Enter
      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);
      textarea.focus();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(onAccept).toHaveBeenCalledOnce();
      document.body.removeChild(textarea);
    });

    it('calls onAccept when Ctrl+Enter is pressed', () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
      expect(onAccept).toHaveBeenCalledOnce();
    });

    it('calls onAccept when Ctrl+Enter is pressed even in a textarea', () => {
      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);
      textarea.focus();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
      expect(onAccept).toHaveBeenCalledOnce();
      document.body.removeChild(textarea);
    });

    it('cleanup removes listeners', () => {
      cleanup();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(onCancel).not.toHaveBeenCalled();
    });

    it('does not intercept other keys', () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
      expect(onAccept).not.toHaveBeenCalled();
      expect(onCancel).not.toHaveBeenCalled();
    });
  });

  describe('selection mode', () => {
    let onAccept: ReturnType<typeof vi.fn>;
    let onCancel: ReturnType<typeof vi.fn>;
    let cleanup: () => void;

    beforeEach(() => {
      onAccept = vi.fn();
      onCancel = vi.fn();
      cleanup = attachModalKeyboard({ mode: 'selection', onAccept, onCancel });
    });

    afterEach(() => {
      cleanup();
    });

    it('still calls onCancel on Escape', () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(onCancel).toHaveBeenCalledOnce();
    });

    it('still calls onAccept on Enter', () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(onAccept).toHaveBeenCalledOnce();
    });

    it('calls onAccept when Space is pressed', () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      expect(onAccept).toHaveBeenCalledOnce();
      expect(onCancel).not.toHaveBeenCalled();
    });

    it('calls onAccept on Enter even when a textarea is focused (xterm fix)', () => {
      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);
      textarea.focus();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(onAccept).toHaveBeenCalledOnce();
      document.body.removeChild(textarea);
    });

    it('calls onAccept on Ctrl+Enter', () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
      expect(onAccept).toHaveBeenCalledOnce();
    });

    it('blocks printable keys from propagating', () => {
      const e = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
      document.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(true);
      expect(onAccept).not.toHaveBeenCalled();
      expect(onCancel).not.toHaveBeenCalled();
    });

    it('blocks Ctrl+key combos from propagating', () => {
      const e = new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true, cancelable: true });
      document.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(true);
    });

    it('blocks ArrowDown from propagating (no .modal container)', () => {
      const e = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
      document.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(true);
    });

    it('blocks ArrowUp from propagating (no .modal container)', () => {
      const e = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true });
      document.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(true);
    });

    it('blocks arrow keys from reaching child element listeners', () => {
      const child = document.createElement('div');
      document.body.appendChild(child);
      const childHandler = vi.fn();
      child.addEventListener('keydown', childHandler);

      const e = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
      child.dispatchEvent(e);

      expect(childHandler).not.toHaveBeenCalled();
      child.removeEventListener('keydown', childHandler);
      document.body.removeChild(child);
    });

    it('blocks Tab key from propagating', () => {
      const e = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
      document.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(true);
    });

    it('blocks Ctrl+Tab from propagating', () => {
      const e = new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true, bubbles: true, cancelable: true });
      document.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(true);
    });

    it('does NOT block when in form mode (default)', () => {
      cleanup();
      cleanup = attachModalKeyboard({ onAccept, onCancel }); // default: form mode
      const e = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
      document.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(false);
    });

    it('prevents event from reaching child element listeners', () => {
      const child = document.createElement('div');
      document.body.appendChild(child);
      const childHandler = vi.fn();
      child.addEventListener('keydown', childHandler);

      const e = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
      child.dispatchEvent(e);

      expect(childHandler).not.toHaveBeenCalled();
      child.removeEventListener('keydown', childHandler);
      document.body.removeChild(child);
    });
  });

  describe('arrow key navigation', () => {
    let cleanup: () => void;
    let container: HTMLDivElement;

    beforeEach(() => {
      // Create a mock modal structure
      container = document.createElement('div');
      container.className = 'modal';
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay modal--visible';
      overlay.appendChild(container);
      document.body.appendChild(overlay);

      // Add focusable elements
      for (let i = 0; i < 3; i++) {
        const input = document.createElement('input');
        input.id = `field-${i}`;
        container.appendChild(input);
      }

      cleanup = attachModalKeyboard({
        onAccept: vi.fn(),
        onCancel: vi.fn(),
        container,
      });
    });

    afterEach(() => {
      cleanup();
      document.body.innerHTML = '';
    });

    it('ArrowDown moves focus to next focusable element', () => {
      const fields = container.querySelectorAll('input');
      (fields[0] as HTMLElement).focus();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      expect(document.activeElement).toBe(fields[1]);
    });

    it('ArrowUp moves focus to previous focusable element', () => {
      const fields = container.querySelectorAll('input');
      (fields[1] as HTMLElement).focus();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      expect(document.activeElement).toBe(fields[0]);
    });

    it('ArrowDown wraps from last to first', () => {
      const fields = container.querySelectorAll('input');
      (fields[2] as HTMLElement).focus();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      expect(document.activeElement).toBe(fields[0]);
    });

    it('ArrowUp wraps from first to last', () => {
      const fields = container.querySelectorAll('input');
      (fields[0] as HTMLElement).focus();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      expect(document.activeElement).toBe(fields[2]);
    });

    it('does not navigate arrows in a textarea', () => {
      const textarea = document.createElement('textarea');
      container.appendChild(textarea);
      textarea.focus();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      expect(document.activeElement).toBe(textarea);
    });
  });

  describe('custom arrow callbacks (selection mode)', () => {
    let cleanup: () => void;
    let onArrowUp: ReturnType<typeof vi.fn>;
    let onArrowDown: ReturnType<typeof vi.fn>;
    let onArrowLeft: ReturnType<typeof vi.fn>;
    let onArrowRight: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      onArrowUp = vi.fn();
      onArrowDown = vi.fn();
      onArrowLeft = vi.fn();
      onArrowRight = vi.fn();
      cleanup = attachModalKeyboard({
        mode: 'selection',
        onAccept: vi.fn(),
        onCancel: vi.fn(),
        onArrowUp,
        onArrowDown,
        onArrowLeft,
        onArrowRight,
      });
    });

    afterEach(() => {
      cleanup();
    });

    it('ArrowUp calls onArrowUp', () => {
      const e = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true });
      document.dispatchEvent(e);
      expect(onArrowUp).toHaveBeenCalledOnce();
      expect(e.defaultPrevented).toBe(true);
    });

    it('ArrowDown calls onArrowDown', () => {
      const e = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
      document.dispatchEvent(e);
      expect(onArrowDown).toHaveBeenCalledOnce();
      expect(e.defaultPrevented).toBe(true);
    });

    it('ArrowLeft calls onArrowLeft', () => {
      const e = new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true });
      document.dispatchEvent(e);
      expect(onArrowLeft).toHaveBeenCalledOnce();
      expect(e.defaultPrevented).toBe(true);
    });

    it('ArrowRight calls onArrowRight', () => {
      const e = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
      document.dispatchEvent(e);
      expect(onArrowRight).toHaveBeenCalledOnce();
      expect(e.defaultPrevented).toBe(true);
    });

    it('ArrowLeft without handler still blocks in selection mode', () => {
      cleanup();
      cleanup = attachModalKeyboard({
        mode: 'selection',
        onAccept: vi.fn(),
        onCancel: vi.fn(),
      });
      const e = new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true });
      document.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(true);
    });

    it('ArrowRight without handler still blocks in selection mode', () => {
      cleanup();
      cleanup = attachModalKeyboard({
        mode: 'selection',
        onAccept: vi.fn(),
        onCancel: vi.fn(),
      });
      const e = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
      document.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(true);
    });

    it('ArrowLeft in form mode does not preventDefault', () => {
      cleanup();
      cleanup = attachModalKeyboard({
        onAccept: vi.fn(),
        onCancel: vi.fn(),
      });
      const e = new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true });
      document.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(false);
    });

    it('ArrowRight in form mode does not preventDefault', () => {
      cleanup();
      cleanup = attachModalKeyboard({
        onAccept: vi.fn(),
        onCancel: vi.fn(),
      });
      const e = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
      document.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(false);
    });

    it('custom onArrowUp suppresses default focus cycling', () => {
      const container = document.createElement('div');
      container.className = 'modal';
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay modal--visible';
      overlay.appendChild(container);
      document.body.appendChild(overlay);

      const input1 = document.createElement('input');
      const input2 = document.createElement('input');
      container.appendChild(input1);
      container.appendChild(input2);

      input2.focus();

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      expect(onArrowUp).toHaveBeenCalledOnce();
      // Focus stays on input2 — selection mode uses callbacks, not DOM cycling
      expect(document.activeElement).toBe(input2);

      document.body.removeChild(overlay);
    });
  });

  describe('showFormModal browse button', () => {
    beforeEach(() => {
      formModal.visible = false;
      formModal.title = '';
      formModal.fields = [];
    });

    it('sets browse flag on field when browse: true', () => {
      showFormModal('Test', [{ key: 'path', label: 'Path', browse: true }]);
      expect(formModal.fields[0].browse).toBe(true);
    });

    it('does not set browse flag when browse is not provided', () => {
      showFormModal('Test', [{ key: 'path', label: 'Path' }]);
      expect(formModal.fields[0].browse).toBeFalsy();
    });
  });
});
