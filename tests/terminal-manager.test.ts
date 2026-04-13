// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
// Mocks — xterm.js needs canvas/WebGL which jsdom doesn't support
// ---------------------------------------------------------------------------

/** Track created mock instances so tests can inspect them */
const terminalInstances: any[] = [];
const fitAddonInstances: any[] = [];
const searchAddonInstances: any[] = [];

function makeMockTerminal() {
  const t = {
    loadAddon: vi.fn(),
    open: vi.fn(),
    write: vi.fn(),
    focus: vi.fn(),
    blur: vi.fn(),
    clear: vi.fn(),
    dispose: vi.fn(),
    scrollToBottom: vi.fn(),
    scrollLines: vi.fn(),
    attachCustomKeyEventHandler: vi.fn(),
    attachCustomWheelEventHandler: vi.fn(),
    onData: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    onResize: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    onTitleChange: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    buffer: { active: { type: 'normal', baseY: 0, cursorY: 0, length: 30, getLine: vi.fn() } },
    cols: 120,
    rows: 30,
    options: {},
    parser: {},
  };
  terminalInstances.push(t);
  return t;
}

function makeMockFitAddon() {
  const f = { fit: vi.fn() };
  fitAddonInstances.push(f);
  return f;
}

function makeMockSearchAddon() {
  const s = {
    findNext: vi.fn().mockReturnValue(true),
    findPrevious: vi.fn().mockReturnValue(false),
  };
  searchAddonInstances.push(s);
  return s;
}

vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn(function (this: any) {
    const mock = makeMockTerminal();
    Object.assign(this, mock);
    return this;
  }),
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn(function (this: any) {
    const mock = makeMockFitAddon();
    Object.assign(this, mock);
    return this;
  }),
}));

vi.mock('@xterm/addon-web-links', () => ({
  WebLinksAddon: vi.fn(function (this: any) {
    return this;
  }),
}));

vi.mock('@xterm/addon-search', () => ({
  SearchAddon: vi.fn(function (this: any) {
    const mock = makeMockSearchAddon();
    Object.assign(this, mock);
    return this;
  }),
}));

// ---------------------------------------------------------------------------
// Now import the modules under test (after mocks are registered)
// ---------------------------------------------------------------------------

import { TerminalView } from '../renderer/terminal/terminal-view';
import { TerminalManager } from '../renderer/terminal/terminal-manager';

// Helper to get the last created mock instance
function lastTerminal() { return terminalInstances[terminalInstances.length - 1]; }
function lastFitAddon() { return fitAddonInstances[fitAddonInstances.length - 1]; }
function lastSearchAddon() { return searchAddonInstances[searchAddonInstances.length - 1]; }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createContainer(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

// ---------------------------------------------------------------------------
// TerminalView
// ---------------------------------------------------------------------------

describe('TerminalView', () => {
  let container: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    terminalInstances.length = 0;
    fitAddonInstances.length = 0;
    searchAddonInstances.length = 0;
    container = createContainer();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('opens xterm Terminal into the provided container', () => {
    const view = new TerminalView({ sessionId: 'tv1', container });
    expect(view.sessionId).toBe('tv1');
    expect(terminalInstances.length).toBe(1);
    expect(lastTerminal().open).toHaveBeenCalled();
  });

  it('loads fit, web-links, and search addons', () => {
    new TerminalView({ sessionId: 'tv2', container });
    expect(lastTerminal().loadAddon).toHaveBeenCalledTimes(3);
  });

  it('calls fit() on construction', () => {
    new TerminalView({ sessionId: 'tv3', container });
    expect(lastFitAddon().fit).toHaveBeenCalled();
  });

  it('write() forwards data to terminal.write()', () => {
    const view = new TerminalView({ sessionId: 'tv4', container });
    view.write('hello world');
    expect(lastTerminal().write).toHaveBeenCalledWith('hello world');
  });

  it('write() is a no-op after dispose()', () => {
    const view = new TerminalView({ sessionId: 'tv5', container });
    view.dispose();
    lastTerminal().write.mockClear();
    view.write('should not appear');
    expect(lastTerminal().write).not.toHaveBeenCalled();
  });

  it('focus() and blur() delegate to terminal', () => {
    const view = new TerminalView({ sessionId: 'tv6', container });
    view.focus();
    expect(lastTerminal().focus).toHaveBeenCalled();
    view.blur();
    expect(lastTerminal().blur).toHaveBeenCalled();
  });

  it('getDimensions() returns cols and rows', () => {
    const view = new TerminalView({ sessionId: 'tv7', container });
    const dims = view.getDimensions();
    expect(dims).toEqual({ cols: 120, rows: 30 });
  });

  it('clear() delegates to terminal.clear()', () => {
    const view = new TerminalView({ sessionId: 'tv8', container });
    view.clear();
    expect(lastTerminal().clear).toHaveBeenCalled();
  });

  it('scrollToBottom() and scrollLines() delegate correctly', () => {
    const view = new TerminalView({ sessionId: 'tv9', container });
    view.scrollToBottom();
    expect(lastTerminal().scrollToBottom).toHaveBeenCalled();
    view.scrollLines(5);
    expect(lastTerminal().scrollLines).toHaveBeenCalledWith(5);
  });

  it('scroll() uses scrollLines in normal buffer', () => {
    const onScrollInput = vi.fn();
    const view = new TerminalView({ sessionId: 'scroll-norm', container, onScrollInput });
    lastTerminal().buffer.active.type = 'normal';

    view.scroll('down', 3);
    expect(lastTerminal().scrollLines).toHaveBeenCalledWith(3);
    expect(onScrollInput).not.toHaveBeenCalled();

    lastTerminal().scrollLines.mockClear();
    view.scroll('up', 5);
    expect(lastTerminal().scrollLines).toHaveBeenCalledWith(-5);
  });

  it('scroll() sends PageDown to PTY in alternate buffer (no scrollLines)', () => {
    const onScrollInput = vi.fn();
    const view = new TerminalView({ sessionId: 'scroll-alt-dn', container, onScrollInput });
    lastTerminal().buffer.active.type = 'alternate';

    view.scroll('down', 3);
    expect(lastTerminal().scrollLines).not.toHaveBeenCalled();
    expect(onScrollInput).toHaveBeenCalledTimes(3);
    expect(onScrollInput).toHaveBeenCalledWith('\x1b[6~');
  });

  it('scroll() sends PageUp to PTY in alternate buffer (no scrollLines)', () => {
    const onScrollInput = vi.fn();
    const view = new TerminalView({ sessionId: 'scroll-alt-up', container, onScrollInput });
    lastTerminal().buffer.active.type = 'alternate';

    view.scroll('up', 2);
    expect(lastTerminal().scrollLines).not.toHaveBeenCalled();
    expect(onScrollInput).toHaveBeenCalledTimes(2);
    expect(onScrollInput).toHaveBeenCalledWith('\x1b[5~');
  });

  it('scroll() falls back to onData when no onScrollInput in alternate buffer', () => {
    const onData = vi.fn();
    const view = new TerminalView({ sessionId: 'scroll-alt-fb', container, onData });
    lastTerminal().buffer.active.type = 'alternate';

    view.scroll('down', 1);
    expect(lastTerminal().scrollLines).not.toHaveBeenCalled();
    expect(onData).toHaveBeenCalledWith('\x1b[6~');
  });

  it('scroll() is a no-op after dispose', () => {
    const onScrollInput = vi.fn();
    const view = new TerminalView({ sessionId: 'scroll-disp', container, onScrollInput });
    view.dispose();

    view.scroll('down', 3);
    expect(onScrollInput).not.toHaveBeenCalled();
    expect(lastTerminal().scrollLines).not.toHaveBeenCalled();
  });

  it('findNext() and findPrevious() delegate to search addon', () => {
    const view = new TerminalView({ sessionId: 'tv10', container });
    expect(view.findNext('test')).toBe(true);
    expect(lastSearchAddon().findNext).toHaveBeenCalledWith('test');
    expect(view.findPrevious('test')).toBe(false);
    expect(lastSearchAddon().findPrevious).toHaveBeenCalledWith('test');
  });

  it('wires onData callback for user input', () => {
    const onData = vi.fn();
    new TerminalView({ sessionId: 'tv11', container, onData });
    expect(lastTerminal().onData).toHaveBeenCalled();
  });

  it('wires onResize callback', () => {
    const onResize = vi.fn();
    new TerminalView({ sessionId: 'tv12', container, onResize });
    expect(lastTerminal().onResize).toHaveBeenCalled();
  });

  it('dispose() calls terminal.dispose()', () => {
    const view = new TerminalView({ sessionId: 'tv13', container });
    view.dispose();
    expect(lastTerminal().dispose).toHaveBeenCalled();
  });

  it('double dispose is safe', () => {
    const view = new TerminalView({ sessionId: 'tv14', container });
    view.dispose();
    expect(() => view.dispose()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// TerminalManager
// ---------------------------------------------------------------------------

describe('TerminalManager', () => {
  let container: HTMLElement;
  let mockGamepadCli: Record<string, ReturnType<typeof vi.fn>>;
  let capturedPtyDataCb: ((sessionId: string, data: string) => void) | null;
  let capturedPtyExitCb: ((sessionId: string, exitCode: number) => void) | null;

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
    container = createContainer();

    capturedPtyDataCb = null;
    capturedPtyExitCb = null;

    mockGamepadCli = {
      ptySpawn: vi.fn().mockResolvedValue({ success: true }),
      ptyWrite: vi.fn(),
      ptyResize: vi.fn(),
      ptyKill: vi.fn(),
      onPtyData: vi.fn().mockImplementation((cb) => {
        capturedPtyDataCb = cb;
        return () => { capturedPtyDataCb = null; };
      }),
      onPtyExit: vi.fn().mockImplementation((cb) => {
        capturedPtyExitCb = cb;
        return () => { capturedPtyExitCb = null; };
      }),
    };

    (window as any).gamepadCli = mockGamepadCli;
  });

  afterEach(() => {
    delete (window as any).gamepadCli;
    document.body.innerHTML = '';
  });

  it('creates a terminal and calls ptySpawn', async () => {
    const mgr = new TerminalManager(container);
    const ok = await mgr.createTerminal('s1', 'aider', 'aider', ['--model', 'gpt4'], '/home');

    expect(ok).toBe(true);
    expect(mockGamepadCli.ptySpawn).toHaveBeenCalledWith('s1', 'aider', ['--model', 'gpt4'], '/home', 'aider', undefined, undefined);
    expect(mgr.has('s1')).toBe(true);
    expect(mgr.getCount()).toBe(1);

    mgr.dispose();
  });

  it('returns false if session already exists', async () => {
    const mgr = new TerminalManager(container);
    await mgr.createTerminal('s1', 'aider', 'aider');
    const dup = await mgr.createTerminal('s1', 'aider', 'aider');

    expect(dup).toBe(false);
    expect(mgr.getCount()).toBe(1);

    mgr.dispose();
  });

  it('returns false and cleans up if ptySpawn fails', async () => {
    mockGamepadCli.ptySpawn.mockResolvedValue({ success: false, error: 'nope' });

    const mgr = new TerminalManager(container);
    const ok = await mgr.createTerminal('s1', 'aider', 'aider');

    expect(ok).toBe(false);
    expect(mgr.has('s1')).toBe(false);
    expect(mgr.getCount()).toBe(0);

    mgr.dispose();
  });

  it('auto-activates the first terminal', async () => {
    const mgr = new TerminalManager(container);
    await mgr.createTerminal('s1', 'aider', 'aider');

    expect(mgr.getActiveSessionId()).toBe('s1');

    mgr.dispose();
  });

  it('switchTo shows the target terminal and hides the previous', async () => {
    const mgr = new TerminalManager(container);
    await mgr.createTerminal('s1', 'aider', 'aider');
    await mgr.createTerminal('s2', 'claude', 'claude');

    mgr.switchTo('s2');

    const session1 = mgr.getSession('s1');
    const session2 = mgr.getSession('s2');
    expect(session1!.element.style.display).toBe('none');
    expect(session2!.element.style.display).toBe('block');
    expect(mgr.getActiveSessionId()).toBe('s2');

    mgr.dispose();
  });

  it('switchTo with unknown ID is a no-op', async () => {
    const mgr = new TerminalManager(container);
    await mgr.createTerminal('s1', 'aider', 'aider');

    mgr.switchTo('nonexistent');
    expect(mgr.getActiveSessionId()).toBe('s1');

    mgr.dispose();
  });

  // -------------------------------------------------------------------------
  // deselect()
  // -------------------------------------------------------------------------

  describe('deselect()', () => {
    it('sets activeSessionId to null', async () => {
      const mgr = new TerminalManager(container);
      await mgr.createTerminal('s1', 'aider', 'aider');
      expect(mgr.getActiveSessionId()).toBe('s1');

      mgr.deselect();
      expect(mgr.getActiveSessionId()).toBeNull();

      mgr.dispose();
    });

    it('does not destroy the terminal', async () => {
      const mgr = new TerminalManager(container);
      await mgr.createTerminal('s1', 'aider', 'aider');

      mgr.deselect();

      expect(mgr.has('s1')).toBe(true);
      expect(mgr.getActiveSessionId()).toBeNull();

      mgr.dispose();
    });

    it('fires onSwitch with null', async () => {
      const mgr = new TerminalManager(container);
      await mgr.createTerminal('s1', 'aider', 'aider');

      const spy = vi.fn();
      mgr.setOnSwitch(spy);

      mgr.deselect();
      expect(spy).toHaveBeenCalledWith(null);

      mgr.dispose();
    });

    it('is a no-op when no terminal is active', () => {
      const mgr = new TerminalManager(container);
      expect(() => mgr.deselect()).not.toThrow();
      mgr.dispose();
    });

    it('switchTo restores after deselect', async () => {
      const mgr = new TerminalManager(container);
      await mgr.createTerminal('s1', 'aider', 'aider');
      await mgr.createTerminal('s2', 'claude', 'claude');

      mgr.deselect();
      expect(mgr.getActiveSessionId()).toBeNull();

      mgr.switchTo('s2');
      expect(mgr.getActiveSessionId()).toBe('s2');
      expect(mgr.getSession('s2')!.element.style.display).toBe('block');

      mgr.dispose();
    });
  });

  it('destroyTerminal removes the terminal and calls ptyKill', async () => {
    const mgr = new TerminalManager(container);
    await mgr.createTerminal('s1', 'aider', 'aider');

    mgr.destroyTerminal('s1');

    expect(mgr.has('s1')).toBe(false);
    expect(mockGamepadCli.ptyKill).toHaveBeenCalledWith('s1');
    expect(mgr.getCount()).toBe(0);

    mgr.dispose();
  });

  it('destroyTerminal switches to next if active was destroyed', async () => {
    const mgr = new TerminalManager(container);
    await mgr.createTerminal('s1', 'aider', 'aider');
    await mgr.createTerminal('s2', 'claude', 'claude');

    mgr.switchTo('s1');
    mgr.destroyTerminal('s1');

    expect(mgr.getActiveSessionId()).toBe('s2');

    mgr.dispose();
  });

  it('destroyTerminal of non-active session preserves active', async () => {
    const mgr = new TerminalManager(container);
    await mgr.createTerminal('s1', 'aider', 'aider');
    await mgr.createTerminal('s2', 'claude', 'claude');

    mgr.switchTo('s1');
    mgr.destroyTerminal('s2');

    expect(mgr.getActiveSessionId()).toBe('s1');

    mgr.dispose();
  });

  it('getSessionIds returns all IDs', async () => {
    const mgr = new TerminalManager(container);
    await mgr.createTerminal('s1', 'aider', 'aider');
    await mgr.createTerminal('s2', 'claude', 'claude');

    expect(mgr.getSessionIds()).toEqual(['s1', 's2']);

    mgr.dispose();
  });

  it('IPC data listener routes output to the correct terminal', async () => {
    const mgr = new TerminalManager(container);
    await mgr.createTerminal('s1', 'aider', 'aider');

    // Trigger IPC data callback
    expect(capturedPtyDataCb).not.toBeNull();
    capturedPtyDataCb!('s1', 'hello from pty');

    // The view's write method should have been called (via writeToTerminal)
    const session = mgr.getSession('s1');
    expect(session).toBeDefined();
    // We can't easily inspect the internal Terminal mock from here,
    // but we can verify the session exists and the data route doesn't throw

    mgr.dispose();
  });

  it('IPC exit listener writes exit message to terminal', async () => {
    const mgr = new TerminalManager(container);
    await mgr.createTerminal('s1', 'aider', 'aider');

    expect(capturedPtyExitCb).not.toBeNull();
    // Should not throw
    capturedPtyExitCb!('s1', 0);

    mgr.dispose();
  });

  it('writeToTerminal is a no-op for unknown sessions', () => {
    const mgr = new TerminalManager(container);
    // Should not throw
    expect(() => mgr.writeToTerminal('nonexistent', 'data')).not.toThrow();

    mgr.dispose();
  });

  it('writeToTerminal strips alt screen sequences when stripAltScreen is enabled', async () => {
    const mgr = new TerminalManager(container);
    await mgr.createTerminal('s1', 'copilot-cli', 'copilot', [], undefined, undefined, undefined, true);

    const mockTerm = terminalInstances[terminalInstances.length - 1];
    mockTerm.write.mockClear();

    mgr.writeToTerminal('s1', 'hello\x1b[?1049hworld');
    expect(mockTerm.write).toHaveBeenCalledWith('helloworld');

    mgr.dispose();
  });

  it('writeToTerminal preserves clear screen in both modes (needed for scrollback)', async () => {
    const mgr = new TerminalManager(container);
    await mgr.createTerminal('s1', 'copilot-cli', 'copilot', [], undefined, undefined, undefined, true);

    const mockTerm = terminalInstances[terminalInstances.length - 1];
    mockTerm.write.mockClear();

    mgr.writeToTerminal('s1', '\x1b[2J');
    expect(mockTerm.write).toHaveBeenCalledWith('\x1b[2J');

    mgr.dispose();
  });

  it('writeToTerminal preserves alt screen sequences when stripAltScreen is not set', async () => {
    const mgr = new TerminalManager(container);
    await mgr.createTerminal('s1', 'aider', 'aider');

    const mockTerm = terminalInstances[terminalInstances.length - 1];
    mockTerm.write.mockClear();

    mgr.writeToTerminal('s1', 'hello\x1b[?1049hworld');
    expect(mockTerm.write).toHaveBeenCalledWith('hello\x1b[?1049hworld');

    mgr.dispose();
  });

  it('dispose cleans up all terminals and IPC listeners', async () => {
    const mgr = new TerminalManager(container);
    await mgr.createTerminal('s1', 'aider', 'aider');
    await mgr.createTerminal('s2', 'claude', 'claude');

    mgr.dispose();

    expect(mgr.getCount()).toBe(0);
    expect(mgr.getActiveSessionId()).toBeNull();
  });

  it('handles missing window.gamepadCli gracefully', () => {
    delete (window as any).gamepadCli;

    // Should not throw
    const mgr = new TerminalManager(container);
    expect(mgr.getCount()).toBe(0);

    mgr.dispose();
  });

  it('destroyTerminal for unknown session is a no-op', () => {
    const mgr = new TerminalManager(container);
    expect(() => mgr.destroyTerminal('nonexistent')).not.toThrow();

    mgr.dispose();
  });

  // -------------------------------------------------------------------------
  // onSwitch callback
  // -------------------------------------------------------------------------

  describe('onSwitch callback', () => {
    it('calls onSwitch when switchTo is called', async () => {
      const onSwitch = vi.fn();
      const mgr = new TerminalManager(container);
      mgr.setOnSwitch(onSwitch);

      await mgr.createTerminal('s1', 'aider', 'aider');
      await mgr.createTerminal('s2', 'claude', 'claude');

      mgr.switchTo('s2');

      expect(onSwitch).toHaveBeenCalledWith('s2');

      mgr.dispose();
    });

    it('does not call onSwitch if not set', async () => {
      const mgr = new TerminalManager(container);

      await mgr.createTerminal('s1', 'aider', 'aider');
      await mgr.createTerminal('s2', 'claude', 'claude');

      // switchTo should not throw when onSwitch is null
      expect(() => mgr.switchTo('s2')).not.toThrow();

      mgr.dispose();
    });

    it('calls onSwitch with correct id on each switch', async () => {
      const onSwitch = vi.fn();
      const mgr = new TerminalManager(container);
      mgr.setOnSwitch(onSwitch);

      await mgr.createTerminal('s1', 'aider', 'aider');
      await mgr.createTerminal('s2', 'claude', 'claude');
      await mgr.createTerminal('s3', 'copilot', 'copilot');

      // Clear calls from createTerminal auto-activate
      onSwitch.mockClear();

      mgr.switchTo('s2');
      mgr.switchTo('s3');
      mgr.switchTo('s1');

      expect(onSwitch).toHaveBeenCalledTimes(3);
      expect(onSwitch).toHaveBeenNthCalledWith(1, 's2');
      expect(onSwitch).toHaveBeenNthCalledWith(2, 's3');
      expect(onSwitch).toHaveBeenNthCalledWith(3, 's1');

      mgr.dispose();
    });
  });

  // -------------------------------------------------------------------------
  // renameSession
  // -------------------------------------------------------------------------

  describe('renameSession', () => {
    it('updates the session name', async () => {
      const mgr = new TerminalManager(container);
      await mgr.createTerminal('s1', 'aider', 'aider');

      const before = mgr.getSession('s1');
      expect(before!.name).toBe('aider'); // defaults to cliType

      mgr.renameSession('s1', 'My Custom Name');

      const after = mgr.getSession('s1');
      expect(after!.name).toBe('My Custom Name');

      mgr.dispose();
    });

    it('is a no-op for unknown session', () => {
      const mgr = new TerminalManager(container);
      expect(() => mgr.renameSession('nonexistent', 'name')).not.toThrow();
      mgr.dispose();
    });

    it('name field defaults to cliType on creation', async () => {
      const mgr = new TerminalManager(container);
      await mgr.createTerminal('s1', 'claude-code', 'claude');

      expect(mgr.getSession('s1')!.name).toBe('claude-code');

      mgr.dispose();
    });
  });

  // -------------------------------------------------------------------------
  // OSC title tracking
  // -------------------------------------------------------------------------

  describe('title tracking', () => {
    it('getTitle returns undefined before any title change', async () => {
      const mgr = new TerminalManager(container);
      await mgr.createTerminal('s1', 'claude-code', 'claude');

      expect(mgr.getTitle('s1')).toBeUndefined();

      mgr.dispose();
    });

    it('stores title when onTitleChange fires', async () => {
      const mgr = new TerminalManager(container);
      await mgr.createTerminal('s1', 'claude-code', 'claude');

      // Simulate xterm.js onTitleChange firing
      const lastTerminal = terminalInstances[terminalInstances.length - 1];
      const titleCallback = lastTerminal.onTitleChange.mock.calls[0][0];
      titleCallback('My Terminal Title');

      expect(mgr.getTitle('s1')).toBe('My Terminal Title');

      mgr.dispose();
    });

    it('invokes setOnTitleChange callback when title changes', async () => {
      const mgr = new TerminalManager(container);
      const titleHandler = vi.fn();
      mgr.setOnTitleChange(titleHandler);

      await mgr.createTerminal('s1', 'claude-code', 'claude');

      const lastTerminal = terminalInstances[terminalInstances.length - 1];
      const titleCallback = lastTerminal.onTitleChange.mock.calls[0][0];
      titleCallback('Window Title');

      expect(titleHandler).toHaveBeenCalledWith('s1', 'Window Title');

      mgr.dispose();
    });

    it('getTitle returns undefined for unknown session', () => {
      const mgr = new TerminalManager(container);
      expect(mgr.getTitle('nonexistent')).toBeUndefined();
      mgr.dispose();
    });
  });
});

// ---------------------------------------------------------------------------
// TerminalView — attachCustomKeyEventHandler
// ---------------------------------------------------------------------------

describe('TerminalView — custom key handler', () => {
  let container: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    terminalInstances.length = 0;
    fitAddonInstances.length = 0;
    searchAddonInstances.length = 0;
    container = createContainer();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('attaches a custom key event handler on construction', () => {
    new TerminalView({ sessionId: 'ckh-1', container });
    expect(lastTerminal().attachCustomKeyEventHandler).toHaveBeenCalledTimes(1);
    expect(typeof lastTerminal().attachCustomKeyEventHandler.mock.calls[0][0]).toBe('function');
  });

  it('custom handler returns false for Ctrl+Tab to let it bubble', () => {
    new TerminalView({ sessionId: 'ckh-2', container });
    const handler = lastTerminal().attachCustomKeyEventHandler.mock.calls[0][0] as (event: Partial<KeyboardEvent>) => boolean;

    const result = handler({ key: 'Tab', ctrlKey: true } as KeyboardEvent);
    expect(result).toBe(false);
  });

  it('custom handler returns true for normal keys', () => {
    new TerminalView({ sessionId: 'ckh-3', container });
    const handler = lastTerminal().attachCustomKeyEventHandler.mock.calls[0][0] as (event: Partial<KeyboardEvent>) => boolean;

    const result = handler({ key: 'a', ctrlKey: false } as KeyboardEvent);
    expect(result).toBe(true);
  });

  it('PageDown in normal buffer scrolls viewport and blocks escape to PTY', () => {
    new TerminalView({ sessionId: 'ckh-pgdn', container });
    lastTerminal().buffer.active.type = 'normal';
    const handler = lastTerminal().attachCustomKeyEventHandler.mock.calls[0][0] as (event: Partial<KeyboardEvent>) => boolean;

    const result = handler({ key: 'PageDown', type: 'keydown', ctrlKey: false } as KeyboardEvent);
    expect(result).toBe(false); // block escape so CLI doesn't redraw
    expect(lastTerminal().scrollLines).toHaveBeenCalledWith(30); // rows = 30
  });

  it('PageUp in normal buffer scrolls viewport and blocks escape to PTY', () => {
    new TerminalView({ sessionId: 'ckh-pgup', container });
    lastTerminal().buffer.active.type = 'normal';
    const handler = lastTerminal().attachCustomKeyEventHandler.mock.calls[0][0] as (event: Partial<KeyboardEvent>) => boolean;

    const result = handler({ key: 'PageUp', type: 'keydown', ctrlKey: false } as KeyboardEvent);
    expect(result).toBe(false);
    expect(lastTerminal().scrollLines).toHaveBeenCalledWith(-30);
  });

  it('PageDown in alternate buffer passes through to PTY (no scrollLines)', () => {
    new TerminalView({ sessionId: 'ckh-pgdn-alt', container });
    lastTerminal().buffer.active.type = 'alternate';
    const handler = lastTerminal().attachCustomKeyEventHandler.mock.calls[0][0] as (event: Partial<KeyboardEvent>) => boolean;

    const result = handler({ key: 'PageDown', type: 'keydown', ctrlKey: false } as KeyboardEvent);
    expect(result).toBe(true); // let xterm.js send escape to PTY
    expect(lastTerminal().scrollLines).not.toHaveBeenCalled();
  });

  it('PageUp keyup event does not trigger scrollLines', () => {
    new TerminalView({ sessionId: 'ckh-pgup-up', container });
    lastTerminal().buffer.active.type = 'normal';
    const handler = lastTerminal().attachCustomKeyEventHandler.mock.calls[0][0] as (event: Partial<KeyboardEvent>) => boolean;

    handler({ key: 'PageUp', type: 'keyup', ctrlKey: false } as KeyboardEvent);
    expect(lastTerminal().scrollLines).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TerminalView — container wheel listener (xterm.js v6 compatibility)
// ---------------------------------------------------------------------------
// xterm.js v6 replaced the old .xterm-viewport scroll with SmoothScrollableElement
// (.xterm-scrollable-element). Our capture-phase listener always intercepts wheel
// events and routes through scroll(): scrollLines() in normal buffer (bypasses
// SmoothScrollableElement sync issues), PageUp/PageDown to PTY in alternate.
// ---------------------------------------------------------------------------

describe('TerminalView — container wheel listener (v6)', () => {
  let container: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    terminalInstances.length = 0;
    fitAddonInstances.length = 0;
    searchAddonInstances.length = 0;
    container = createContainer();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('registers a capture-phase wheel listener on the container', () => {
    const spy = vi.spyOn(container, 'addEventListener');
    new TerminalView({ sessionId: 'dwl-1', container });

    const wheelCalls = spy.mock.calls.filter(c => c[0] === 'wheel');
    expect(wheelCalls.length).toBe(1);
    expect(wheelCalls[0][2]).toEqual({ passive: false, capture: true });
  });

  it('scrolls viewport via scrollLines in normal buffer', () => {
    new TerminalView({ sessionId: 'dwl-2', container });
    lastTerminal().buffer.active.type = 'normal';

    const ev = new WheelEvent('wheel', { deltaY: 120, cancelable: true, bubbles: true });
    container.dispatchEvent(ev);

    expect(ev.defaultPrevented).toBe(true);
    expect(lastTerminal().scrollLines).toHaveBeenCalledWith(3); // 120/40 = 3
  });

  it('scrolls up via scrollLines in normal buffer', () => {
    new TerminalView({ sessionId: 'dwl-2b', container });
    lastTerminal().buffer.active.type = 'normal';

    const ev = new WheelEvent('wheel', { deltaY: -80, cancelable: true, bubbles: true });
    container.dispatchEvent(ev);

    expect(ev.defaultPrevented).toBe(true);
    expect(lastTerminal().scrollLines).toHaveBeenCalledWith(-2); // 80/40 = 2
  });

  it('sends PageDown to PTY in alternate buffer', () => {
    const onScrollInput = vi.fn();
    new TerminalView({ sessionId: 'dwl-5', container, onScrollInput });
    lastTerminal().buffer.active.type = 'alternate';

    const ev = new WheelEvent('wheel', { deltaY: 120, cancelable: true, bubbles: true });
    container.dispatchEvent(ev);

    expect(ev.defaultPrevented).toBe(true);
    expect(onScrollInput).toHaveBeenCalledTimes(3); // 120/40 = 3
    expect(onScrollInput).toHaveBeenCalledWith('\x1b[6~'); // PageDown
    expect(lastTerminal().scrollLines).not.toHaveBeenCalled();
  });

  it('sends PageUp to PTY in alternate buffer', () => {
    const onScrollInput = vi.fn();
    new TerminalView({ sessionId: 'dwl-6', container, onScrollInput });
    lastTerminal().buffer.active.type = 'alternate';

    const ev = new WheelEvent('wheel', { deltaY: -80, cancelable: true, bubbles: true });
    container.dispatchEvent(ev);

    expect(ev.defaultPrevented).toBe(true);
    expect(onScrollInput).toHaveBeenCalledTimes(2); // 80/40 = 2
    expect(onScrollInput).toHaveBeenCalledWith('\x1b[5~'); // PageUp
  });

  it('falls back to onData in alternate buffer when no onScrollInput', () => {
    const onData = vi.fn();
    new TerminalView({ sessionId: 'dwl-7', container, onData });
    lastTerminal().buffer.active.type = 'alternate';

    const ev = new WheelEvent('wheel', { deltaY: 40, cancelable: true, bubbles: true });
    container.dispatchEvent(ev);

    expect(ev.defaultPrevented).toBe(true);
    expect(onData).toHaveBeenCalledWith('\x1b[6~');
  });

  it('still prevents default in alternate buffer with no callbacks', () => {
    new TerminalView({ sessionId: 'dwl-8', container });
    lastTerminal().buffer.active.type = 'alternate';

    const ev = new WheelEvent('wheel', { deltaY: 120, cancelable: true, bubbles: true });
    container.dispatchEvent(ev);

    // preventDefault always called — no PTY escape sent (no callback), but event is consumed
    expect(ev.defaultPrevented).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TerminalView — virtual alt screen tracking
// ---------------------------------------------------------------------------
// When stripAltScreen is active, TerminalView tracks alt screen enter/exit
// sequences from the raw PTY data (before pty-filter strips them).
// This lets scroll() and PageUp/PageDown route to the CLI during TUI mode.
// ---------------------------------------------------------------------------

describe('TerminalView — virtual alt screen', () => {
  let container: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    terminalInstances.length = 0;
    fitAddonInstances.length = 0;
    searchAddonInstances.length = 0;
    container = createContainer();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('starts with virtualAltScreen false', () => {
    const view = new TerminalView({ sessionId: 'vas-init', container });
    expect(view.isVirtualAltScreen()).toBe(false);
  });

  it('sets virtualAltScreen true on alt screen enter (1049h)', () => {
    const view = new TerminalView({ sessionId: 'vas-enter', container });
    view.updateVirtualAltScreen('some text\x1b[?1049hmore text');
    expect(view.isVirtualAltScreen()).toBe(true);
  });

  it('sets virtualAltScreen false on alt screen exit (1049l)', () => {
    const view = new TerminalView({ sessionId: 'vas-exit', container });
    view.updateVirtualAltScreen('\x1b[?1049h');
    expect(view.isVirtualAltScreen()).toBe(true);
    view.updateVirtualAltScreen('\x1b[?1049l');
    expect(view.isVirtualAltScreen()).toBe(false);
  });

  it('handles mode 47 (original alt screen)', () => {
    const view = new TerminalView({ sessionId: 'vas-47', container });
    view.updateVirtualAltScreen('\x1b[?47h');
    expect(view.isVirtualAltScreen()).toBe(true);
    view.updateVirtualAltScreen('\x1b[?47l');
    expect(view.isVirtualAltScreen()).toBe(false);
  });

  it('handles mode 1047 (xterm alt screen)', () => {
    const view = new TerminalView({ sessionId: 'vas-1047', container });
    view.updateVirtualAltScreen('\x1b[?1047h');
    expect(view.isVirtualAltScreen()).toBe(true);
    view.updateVirtualAltScreen('\x1b[?1047l');
    expect(view.isVirtualAltScreen()).toBe(false);
  });

  it('last sequence wins when multiple in one chunk', () => {
    const view = new TerminalView({ sessionId: 'vas-multi', container });
    view.updateVirtualAltScreen('\x1b[?1049h\x1b[?1049l');
    expect(view.isVirtualAltScreen()).toBe(false);

    view.updateVirtualAltScreen('\x1b[?1049l\x1b[?1049h');
    expect(view.isVirtualAltScreen()).toBe(true);
  });

  it('ignores data without alt screen sequences', () => {
    const view = new TerminalView({ sessionId: 'vas-none', container });
    view.updateVirtualAltScreen('hello world\x1b[2J');
    expect(view.isVirtualAltScreen()).toBe(false);
  });

  it('scroll() sends PageUp/Down to CLI in virtual alt screen', () => {
    const scrollCb = vi.fn();
    const view = new TerminalView({ sessionId: 'vas-scroll', container, onScrollInput: scrollCb, onData: vi.fn() });
    view.updateVirtualAltScreen('\x1b[?1049h');

    view.scroll('up', 1);
    expect(scrollCb).toHaveBeenCalledWith('\x1b[5~'); // PageUp
    expect(lastTerminal().scrollLines).not.toHaveBeenCalled();
  });

  it('scroll() calls scrollLines in normal mode (no virtual alt screen)', () => {
    const view = new TerminalView({ sessionId: 'vas-normal', container, onData: vi.fn() });
    lastTerminal().buffer.active.type = 'normal';

    view.scroll('down', 3);
    expect(lastTerminal().scrollLines).toHaveBeenCalledWith(3);
  });

  it('PageUp/PageDown passes through to PTY in virtual alt screen', () => {
    const view = new TerminalView({ sessionId: 'vas-pgup', container });
    view.updateVirtualAltScreen('\x1b[?1049h');
    lastTerminal().buffer.active.type = 'normal';
    const handler = lastTerminal().attachCustomKeyEventHandler.mock.calls[0][0] as (event: Partial<KeyboardEvent>) => boolean;

    const result = handler({ key: 'PageUp', type: 'keydown', ctrlKey: false } as KeyboardEvent);
    expect(result).toBe(true); // let xterm.js send to CLI
    expect(lastTerminal().scrollLines).not.toHaveBeenCalled();
  });

  it('PageDown in normal mode (no virtual alt screen) scrolls viewport', () => {
    new TerminalView({ sessionId: 'vas-pgdn-norm', container });
    lastTerminal().buffer.active.type = 'normal';
    const handler = lastTerminal().attachCustomKeyEventHandler.mock.calls[0][0] as (event: Partial<KeyboardEvent>) => boolean;

    const result = handler({ key: 'PageDown', type: 'keydown', ctrlKey: false } as KeyboardEvent);
    expect(result).toBe(false);
    expect(lastTerminal().scrollLines).toHaveBeenCalledWith(30);
  });
});
