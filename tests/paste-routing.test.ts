// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockShowEditorPopup } = vi.hoisted(() => ({
  mockShowEditorPopup: vi.fn(),
}));

// Mock bindings module before importing paste-handler
vi.mock('../renderer/bindings', () => ({
  keyToPtyEscape: (key: string) => {
    const map: Record<string, string> = {
      'Enter': '\r', 'Tab': '\t', 'Escape': '\x1b', 'Backspace': '\x7f',
      'Up': '\x1b[A', 'Down': '\x1b[B', 'Left': '\x1b[D', 'Right': '\x1b[C',
    };
    return map[key] ?? key;
  },
  comboToPtyEscape: (keys: string[]) => {
    if (keys.length === 2 && keys[0].toLowerCase() === 'ctrl') {
      const k = keys[1].toUpperCase();
      if (k.length === 1 && k >= 'A' && k <= 'Z') {
        return String.fromCharCode(k.charCodeAt(0) - 64);
      }
    }
    return keys.join('');
  },
}));

vi.mock('../renderer/editor/editor-popup.js', () => ({
  showEditorPopup: mockShowEditorPopup,
}));

import { setupKeyboardRelay, teardownKeyboardRelay } from '../renderer/paste-handler';

// ============================================================================
// Tests
// ============================================================================

describe('keyboard relay', () => {
  let mockPtyWrite: ReturnType<typeof vi.fn>;
  let getActiveSessionId: ReturnType<typeof vi.fn>;
  let hasPendingQuestion: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockPtyWrite = vi.fn().mockResolvedValue({ success: true });
    getActiveSessionId = vi.fn().mockReturnValue(null);
    hasPendingQuestion = vi.fn().mockReturnValue(false);
    mockShowEditorPopup.mockReset();
    mockShowEditorPopup.mockResolvedValue('editor text');

    (window as any).gamepadCli = { ptyWrite: mockPtyWrite };

    // Polyfill navigator.clipboard for jsdom
    Object.defineProperty(navigator, 'clipboard', {
      value: { readText: vi.fn().mockResolvedValue('pasted text') },
      writable: true,
      configurable: true,
    });

    setupKeyboardRelay(getActiveSessionId, hasPendingQuestion);
  });

  afterEach(() => {
    teardownKeyboardRelay();
    vi.restoreAllMocks();
  });

  function fireKey(key: string, opts: Partial<KeyboardEventInit> = {}): KeyboardEvent {
    const e = new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
      ...opts,
    });
    document.dispatchEvent(e);
    return e;
  }

  // ---------------------------------------------------------------------------
  // Ctrl+V paste
  // ---------------------------------------------------------------------------

  describe('Ctrl+V paste', () => {
    it('writes clipboard text to PTY when terminal is active', async () => {
      getActiveSessionId.mockReturnValue('sess-1');

      fireKey('v', { ctrlKey: true });
      await new Promise(r => setTimeout(r, 10));

      expect(navigator.clipboard.readText).toHaveBeenCalled();
      expect(mockPtyWrite).toHaveBeenCalledWith('sess-1', 'pasted text');
    });

    it('does nothing when no terminal is active', async () => {
      getActiveSessionId.mockReturnValue(null);

      fireKey('v', { ctrlKey: true });
      await new Promise(r => setTimeout(r, 10));

      expect(navigator.clipboard.readText).not.toHaveBeenCalled();
      expect(mockPtyWrite).not.toHaveBeenCalled();
    });

    it('does not write empty clipboard text', async () => {
      getActiveSessionId.mockReturnValue('sess-1');
      (navigator.clipboard.readText as any).mockResolvedValue('');

      fireKey('v', { ctrlKey: true });
      await new Promise(r => setTimeout(r, 10));

      expect(mockPtyWrite).not.toHaveBeenCalled();
    });

    it('handles clipboard read failure gracefully', async () => {
      getActiveSessionId.mockReturnValue('sess-1');
      (navigator.clipboard.readText as any).mockRejectedValue(new Error('denied'));
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      fireKey('v', { ctrlKey: true });
      await new Promise(r => setTimeout(r, 10));

      expect(warnSpy).toHaveBeenCalledWith('[KeyRelay] clipboard read failed:', expect.any(Error));
      expect(mockPtyWrite).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it('prevents default on Ctrl+V when terminal is active', async () => {
      getActiveSessionId.mockReturnValue('sess-1');
      const e = fireKey('v', { ctrlKey: true });
      expect(e.defaultPrevented).toBe(true);
    });

    it('still writes clipboard text when a question is pending', async () => {
      getActiveSessionId.mockReturnValue('sess-1');
      hasPendingQuestion.mockReturnValue(true);

      fireKey('v', { ctrlKey: true });
      await new Promise(r => setTimeout(r, 10));

      expect(mockPtyWrite).toHaveBeenCalledWith('sess-1', 'pasted text');
    });

    it('does not relay Ctrl+N as a PTY control character', () => {
      getActiveSessionId.mockReturnValue('sess-1');

      fireKey('n', { ctrlKey: true });

      expect(mockPtyWrite).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Character relay (simulated typing from OpenWhisper etc.)
  // ---------------------------------------------------------------------------

  describe('character relay', () => {
    it('relays printable characters to PTY', () => {
      getActiveSessionId.mockReturnValue('sess-1');

      fireKey('a');
      expect(mockPtyWrite).toHaveBeenCalledWith('sess-1', 'a');
    });

    it('relays uppercase characters', () => {
      getActiveSessionId.mockReturnValue('sess-1');

      fireKey('A', { shiftKey: true });
      expect(mockPtyWrite).toHaveBeenCalledWith('sess-1', 'A');
    });

    it('relays Enter as carriage return', () => {
      getActiveSessionId.mockReturnValue('sess-1');

      fireKey('Enter');
      expect(mockPtyWrite).toHaveBeenCalledWith('sess-1', '\r');
    });

    it('relays Escape as escape character', () => {
      getActiveSessionId.mockReturnValue('sess-1');

      fireKey('Escape');
      expect(mockPtyWrite).toHaveBeenCalledWith('sess-1', '\x1b');
    });

    it('relays Ctrl+C as control character', () => {
      getActiveSessionId.mockReturnValue('sess-1');

      fireKey('c', { ctrlKey: true });
      expect(mockPtyWrite).toHaveBeenCalledWith('sess-1', '\x03');
    });

    it('does nothing when no terminal is active', () => {
      getActiveSessionId.mockReturnValue(null);

      fireKey('a');
      expect(mockPtyWrite).not.toHaveBeenCalled();
    });

    it('skips modifier-only keys', () => {
      getActiveSessionId.mockReturnValue('sess-1');

      fireKey('Control');
      fireKey('Shift');
      fireKey('Alt');
      fireKey('Meta');
      expect(mockPtyWrite).not.toHaveBeenCalled();
    });

    it('prevents default on relayed characters', () => {
      getActiveSessionId.mockReturnValue('sess-1');

      const e = fireKey('x');
      expect(e.defaultPrevented).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Skip conditions
  // ---------------------------------------------------------------------------

  describe('skip conditions', () => {
    it('skips regular keys when xterm.js element is the target', () => {
      getActiveSessionId.mockReturnValue('sess-1');

      const xtermDiv = document.createElement('div');
      xtermDiv.classList.add('xterm');
      document.body.appendChild(xtermDiv);

      const e = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
      xtermDiv.dispatchEvent(e);

      expect(mockPtyWrite).not.toHaveBeenCalled();
      document.body.removeChild(xtermDiv);
    });

    it('Ctrl+V paste works even when xterm.js has focus', async () => {
      getActiveSessionId.mockReturnValue('sess-1');
      (navigator.clipboard.readText as any).mockResolvedValue('paste from xterm');

      const xtermDiv = document.createElement('div');
      xtermDiv.classList.add('xterm');
      document.body.appendChild(xtermDiv);

      const e = new KeyboardEvent('keydown', {
        key: 'v', ctrlKey: true, bubbles: true, cancelable: true,
      });
      xtermDiv.dispatchEvent(e);
      await new Promise(r => setTimeout(r, 10));

      expect(mockPtyWrite).toHaveBeenCalledWith('sess-1', 'paste from xterm');
      document.body.removeChild(xtermDiv);
    });

    it('skips when an input field has focus', () => {
      getActiveSessionId.mockReturnValue('sess-1');

      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();

      fireKey('a');
      expect(mockPtyWrite).not.toHaveBeenCalled();

      document.body.removeChild(input);
    });

    it('skips when a textarea has focus', () => {
      getActiveSessionId.mockReturnValue('sess-1');

      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);
      textarea.focus();

      fireKey('a');
      expect(mockPtyWrite).not.toHaveBeenCalled();

      document.body.removeChild(textarea);
    });

    it('skips Alt key combos', () => {
      getActiveSessionId.mockReturnValue('sess-1');

      fireKey('a', { altKey: true });
      expect(mockPtyWrite).not.toHaveBeenCalled();
    });

    it('skips Meta key combos', () => {
      getActiveSessionId.mockReturnValue('sess-1');

      fireKey('a', { metaKey: true });
      expect(mockPtyWrite).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Modal overlay guard
  // ---------------------------------------------------------------------------

  describe('modal overlay guard', () => {
    let overlay: HTMLDivElement;

    beforeEach(() => {
      overlay = document.createElement('div');
      overlay.className = 'modal-overlay modal--visible';
      document.body.appendChild(overlay);
    });

    afterEach(() => {
      document.body.removeChild(overlay);
    });

    it('blocks Ctrl+V paste when a modal overlay is visible', async () => {
      getActiveSessionId.mockReturnValue('sess-1');

      fireKey('v', { ctrlKey: true });
      await new Promise(r => setTimeout(r, 10));

      expect(navigator.clipboard.readText).not.toHaveBeenCalled();
      expect(mockPtyWrite).not.toHaveBeenCalled();
    });

    it('blocks printable key relay when a modal overlay is visible', () => {
      getActiveSessionId.mockReturnValue('sess-1');

      fireKey('a');
      expect(mockPtyWrite).not.toHaveBeenCalled();
    });

    it('blocks Ctrl+letter relay when a modal overlay is visible', () => {
      getActiveSessionId.mockReturnValue('sess-1');

      fireKey('c', { ctrlKey: true });
      expect(mockPtyWrite).not.toHaveBeenCalled();
    });

    it('blocks named key relay when a modal overlay is visible', () => {
      getActiveSessionId.mockReturnValue('sess-1');

      fireKey('Enter');
      expect(mockPtyWrite).not.toHaveBeenCalled();
    });

    it('resumes relay when modal overlay is hidden', async () => {
      getActiveSessionId.mockReturnValue('sess-1');
      overlay.classList.remove('modal--visible');

      fireKey('v', { ctrlKey: true });
      await new Promise(r => setTimeout(r, 10));

      expect(mockPtyWrite).toHaveBeenCalledWith('sess-1', 'pasted text');
    });
  });

  // ---------------------------------------------------------------------------
  // Idempotency
  // ---------------------------------------------------------------------------

  describe('idempotency', () => {
    it('calling setup twice only registers one listener', () => {
      getActiveSessionId.mockReturnValue('sess-1');

      setupKeyboardRelay(getActiveSessionId);
      fireKey('a');

      expect(mockPtyWrite).toHaveBeenCalledTimes(1);
    });
  });
});
