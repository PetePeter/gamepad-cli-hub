// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Polyfill ResizeObserver for jsdom
// ---------------------------------------------------------------------------

class MockResizeObserver {
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = MockResizeObserver;

// ---------------------------------------------------------------------------
// Shared mock references (declared before vi.mock for closure access)
// ---------------------------------------------------------------------------

const mockTerminalManager = {
  getActiveSessionId: vi.fn().mockReturnValue(null),
};

let mockGetTerminalManager = vi.fn().mockReturnValue(null);

const mockGamepadCli = {
  keyboardComboDown: vi.fn().mockResolvedValue({ success: true }),
  keyboardComboUp: vi.fn().mockResolvedValue({ success: true }),
  keyboardSendKeys: vi.fn().mockResolvedValue({ success: true }),
  ptyWrite: vi.fn().mockResolvedValue({ success: true }),
};

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

vi.mock('../renderer/main', () => ({
  getTerminalManager: (...args: any[]) => mockGetTerminalManager(...args),
}));

vi.mock('../renderer/utils', () => ({
  logEvent: vi.fn(),
  showScreen: vi.fn(),
  updateProfileDisplay: vi.fn(),
  getCliDisplayName: vi.fn((ct: string) => ct),
  toDirection: vi.fn(),
  getSequenceSyntaxHelpText: vi.fn().mockReturnValue(''),
}));

vi.mock('../renderer/screens/sessions', () => ({
  loadSessions: vi.fn(),
  spawnNewSession: vi.fn(),
}));

vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn(function (this: any) {
    Object.assign(this, {
      loadAddon: vi.fn(), open: vi.fn(), write: vi.fn(), focus: vi.fn(),
      blur: vi.fn(), clear: vi.fn(), dispose: vi.fn(), scrollToBottom: vi.fn(),
      scrollLines: vi.fn(),
      onData: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      onResize: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      cols: 120, rows: 30,
    });
    return this;
  }),
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn(function (this: any) {
    Object.assign(this, { fit: vi.fn() });
    return this;
  }),
}));

vi.mock('@xterm/addon-web-links', () => ({
  WebLinksAddon: vi.fn(function (this: any) { return this; }),
}));

vi.mock('@xterm/addon-search', () => ({
  SearchAddon: vi.fn(function (this: any) {
    Object.assign(this, {
      findNext: vi.fn().mockReturnValue(true),
      findPrevious: vi.fn().mockReturnValue(false),
    });
    return this;
  }),
}));

// ---------------------------------------------------------------------------
// Import after mocks are set up
// ---------------------------------------------------------------------------

import { processConfigBinding, processConfigRelease, releaseAllHeldKeys } from '../renderer/bindings';
import { state } from '../renderer/state';

// ============================================================================
// Tests
// ============================================================================

describe('keyboard binding target routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Release any held keys from previous tests
    releaseAllHeldKeys();
    vi.clearAllMocks();

    // Set up window.gamepadCli mock
    (window as any).gamepadCli = mockGamepadCli;

    // Reset state
    state.activeSessionId = 'session-1';
    state.sessions = [{ id: 'session-1', cliType: 'claude-code', title: 'Test', pid: 123 }];
    state.cliBindingsCache = {};
    state.globalBindings = {};

    // Default: terminal manager returns an active session (embedded terminal)
    mockTerminalManager.getActiveSessionId.mockReturnValue('session-1');
    mockGetTerminalManager.mockReturnValue(mockTerminalManager);
  });

  describe('hold: true always uses robotjs (OS-level)', () => {
    it('uses keyboardComboDown when terminal is active', async () => {
      state.cliBindingsCache['claude-code'] = {
        RightTrigger: { action: 'keyboard', keys: ['Ctrl', 'Alt'], hold: true },
      };

      processConfigBinding('RightTrigger');
      await new Promise(r => setTimeout(r, 10));

      expect(mockGamepadCli.keyboardComboDown).toHaveBeenCalledWith(['Ctrl', 'Alt']);
      expect(mockGamepadCli.ptyWrite).not.toHaveBeenCalled();
    });

    it('does NOT route hold binding through PTY', async () => {
      state.cliBindingsCache['claude-code'] = {
        A: { action: 'keyboard', keys: ['Space'], hold: true },
      };

      processConfigBinding('A');
      await new Promise(r => setTimeout(r, 10));

      expect(mockGamepadCli.keyboardComboDown).toHaveBeenCalledWith(['Space']);
      expect(mockGamepadCli.ptyWrite).not.toHaveBeenCalled();
    });
  });

  describe('target: "os" always uses robotjs', () => {
    it('sends keys via robotjs when target is os and terminal is active', async () => {
      state.cliBindingsCache['claude-code'] = {
        LeftBumper: { action: 'keyboard', keys: ['Ctrl', 'Shift', 'c'], target: 'os' },
      };

      processConfigBinding('LeftBumper');
      await new Promise(r => setTimeout(r, 10));

      expect(mockGamepadCli.keyboardSendKeys).toHaveBeenCalledWith(['Ctrl', 'Shift', 'c']);
      expect(mockGamepadCli.ptyWrite).not.toHaveBeenCalled();
    });

    it('sends keys via robotjs when target is os and hold is true', async () => {
      state.cliBindingsCache['claude-code'] = {
        RightTrigger: { action: 'keyboard', keys: ['Ctrl', 'Alt'], hold: true, target: 'os' },
      };

      processConfigBinding('RightTrigger');
      await new Promise(r => setTimeout(r, 10));

      expect(mockGamepadCli.keyboardComboDown).toHaveBeenCalledWith(['Ctrl', 'Alt']);
      expect(mockGamepadCli.ptyWrite).not.toHaveBeenCalled();
    });
  });

  describe('target: "terminal" routes to PTY (same as default)', () => {
    it('routes to PTY when target is explicitly terminal', async () => {
      state.cliBindingsCache['claude-code'] = {
        B: { action: 'keyboard', keys: ['Escape'], target: 'terminal' },
      };

      processConfigBinding('B');
      await new Promise(r => setTimeout(r, 10));

      expect(mockGamepadCli.ptyWrite).toHaveBeenCalled();
      expect(mockGamepadCli.keyboardSendKeys).not.toHaveBeenCalled();
    });
  });

  describe('default target routes to PTY when terminal active', () => {
    it('routes to PTY when no target specified and terminal is active', async () => {
      state.cliBindingsCache['claude-code'] = {
        A: { action: 'keyboard', keys: ['Enter'] },
      };

      processConfigBinding('A');
      await new Promise(r => setTimeout(r, 10));

      expect(mockGamepadCli.ptyWrite).toHaveBeenCalled();
      expect(mockGamepadCli.keyboardSendKeys).not.toHaveBeenCalled();
    });

    it('routes to robotjs when no terminal active', async () => {
      mockGetTerminalManager.mockReturnValue(null);

      state.cliBindingsCache['claude-code'] = {
        A: { action: 'keyboard', keys: ['Enter'] },
      };

      processConfigBinding('A');
      await new Promise(r => setTimeout(r, 10));

      expect(mockGamepadCli.keyboardSendKeys).toHaveBeenCalledWith(['Enter']);
      expect(mockGamepadCli.ptyWrite).not.toHaveBeenCalled();
    });
  });

  describe('processConfigRelease always releases held keys', () => {
    it('releases via robotjs even when terminal is active', async () => {
      // First, hold a key
      state.cliBindingsCache['claude-code'] = {
        RightTrigger: { action: 'keyboard', keys: ['Ctrl', 'Alt'], hold: true },
      };
      processConfigBinding('RightTrigger');
      await new Promise(r => setTimeout(r, 10));

      expect(mockGamepadCli.keyboardComboDown).toHaveBeenCalledWith(['Ctrl', 'Alt']);

      // Terminal is still active
      mockTerminalManager.getActiveSessionId.mockReturnValue('session-1');

      // Release
      processConfigRelease('RightTrigger');

      expect(mockGamepadCli.keyboardComboUp).toHaveBeenCalledWith(['Ctrl', 'Alt']);
    });

    it('does nothing for buttons that are not held', () => {
      processConfigRelease('A');
      expect(mockGamepadCli.keyboardComboUp).not.toHaveBeenCalled();
    });
  });

  describe('releaseAllHeldKeys', () => {
    it('releases all held keys via robotjs regardless of terminal state', async () => {
      state.cliBindingsCache['claude-code'] = {
        RightTrigger: { action: 'keyboard', keys: ['Ctrl', 'Alt'], hold: true },
        LeftTrigger: { action: 'keyboard', keys: ['Space'], hold: true },
      };

      processConfigBinding('RightTrigger');
      processConfigBinding('LeftTrigger');
      await new Promise(r => setTimeout(r, 10));

      // Terminal still active
      mockTerminalManager.getActiveSessionId.mockReturnValue('session-1');

      releaseAllHeldKeys();

      expect(mockGamepadCli.keyboardComboUp).toHaveBeenCalledWith(['Ctrl', 'Alt']);
      expect(mockGamepadCli.keyboardComboUp).toHaveBeenCalledWith(['Space']);
    });
  });
});
