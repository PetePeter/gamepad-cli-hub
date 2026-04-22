// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockState, mockGetTerminalManager } = vi.hoisted(() => ({
  mockState: {
    sessions: [] as Array<{ id: string; cliType: string }>,
    cliToolsCache: {} as Record<string, { pasteMode?: string }>,
  },
  mockGetTerminalManager: vi.fn().mockReturnValue(null),
}));

vi.mock('../renderer/bindings', () => ({
  keyToPtyEscape: (key: string) => {
    const map: Record<string, string> = {
      'Enter': '\r', 'Tab': '\t', 'Escape': '\x1b', 'Backspace': '\x7f',
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

vi.mock('../renderer/editor/editor-popup.js', () => ({ showEditorPopup: vi.fn() }));
vi.mock('../renderer/state.js', () => ({ state: mockState }));
vi.mock('../renderer/runtime/terminal-provider.js', () => ({ getTerminalManager: mockGetTerminalManager }));
vi.mock('../renderer/drafts/draft-editor.js', () => ({ isDraftEditorVisible: () => false }));

import { deliverBulkText } from '../renderer/paste-handler';

// =============================================================================
// Regression tests: deliverBulkText must NEVER parse sequence tokens.
// It sends text literally — {Enter} stays as "{Enter}", not "\r".
// =============================================================================

describe('deliverBulkText sends text literally (no sequence parsing)', () => {
  let mockPtyWrite: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockPtyWrite = vi.fn().mockResolvedValue({ success: true });
    (window as any).gamepadCli = { ptyWrite: mockPtyWrite };
    mockState.sessions = [{ id: 'sess-1', cliType: 'claude-code' }];
    mockState.cliToolsCache = {};
  });

  it('sends {Enter} as literal text, not carriage return', async () => {
    await deliverBulkText('sess-1', 'hello{Enter}world');
    expect(mockPtyWrite).toHaveBeenCalledWith('sess-1', 'hello{Enter}world');
  });

  it('sends {Tab} as literal text', async () => {
    await deliverBulkText('sess-1', 'hello{Tab}world');
    expect(mockPtyWrite).toHaveBeenCalledWith('sess-1', 'hello{Tab}world');
  });

  it('sends {Ctrl+C} as literal text', async () => {
    await deliverBulkText('sess-1', '{Ctrl+C}');
    expect(mockPtyWrite).toHaveBeenCalledWith('sess-1', '{Ctrl+C}');
  });

  it('sends {Wait 500} as literal text', async () => {
    await deliverBulkText('sess-1', '{Wait 500}');
    expect(mockPtyWrite).toHaveBeenCalledWith('sess-1', '{Wait 500}');
  });

  it('sends escaped braces as literal text', async () => {
    await deliverBulkText('sess-1', '{{json}}');
    expect(mockPtyWrite).toHaveBeenCalledWith('sess-1', '{{json}}');
  });

  it('sends brace-heavy JSON content literally', async () => {
    const json = '{"key": "value", "nested": {"a": 1}}';
    await deliverBulkText('sess-1', json);
    expect(mockPtyWrite).toHaveBeenCalledWith('sess-1', json);
  });

  it('sends template-like content literally', async () => {
    const text = 'function() { return {Enter}; }';
    await deliverBulkText('sess-1', text);
    expect(mockPtyWrite).toHaveBeenCalledWith('sess-1', text);
  });
});

describe('deliverBulkText preserves literal text in ptyindividual mode', () => {
  let mockPtyWrite: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockPtyWrite = vi.fn().mockResolvedValue({ success: true });
    (window as any).gamepadCli = { ptyWrite: mockPtyWrite };
    mockState.sessions = [{ id: 'sess-1', cliType: 'claude-code' }];
    mockState.cliToolsCache = { 'claude-code': { pasteMode: 'ptyindividual' } };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends each character of {Enter} individually — proving no token parsing', async () => {
    const promise = deliverBulkText('sess-1', '{Enter}');
    // Advance through all the setTimeout delays for each character
    await vi.runAllTimersAsync();
    await promise;

    // 7 chars: { E n t e r }
    expect(mockPtyWrite).toHaveBeenCalledTimes(7);
    expect(mockPtyWrite).toHaveBeenNthCalledWith(1, 'sess-1', '{');
    expect(mockPtyWrite).toHaveBeenNthCalledWith(2, 'sess-1', 'E');
    expect(mockPtyWrite).toHaveBeenNthCalledWith(3, 'sess-1', 'n');
    expect(mockPtyWrite).toHaveBeenNthCalledWith(4, 'sess-1', 't');
    expect(mockPtyWrite).toHaveBeenNthCalledWith(5, 'sess-1', 'e');
    expect(mockPtyWrite).toHaveBeenNthCalledWith(6, 'sess-1', 'r');
    expect(mockPtyWrite).toHaveBeenNthCalledWith(7, 'sess-1', '}');
  });
});

describe('deliverBulkText preserves literal text in clippaste mode', () => {
  let mockPtyWrite: ReturnType<typeof vi.fn>;
  let mockFocus: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockPtyWrite = vi.fn().mockResolvedValue({ success: true });
    mockFocus = vi.fn();
    (window as any).gamepadCli = { ptyWrite: mockPtyWrite };
    mockState.sessions = [{ id: 'sess-1', cliType: 'claude-code' }];
    mockState.cliToolsCache = { 'claude-code': { pasteMode: 'clippaste' } };
    mockGetTerminalManager.mockReturnValue({
      getSession: (id: string) => ({
        view: {
          focus: mockFocus,
          isBracketedPasteEnabled: () => false,
        },
      }),
    });
  });

  it('sends literal text through the PTY-owned clippaste path', async () => {
    await deliverBulkText('sess-1', 'hello{Enter}');

    expect(mockFocus).toHaveBeenCalled();
    expect(mockPtyWrite).toHaveBeenCalledWith('sess-1', 'hello{Enter}');
  });
});

describe('deliverBulkText wraps with bracketed paste markers in pty mode', () => {
  let mockPtyWrite: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockPtyWrite = vi.fn().mockResolvedValue({ success: true });
    (window as any).gamepadCli = { ptyWrite: mockPtyWrite };
    mockState.sessions = [{ id: 'sess-1', cliType: 'claude-code' }];
    mockState.cliToolsCache = {};
  });

  it('wraps literal text in bracketed paste when enabled', async () => {
    mockGetTerminalManager.mockReturnValue({
      getSession: (id: string) => ({
        view: {
          isBracketedPasteEnabled: () => true,
          focus: vi.fn(),
          paste: vi.fn(),
        },
      }),
    });

    await deliverBulkText('sess-1', 'hello{Enter}');

    expect(mockPtyWrite).toHaveBeenCalledWith('sess-1', '\x1b[200~hello{Enter}\x1b[201~');
  });
});
