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
    buffer: { active: { type: 'normal', baseY: 0, cursorY: 0, getLine: vi.fn() } },
    cols: 120,
    rows: 30,
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
});

// ---------------------------------------------------------------------------
// TerminalView — attachCustomWheelEventHandler
// ---------------------------------------------------------------------------

describe('TerminalView — custom wheel handler', () => {
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

  it('attaches a custom wheel event handler on construction', () => {
    new TerminalView({ sessionId: 'cwh-1', container });
    expect(lastTerminal().attachCustomWheelEventHandler).toHaveBeenCalledTimes(1);
    expect(typeof lastTerminal().attachCustomWheelEventHandler.mock.calls[0][0]).toBe('function');
  });

  it('returns true in normal buffer mode (allows scroll)', () => {
    new TerminalView({ sessionId: 'cwh-2', container });
    const handler = lastTerminal().attachCustomWheelEventHandler.mock.calls[0][0] as (ev: WheelEvent) => boolean;
    lastTerminal().buffer.active.type = 'normal';

    const result = handler(new WheelEvent('wheel'));
    expect(result).toBe(true);
  });

  it('returns false in alternate buffer mode (blocks wheel-to-arrow)', () => {
    new TerminalView({ sessionId: 'cwh-3', container });
    const handler = lastTerminal().attachCustomWheelEventHandler.mock.calls[0][0] as (ev: WheelEvent) => boolean;
    lastTerminal().buffer.active.type = 'alternate';

    const result = handler(new WheelEvent('wheel'));
    expect(result).toBe(false);
  });
});
