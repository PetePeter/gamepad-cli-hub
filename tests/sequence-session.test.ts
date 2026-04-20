// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — must be declared before vi.mock calls
// ---------------------------------------------------------------------------

const { mockDeliverBulkText, mockGetTerminalManager } = vi.hoisted(() => ({
  mockDeliverBulkText: vi.fn().mockResolvedValue(undefined),
  mockGetTerminalManager: vi.fn().mockReturnValue(null),
}));

vi.mock('../renderer/paste-handler.js', () => ({
  deliverBulkText: mockDeliverBulkText,
}));

vi.mock('../renderer/runtime/terminal-provider.js', () => ({
  getTerminalManager: mockGetTerminalManager,
}));

vi.mock('../renderer/state.js', () => ({
  state: {
    sessions: [],
    cliToolsCache: {},
    cliBindingsCache: {},
    cliSequencesCache: {},
    cliTypes: [],
    activeSessionId: null,
  },
}));

vi.mock('../renderer/utils.js', () => ({
  logEvent: vi.fn(),
}));

import { executeSequenceForSession, executeSequence } from '../renderer/bindings';

// ============================================================================
// Helpers
// ============================================================================

let mockPtyWrite: ReturnType<typeof vi.fn>;

/** Tracks global call ordering across both mockDeliverBulkText and mockPtyWrite. */
let callOrder: Array<{ fn: string; args: unknown[] }>;

beforeEach(() => {
  callOrder = [];

  mockPtyWrite = vi.fn().mockImplementation((...args: unknown[]) => {
    callOrder.push({ fn: 'ptyWrite', args });
    return Promise.resolve({ success: true });
  });

  (window as any).gamepadCli = { ptyWrite: mockPtyWrite };

  mockDeliverBulkText.mockImplementation((...args: unknown[]) => {
    callOrder.push({ fn: 'deliverBulkText', args });
    return Promise.resolve(undefined);
  });
  mockDeliverBulkText.mockClear();

  mockGetTerminalManager.mockReturnValue({
    getActiveSessionId: () => 'active-sess',
  });
});

afterEach(() => {
  vi.useRealTimers();
  delete (window as any).gamepadCli;
});

// ============================================================================
// executeSequenceForSession — text routing
// ============================================================================

describe('executeSequenceForSession — text routing', () => {
  it('routes plain text through deliverBulkText', async () => {
    await executeSequenceForSession('sess-1', 'hello world');

    expect(mockDeliverBulkText).toHaveBeenCalledWith('sess-1', 'hello world');
    expect(mockPtyWrite).not.toHaveBeenCalled();
  });

  it('coalesces text plus Enter into one bulk delivery', async () => {
    await executeSequenceForSession('sess-1', 'hello{Enter}');

    expect(mockDeliverBulkText).toHaveBeenCalledTimes(1);
    expect(mockDeliverBulkText).toHaveBeenCalledWith('sess-1', 'hello\r');
    expect(mockPtyWrite).not.toHaveBeenCalled();
  });

  it('coalesces multiple Enter tokens with surrounding text', async () => {
    await executeSequenceForSession('sess-1', 'line1{Enter}line2{Enter}');

    expect(callOrder).toEqual([
      { fn: 'deliverBulkText', args: ['sess-1', 'line1\rline2\r'] },
    ]);
  });

  it('handles escaped braces as literal text', async () => {
    await executeSequenceForSession('sess-1', '{{json}}');

    expect(mockDeliverBulkText).toHaveBeenCalledWith('sess-1', '{json}');
  });
});

// ============================================================================
// executeSequenceForSession — {Send} routing
// ============================================================================

describe('executeSequenceForSession — {Send} routing', () => {
  it('{Send} flushes text then sends \\r via ptyWrite', async () => {
    await executeSequenceForSession('sess-1', 'hello{Send}');

    expect(mockDeliverBulkText).toHaveBeenCalledTimes(1);
    expect(mockDeliverBulkText).toHaveBeenCalledWith('sess-1', 'hello');
    expect(mockPtyWrite).toHaveBeenCalledTimes(1);
    expect(mockPtyWrite).toHaveBeenCalledWith('sess-1', '\r');
  });

  it('{Send}-only sends \\r via ptyWrite', async () => {
    await executeSequenceForSession('sess-1', '{Send}');

    expect(mockDeliverBulkText).not.toHaveBeenCalled();
    expect(mockPtyWrite).toHaveBeenCalledTimes(1);
    expect(mockPtyWrite).toHaveBeenCalledWith('sess-1', '\r');
  });

  it('mixed {Enter} and {Send}', async () => {
    await executeSequenceForSession('sess-1', 'cmd{Enter}arg{Send}');

    expect(mockDeliverBulkText).toHaveBeenCalledTimes(1);
    expect(mockDeliverBulkText).toHaveBeenCalledWith('sess-1', 'cmd\rarg');
    expect(mockPtyWrite).toHaveBeenCalledTimes(1);
    expect(mockPtyWrite).toHaveBeenCalledWith('sess-1', '\r');
  });
});

// ============================================================================
// executeSequenceForSession — key routing
// ============================================================================

describe('executeSequenceForSession — key routing', () => {
  it('routes {Tab} through ptyWrite with escape code', async () => {
    await executeSequenceForSession('sess-1', '{Tab}');

    expect(mockPtyWrite).toHaveBeenCalledWith('sess-1', '\t');
    expect(mockDeliverBulkText).not.toHaveBeenCalled();
  });

  it('routes {Escape} through ptyWrite', async () => {
    await executeSequenceForSession('sess-1', '{Escape}');

    expect(mockPtyWrite).toHaveBeenCalledWith('sess-1', '\x1b');
  });

  it('routes {Backspace} through ptyWrite', async () => {
    await executeSequenceForSession('sess-1', '{Backspace}');

    expect(mockPtyWrite).toHaveBeenCalledWith('sess-1', '\x7f');
  });

  it('routes arrow keys through ptyWrite', async () => {
    await executeSequenceForSession('sess-1', '{Up}');

    expect(mockPtyWrite).toHaveBeenCalledWith('sess-1', '\x1b[A');
  });
});

// ============================================================================
// executeSequenceForSession — combo routing
// ============================================================================

describe('executeSequenceForSession — combo routing', () => {
  it('routes {Ctrl+C} through ptyWrite as control character', async () => {
    await executeSequenceForSession('sess-1', '{Ctrl+C}');

    expect(mockPtyWrite).toHaveBeenCalledWith('sess-1', '\x03');
  });

  it('routes {Ctrl+Z} through ptyWrite', async () => {
    await executeSequenceForSession('sess-1', '{Ctrl+Z}');

    expect(mockPtyWrite).toHaveBeenCalledWith('sess-1', '\x1a');
  });
});

// ============================================================================
// executeSequenceForSession — mixed sequences
// ============================================================================

describe('executeSequenceForSession — mixed sequences', () => {
  it('flushes text before key actions', async () => {
    await executeSequenceForSession('sess-1', 'hello{Tab}world');

    expect(callOrder).toEqual([
      { fn: 'deliverBulkText', args: ['sess-1', 'hello'] },
      { fn: 'ptyWrite', args: ['sess-1', '\t'] },
      { fn: 'deliverBulkText', args: ['sess-1', 'world'] },
    ]);
  });

  it('handles text + Enter + key + text sequence', async () => {
    await executeSequenceForSession('sess-1', 'cmd{Enter}{Tab}next');

    expect(callOrder).toEqual([
      { fn: 'deliverBulkText', args: ['sess-1', 'cmd\r'] },
      { fn: 'ptyWrite', args: ['sess-1', '\t'] },
      { fn: 'deliverBulkText', args: ['sess-1', 'next'] },
    ]);
  });

  it('handles complex mixed sequence', async () => {
    await executeSequenceForSession('sess-1', 'text{Ctrl+C}{Wait 100}more{Enter}');

    expect(callOrder[0]).toEqual({ fn: 'deliverBulkText', args: ['sess-1', 'text'] });
    expect(callOrder[1]).toEqual({ fn: 'ptyWrite', args: ['sess-1', '\x03'] });
    // after the wait: Enter coalesces with text
    expect(callOrder[2]).toEqual({ fn: 'deliverBulkText', args: ['sess-1', 'more\r'] });
  });
});

// ============================================================================
// executeSequenceForSession — wait handling
// ============================================================================

describe('executeSequenceForSession — wait handling', () => {
  it('{Wait N} pauses execution', async () => {
    vi.useFakeTimers();

    const promise = executeSequenceForSession('sess-1', 'before{Wait 200}after');

    // Let microtasks settle so 'before' is flushed
    await vi.advanceTimersByTimeAsync(0);
    expect(mockDeliverBulkText).toHaveBeenCalledTimes(1);
    expect(mockDeliverBulkText).toHaveBeenCalledWith('sess-1', 'before');

    // Advance past the wait
    await vi.advanceTimersByTimeAsync(200);
    await promise;

    expect(mockDeliverBulkText).toHaveBeenCalledTimes(2);
    expect(mockDeliverBulkText).toHaveBeenCalledWith('sess-1', 'after');
  });
});

// ============================================================================
// executeSequenceForSession — guards
// ============================================================================

describe('executeSequenceForSession — guards', () => {
  it('returns early when ptyWrite is not available', async () => {
    (window as any).gamepadCli = {}; // no ptyWrite

    await executeSequenceForSession('sess-1', 'hello{Enter}');

    expect(mockDeliverBulkText).not.toHaveBeenCalled();
  });

  it('returns early when gamepadCli is undefined', async () => {
    (window as any).gamepadCli = undefined;

    await executeSequenceForSession('sess-1', 'hello');

    expect(mockDeliverBulkText).not.toHaveBeenCalled();
  });
});

// ============================================================================
// executeSequenceForSession — session pinning
// ============================================================================

describe('executeSequenceForSession — session pinning', () => {
  it('all actions target the specified session, not the active terminal', async () => {
    mockGetTerminalManager.mockReturnValue({
      getActiveSessionId: () => 'other-sess',
    });

    await executeSequenceForSession('sess-1', 'hello{Tab}world');

    // Every call must use 'sess-1'
    for (const call of callOrder) {
      expect(call.args[0]).toBe('sess-1');
    }
    // Confirm 'other-sess' never appears
    for (const call of callOrder) {
      expect(call.args[0]).not.toBe('other-sess');
    }
  });
});

// ============================================================================
// executeSequence — thin wrapper
// ============================================================================

describe('executeSequence — thin wrapper', () => {
  it('delegates to executeSequenceForSession with active session', async () => {
    mockGetTerminalManager.mockReturnValue({
      getActiveSessionId: () => 'active-123',
    });

    await executeSequence('hello{Enter}');

    expect(mockDeliverBulkText).toHaveBeenCalledWith('active-123', 'hello\r');
    expect(mockPtyWrite).not.toHaveBeenCalled();
  });

  it('returns early when no active terminal', async () => {
    mockGetTerminalManager.mockReturnValue({
      getActiveSessionId: () => null,
    });

    await executeSequence('hello');

    expect(mockDeliverBulkText).not.toHaveBeenCalled();
  });

  it('returns early when terminal manager is null', async () => {
    mockGetTerminalManager.mockReturnValue(null);

    await executeSequence('hello');

    expect(mockDeliverBulkText).not.toHaveBeenCalled();
  });
});
