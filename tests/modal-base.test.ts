// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { attachModalKeyboard } from '../renderer/modals/modal-base.js';

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

    it('does NOT call onAccept when Enter is pressed in a textarea', () => {
      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);
      textarea.focus();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(onAccept).not.toHaveBeenCalled();
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
});
