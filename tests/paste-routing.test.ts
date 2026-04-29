// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockShowEditorPopup, mockState, mockGetTerminalManager } = vi.hoisted(() => ({
  mockShowEditorPopup: vi.fn(),
  mockState: {
    sessions: [] as Array<{ id: string; cliType: string }>,
    cliToolsCache: {} as Record<string, { pasteMode?: string }>,
  },
  mockGetTerminalManager: vi.fn().mockReturnValue(null),
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

vi.mock('../renderer/state.js', () => ({
  state: mockState,
}));

vi.mock('../renderer/runtime/terminal-provider.js', () => ({
  getTerminalManager: mockGetTerminalManager,
}));

vi.mock('../renderer/composables/useEscProtection.js', () => ({
  useEscProtection: () => ({
    isProtecting: { value: false },
    openProtection: vi.fn(),
    dismissProtection: vi.fn(),
  }),
}));

import { setupKeyboardRelay, teardownKeyboardRelay, deliverBulkText } from '../renderer/paste-handler';

// ============================================================================
// Tests
// ============================================================================

describe('keyboard relay', () => {
  let mockPtyWrite: ReturnType<typeof vi.fn>;
  let getActiveSessionId: ReturnType<typeof vi.fn>;
  let hasPendingQuestion: ReturnType<typeof vi.fn>;
  let restoreRequestAnimationFrame: (() => void) | null = null;

  beforeEach(() => {
    mockPtyWrite = vi.fn().mockResolvedValue({ success: true });
    getActiveSessionId = vi.fn().mockReturnValue(null);
    hasPendingQuestion = vi.fn().mockReturnValue(false);
    mockState.sessions = [];
    mockState.cliToolsCache = {};
    mockGetTerminalManager.mockReturnValue(null);
    mockShowEditorPopup.mockReset();
    mockShowEditorPopup.mockResolvedValue('editor text');

    (window as any).gamepadCli = { ptyWrite: mockPtyWrite };

    // Polyfill navigator.clipboard for jsdom
    Object.defineProperty(navigator, 'clipboard', {
      value: { readText: vi.fn().mockResolvedValue('pasted text') },
      writable: true,
      configurable: true,
    });

    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
      callback(0);
      return 1;
    }) as typeof requestAnimationFrame;
    restoreRequestAnimationFrame = () => {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    };

    setupKeyboardRelay(getActiveSessionId, hasPendingQuestion, async () => false);
  });

  afterEach(() => {
    teardownKeyboardRelay();
    restoreRequestAnimationFrame?.();
    restoreRequestAnimationFrame = null;
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

    it('relays Escape as escape character', async () => {
      getActiveSessionId.mockReturnValue('sess-1');

      fireKey('Escape');
      await new Promise(resolve => setTimeout(resolve, 10));
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

    it('blocks Ctrl+V paste for default PTY mode when a modal overlay is visible', async () => {
      getActiveSessionId.mockReturnValue('sess-1');
      mockState.sessions = [{ id: 'sess-1', cliType: 'codex' }];
      navigator.clipboard.readText.mockResolvedValue('hello');

      fireKey('v', { ctrlKey: true });
      await new Promise(r => setTimeout(r, 10));

      expect(navigator.clipboard.readText).not.toHaveBeenCalled();
      expect(mockPtyWrite).not.toHaveBeenCalled();
    });

    it('allows Ctrl+V paste for clippaste mode when a modal overlay is visible', async () => {
      const paste = vi.fn();
      getActiveSessionId.mockReturnValue('sess-1');
      mockState.sessions = [{ id: 'sess-1', cliType: 'copilot' }];
      mockState.cliToolsCache = { copilot: { pasteMode: 'clippaste' } };
      mockGetTerminalManager.mockReturnValue({
        getSession: vi.fn().mockReturnValue({
          view: { focus: vi.fn(), paste },
        }),
      });
      navigator.clipboard.readText.mockResolvedValue('hello');

      fireKey('v', { ctrlKey: true });
      await new Promise(r => setTimeout(r, 10));

      expect(navigator.clipboard.readText).toHaveBeenCalled();
      expect(mockPtyWrite).toHaveBeenCalledWith('sess-1', 'hello');
      expect(paste).not.toHaveBeenCalled();
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

      setupKeyboardRelay(getActiveSessionId, () => false, async () => false);
      fireKey('a');

      expect(mockPtyWrite).toHaveBeenCalledTimes(1);
    });
  });
});

// ============================================================================
// deliverBulkText — paste mode routing
// ============================================================================

describe('deliverBulkText', () => {
  let mockPtyWrite: ReturnType<typeof vi.fn>;
  let mockKeyboardTypeString: ReturnType<typeof vi.fn>;
  let restoreRequestAnimationFrame: (() => void) | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    mockPtyWrite = vi.fn();
    mockKeyboardTypeString = vi.fn().mockResolvedValue(undefined);

    (window as any).gamepadCli = {
      ptyWrite: mockPtyWrite,
      keyboardTypeString: mockKeyboardTypeString,
    };

    // Reset shared mockState between tests
    mockState.sessions = [];
    mockState.cliToolsCache = {};
    mockGetTerminalManager.mockReturnValue(null);

    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
      callback(0);
      return 1;
    }) as typeof requestAnimationFrame;
    restoreRequestAnimationFrame = () => {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    restoreRequestAnimationFrame?.();
    restoreRequestAnimationFrame = null;
    vi.restoreAllMocks();
  });

  it('pasteMode pty — calls ptyWrite once with full text, never keyboardTypeString', async () => {
    mockState.sessions = [{ id: 'sess-1', cliType: 'claude' }];
    mockState.cliToolsCache = { claude: { pasteMode: 'pty' } };

    const promise = deliverBulkText('sess-1', 'hello');
    await promise;

    expect(mockPtyWrite).toHaveBeenCalledOnce();
    expect(mockPtyWrite).toHaveBeenCalledWith('sess-1', 'hello');
    expect(mockKeyboardTypeString).not.toHaveBeenCalled();
  });

  it('pasteMode sendkeys — calls keyboardTypeString once with full text, never ptyWrite', async () => {
    mockState.sessions = [{ id: 'sess-1', cliType: 'copilot' }];
    mockState.cliToolsCache = { copilot: { pasteMode: 'sendkeys' } };

    const promise = deliverBulkText('sess-1', 'hello');
    await promise;

    expect(mockKeyboardTypeString).toHaveBeenCalledOnce();
    expect(mockKeyboardTypeString).toHaveBeenCalledWith('hello');
    expect(mockPtyWrite).not.toHaveBeenCalled();
  });

  it('pasteMode sendkeysindividual — calls keyboardTypeString once per char, never ptyWrite', async () => {
    mockState.sessions = [{ id: 'sess-1', cliType: 'copilot' }];
    mockState.cliToolsCache = { copilot: { pasteMode: 'sendkeysindividual' } };

    // Run the async loop; advance timers to unblock each 20ms delay
    const promise = deliverBulkText('sess-1', 'abc');
    // Advance past all three 20ms delays (3 chars × 20ms = 60ms)
    await vi.runAllTimersAsync();
    await promise;

    expect(mockKeyboardTypeString).toHaveBeenCalledTimes(3);
    expect(mockKeyboardTypeString).toHaveBeenNthCalledWith(1, 'a');
    expect(mockKeyboardTypeString).toHaveBeenNthCalledWith(2, 'b');
    expect(mockKeyboardTypeString).toHaveBeenNthCalledWith(3, 'c');
    expect(mockPtyWrite).not.toHaveBeenCalled();
  });

  it('no session found — falls back to ptyWrite', async () => {
    // sessions is empty — no match for 'unknown'
    mockState.sessions = [];
    mockState.cliToolsCache = {};

    const promise = deliverBulkText('unknown', 'hello');
    await promise;

    expect(mockPtyWrite).toHaveBeenCalledOnce();
    expect(mockPtyWrite).toHaveBeenCalledWith('unknown', 'hello');
    expect(mockKeyboardTypeString).not.toHaveBeenCalled();
  });

  it('empty text — does nothing', async () => {
    mockState.sessions = [{ id: 'sess-1', cliType: 'copilot' }];
    mockState.cliToolsCache = { copilot: { pasteMode: 'sendkeysindividual' } };

    await deliverBulkText('sess-1', '');

    expect(mockPtyWrite).not.toHaveBeenCalled();
    expect(mockKeyboardTypeString).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Bracketed paste mode
  // ---------------------------------------------------------------------------

  describe('bracketed paste wrapping', () => {
    it('wraps text in bracketed paste markers when terminal has bracketedPasteMode enabled', async () => {
      mockState.sessions = [{ id: 'sess-1', cliType: 'claude' }];
      mockState.cliToolsCache = { claude: { pasteMode: 'pty' } };
      mockGetTerminalManager.mockReturnValue({
        getSession: (id: string) => id === 'sess-1' ? {
          view: { isBracketedPasteEnabled: () => true },
        } : undefined,
      });

      await deliverBulkText('sess-1', 'hello');

      expect(mockPtyWrite).toHaveBeenCalledOnce();
      expect(mockPtyWrite).toHaveBeenCalledWith('sess-1', '\x1b[200~hello\x1b[201~');
      expect(mockKeyboardTypeString).not.toHaveBeenCalled();
    });

    it('sends raw text when bracketedPasteMode is disabled', async () => {
      mockState.sessions = [{ id: 'sess-1', cliType: 'claude' }];
      mockState.cliToolsCache = { claude: { pasteMode: 'pty' } };
      mockGetTerminalManager.mockReturnValue({
        getSession: (id: string) => id === 'sess-1' ? {
          view: { isBracketedPasteEnabled: () => false },
        } : undefined,
      });

      await deliverBulkText('sess-1', 'hello');

      expect(mockPtyWrite).toHaveBeenCalledOnce();
      expect(mockPtyWrite).toHaveBeenCalledWith('sess-1', 'hello');
    });

    it('sends raw text when terminal manager is unavailable (fallback)', async () => {
      mockState.sessions = [{ id: 'sess-1', cliType: 'claude' }];
      mockState.cliToolsCache = { claude: { pasteMode: 'pty' } };
      mockGetTerminalManager.mockReturnValue(null);

      await deliverBulkText('sess-1', 'hello');

      expect(mockPtyWrite).toHaveBeenCalledOnce();
      expect(mockPtyWrite).toHaveBeenCalledWith('sess-1', 'hello');
    });

    it('sends raw text when session view is not found', async () => {
      mockState.sessions = [{ id: 'sess-1', cliType: 'claude' }];
      mockState.cliToolsCache = { claude: { pasteMode: 'pty' } };
      mockGetTerminalManager.mockReturnValue({
        getSession: () => undefined,
      });

      await deliverBulkText('sess-1', 'hello');

      expect(mockPtyWrite).toHaveBeenCalledOnce();
      expect(mockPtyWrite).toHaveBeenCalledWith('sess-1', 'hello');
    });

    it('does NOT wrap sendkeys mode even when bracketedPasteMode is enabled', async () => {
      mockState.sessions = [{ id: 'sess-1', cliType: 'copilot' }];
      mockState.cliToolsCache = { copilot: { pasteMode: 'sendkeys' } };
      mockGetTerminalManager.mockReturnValue({
        getSession: () => ({
          view: { isBracketedPasteEnabled: () => true },
        }),
      });

      await deliverBulkText('sess-1', 'hello');

      expect(mockKeyboardTypeString).toHaveBeenCalledOnce();
      expect(mockKeyboardTypeString).toHaveBeenCalledWith('hello');
      expect(mockPtyWrite).not.toHaveBeenCalled();
    });

    it('does NOT wrap sendkeysindividual mode even when bracketedPasteMode is enabled', async () => {
      mockState.sessions = [{ id: 'sess-1', cliType: 'copilot' }];
      mockState.cliToolsCache = { copilot: { pasteMode: 'sendkeysindividual' } };
      mockGetTerminalManager.mockReturnValue({
        getSession: () => ({
          view: { isBracketedPasteEnabled: () => true },
        }),
      });

      const promise = deliverBulkText('sess-1', 'ab');
      await vi.runAllTimersAsync();
      await promise;

      expect(mockKeyboardTypeString).toHaveBeenCalledTimes(2);
      expect(mockPtyWrite).not.toHaveBeenCalled();
    });

    it('wraps multiline text correctly in brackets', async () => {
      mockState.sessions = [{ id: 'sess-1', cliType: 'claude' }];
      mockState.cliToolsCache = { claude: { pasteMode: 'pty' } };
      mockGetTerminalManager.mockReturnValue({
        getSession: (id: string) => id === 'sess-1' ? {
          view: { isBracketedPasteEnabled: () => true },
        } : undefined,
      });

      await deliverBulkText('sess-1', 'line1\nline2\nline3');

      expect(mockPtyWrite).toHaveBeenCalledWith('sess-1', '\x1b[200~line1\nline2\nline3\x1b[201~');
    });
  });

  // ---------------------------------------------------------------------------
  // PTY individual mode (char-by-char PTY writes for Ink-based CLIs)
  // ---------------------------------------------------------------------------

  describe('ptyindividual mode', () => {
    it('writes each character individually to ptyWrite with delay', async () => {
      mockState.sessions = [{ id: 'sess-1', cliType: 'copilot' }];
      mockState.cliToolsCache = { copilot: { pasteMode: 'ptyindividual' } };

      const promise = deliverBulkText('sess-1', 'abc');
      await vi.runAllTimersAsync();
      await promise;

      expect(mockPtyWrite).toHaveBeenCalledTimes(3);
      expect(mockPtyWrite).toHaveBeenNthCalledWith(1, 'sess-1', 'a');
      expect(mockPtyWrite).toHaveBeenNthCalledWith(2, 'sess-1', 'b');
      expect(mockPtyWrite).toHaveBeenNthCalledWith(3, 'sess-1', 'c');
      expect(mockKeyboardTypeString).not.toHaveBeenCalled();
    });

    it('never uses keyboardTypeString', async () => {
      mockState.sessions = [{ id: 'sess-1', cliType: 'copilot' }];
      mockState.cliToolsCache = { copilot: { pasteMode: 'ptyindividual' } };

      const promise = deliverBulkText('sess-1', 'xy');
      await vi.runAllTimersAsync();
      await promise;

      expect(mockKeyboardTypeString).not.toHaveBeenCalled();
    });

    it('per-session lock prevents interleaved pastes', async () => {
      mockState.sessions = [{ id: 'sess-1', cliType: 'copilot' }];
      mockState.cliToolsCache = { copilot: { pasteMode: 'ptyindividual' } };

      const p1 = deliverBulkText('sess-1', 'ab');
      const p2 = deliverBulkText('sess-1', 'xy');

      await vi.runAllTimersAsync();
      await Promise.all([p1, p2]);

      // Only the first paste should have written (lock blocks second)
      expect(mockPtyWrite).toHaveBeenCalledTimes(2);
      expect(mockPtyWrite).toHaveBeenNthCalledWith(1, 'sess-1', 'a');
      expect(mockPtyWrite).toHaveBeenNthCalledWith(2, 'sess-1', 'b');
    });

    it('different sessions can paste concurrently', async () => {
      mockState.sessions = [
        { id: 'sess-1', cliType: 'copilot' },
        { id: 'sess-2', cliType: 'copilot' },
      ];
      mockState.cliToolsCache = { copilot: { pasteMode: 'ptyindividual' } };

      const p1 = deliverBulkText('sess-1', 'ab');
      const p2 = deliverBulkText('sess-2', 'xy');

      await vi.runAllTimersAsync();
      await Promise.all([p1, p2]);

      // Both sessions should have received their characters
      const calls = mockPtyWrite.mock.calls;
      const sess1Calls = calls.filter((c: any[]) => c[0] === 'sess-1');
      const sess2Calls = calls.filter((c: any[]) => c[0] === 'sess-2');
      expect(sess1Calls).toHaveLength(2);
      expect(sess2Calls).toHaveLength(2);
    });

    it('stops writing if session is removed mid-paste', async () => {
      mockState.sessions = [{ id: 'sess-1', cliType: 'copilot' }];
      mockState.cliToolsCache = { copilot: { pasteMode: 'ptyindividual' } };

      const promise = deliverBulkText('sess-1', 'abcdef');
      // Let 2 chars write, then remove the session
      await vi.advanceTimersByTimeAsync(25);
      mockState.sessions = [];
      await vi.runAllTimersAsync();
      await promise;

      // Should have written fewer than 6 characters
      expect(mockPtyWrite.mock.calls.length).toBeLessThan(6);
    });
  });

  describe('clippaste mode', () => {
    let mockFocus: ReturnType<typeof vi.fn>;
    let mockPaste: ReturnType<typeof vi.fn>;
    let mockSession: any;

    beforeEach(() => {
      mockFocus = vi.fn();
      mockPaste = vi.fn();

      mockSession = {
        id: 'sess-1',
        view: {
          focus: mockFocus,
          paste: mockPaste,
        }
      };

      const mockTerminalManager = {
        getSession: vi.fn().mockReturnValue(mockSession)
      };

      mockGetTerminalManager.mockReturnValue(mockTerminalManager);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('pasteMode clippaste — focuses terminal and writes through PTY', async () => {
      mockState.sessions = [{ id: 'sess-1', cliType: 'copilot' }];
      mockState.cliToolsCache = { copilot: { pasteMode: 'clippaste' } };

      await deliverBulkText('sess-1', 'test123');

      expect(mockFocus).toHaveBeenCalledOnce();
      expect(mockPtyWrite).toHaveBeenCalledWith('sess-1', 'test123');
      expect(mockPaste).not.toHaveBeenCalled();
    });

    it('pasteMode clippaste — returns early when session view is not found', async () => {
      mockState.sessions = [{ id: 'sess-1', cliType: 'copilot' }];
      mockState.cliToolsCache = { copilot: { pasteMode: 'clippaste' } };
      mockGetTerminalManager.mockReturnValue({ getSession: vi.fn().mockReturnValue(undefined) });

      await deliverBulkText('sess-1', 'test123');

      expect(mockFocus).not.toHaveBeenCalled();
      expect(mockPaste).not.toHaveBeenCalled();
      expect(mockPtyWrite).not.toHaveBeenCalled();
    });

    it('pasteMode clippaste — works with special characters', async () => {
      mockState.sessions = [{ id: 'sess-1', cliType: 'copilot' }];
      mockState.cliToolsCache = { copilot: { pasteMode: 'clippaste' } };

      const specialText = 'Hello\nWorld\t"Special" & chars 🚀';
      await deliverBulkText('sess-1', specialText);

      expect(mockFocus).toHaveBeenCalledOnce();
      expect(mockPtyWrite).toHaveBeenCalledWith('sess-1', specialText);
      expect(mockPaste).not.toHaveBeenCalled();
    });

    it('pasteMode clippaste — does nothing with empty text', async () => {
      mockState.sessions = [{ id: 'sess-1', cliType: 'copilot' }];
      mockState.cliToolsCache = { copilot: { pasteMode: 'clippaste' } };

      await deliverBulkText('sess-1', '');

      expect(mockFocus).not.toHaveBeenCalled();
      expect(mockPtyWrite).not.toHaveBeenCalled();
    });

    it('pasteMode clippaste — does not add bracketed paste markers', async () => {
      mockState.sessions = [{ id: 'sess-1', cliType: 'copilot' }];
      mockState.cliToolsCache = { copilot: { pasteMode: 'clippaste' } };
      mockSession.view.isBracketedPasteEnabled = vi.fn().mockReturnValue(true);

      await deliverBulkText('sess-1', 'test123');

      expect(mockFocus).toHaveBeenCalledOnce();
      expect(mockPtyWrite).toHaveBeenCalledWith('sess-1', 'test123');
      expect(mockPaste).not.toHaveBeenCalled();
    });
  });
});
