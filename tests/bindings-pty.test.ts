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
// Mock main.ts to prevent side effects (init, gamepad setup, etc.)
// ---------------------------------------------------------------------------

vi.mock('../renderer/runtime/terminal-provider', () => ({
  getTerminalManager: vi.fn().mockReturnValue(null),
}));

// ---------------------------------------------------------------------------
// Mock xterm.js (required by terminal-manager → terminal-view)
// ---------------------------------------------------------------------------

vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn(function (this: any) {
    Object.assign(this, {
      loadAddon: vi.fn(),
      open: vi.fn(),
      write: vi.fn(),
      focus: vi.fn(),
      blur: vi.fn(),
      clear: vi.fn(),
      dispose: vi.fn(),
      scrollToBottom: vi.fn(),
      scrollLines: vi.fn(),
      onData: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      onResize: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      cols: 120,
      rows: 30,
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
// Import the helpers under test (exported from bindings.ts)
// ---------------------------------------------------------------------------

import { keyToPtyEscape, comboToPtyEscape } from '../renderer/bindings';

// ============================================================================
// keyToPtyEscape
// ============================================================================

describe('keyToPtyEscape', () => {
  it('maps Enter to carriage return', () => {
    expect(keyToPtyEscape('Enter')).toBe('\r');
  });

  it('maps Tab to tab character', () => {
    expect(keyToPtyEscape('Tab')).toBe('\t');
  });

  it('maps Escape to ESC byte', () => {
    expect(keyToPtyEscape('Escape')).toBe('\x1b');
  });

  it('maps Backspace to DEL (0x7f)', () => {
    expect(keyToPtyEscape('Backspace')).toBe('\x7f');
  });

  it('maps Delete to CSI 3~', () => {
    expect(keyToPtyEscape('Delete')).toBe('\x1b[3~');
  });

  it('maps arrow keys to CSI sequences', () => {
    expect(keyToPtyEscape('Up')).toBe('\x1b[A');
    expect(keyToPtyEscape('Down')).toBe('\x1b[B');
    expect(keyToPtyEscape('Right')).toBe('\x1b[C');
    expect(keyToPtyEscape('Left')).toBe('\x1b[D');
  });

  it('maps Arrow-prefixed keys (KeyboardEvent.key format) to CSI sequences', () => {
    expect(keyToPtyEscape('ArrowUp')).toBe('\x1b[A');
    expect(keyToPtyEscape('ArrowDown')).toBe('\x1b[B');
    expect(keyToPtyEscape('ArrowRight')).toBe('\x1b[C');
    expect(keyToPtyEscape('ArrowLeft')).toBe('\x1b[D');
  });

  it('maps Home and End', () => {
    expect(keyToPtyEscape('Home')).toBe('\x1b[H');
    expect(keyToPtyEscape('End')).toBe('\x1b[F');
  });

  it('maps PageUp and PageDown', () => {
    expect(keyToPtyEscape('PageUp')).toBe('\x1b[5~');
    expect(keyToPtyEscape('PageDown')).toBe('\x1b[6~');
  });

  it('maps Space to space character', () => {
    expect(keyToPtyEscape('Space')).toBe(' ');
  });

  it('maps F1-F4 to SS3 sequences', () => {
    expect(keyToPtyEscape('F1')).toBe('\x1bOP');
    expect(keyToPtyEscape('F2')).toBe('\x1bOQ');
    expect(keyToPtyEscape('F3')).toBe('\x1bOR');
    expect(keyToPtyEscape('F4')).toBe('\x1bOS');
  });

  it('maps F5-F12 to CSI sequences', () => {
    expect(keyToPtyEscape('F5')).toBe('\x1b[15~');
    expect(keyToPtyEscape('F6')).toBe('\x1b[17~');
    expect(keyToPtyEscape('F7')).toBe('\x1b[18~');
    expect(keyToPtyEscape('F8')).toBe('\x1b[19~');
    expect(keyToPtyEscape('F9')).toBe('\x1b[20~');
    expect(keyToPtyEscape('F10')).toBe('\x1b[21~');
    expect(keyToPtyEscape('F11')).toBe('\x1b[23~');
    expect(keyToPtyEscape('F12')).toBe('\x1b[24~');
  });

  it('falls back to the key character itself for unknown keys', () => {
    expect(keyToPtyEscape('a')).toBe('a');
    expect(keyToPtyEscape('z')).toBe('z');
    expect(keyToPtyEscape('1')).toBe('1');
    expect(keyToPtyEscape('/')).toBe('/');
  });
});

// ============================================================================
// comboToPtyEscape
// ============================================================================

describe('comboToPtyEscape', () => {
  it('maps Ctrl+A to SOH (0x01)', () => {
    expect(comboToPtyEscape(['ctrl', 'a'])).toBe('\x01');
  });

  it('maps Ctrl+C to ETX (0x03)', () => {
    expect(comboToPtyEscape(['Ctrl', 'c'])).toBe('\x03');
  });

  it('maps Ctrl+Z to SUB (0x1a)', () => {
    expect(comboToPtyEscape(['ctrl', 'z'])).toBe('\x1a');
  });

  it('maps Ctrl+D to EOT (0x04)', () => {
    expect(comboToPtyEscape(['Ctrl', 'd'])).toBe('\x04');
  });

  it('maps Ctrl+L to FF (0x0c)', () => {
    expect(comboToPtyEscape(['ctrl', 'l'])).toBe('\x0c');
  });

  it('is case-insensitive for both Ctrl and the letter', () => {
    expect(comboToPtyEscape(['CTRL', 'A'])).toBe('\x01');
    expect(comboToPtyEscape(['ctrl', 'A'])).toBe('\x01');
    expect(comboToPtyEscape(['Ctrl', 'a'])).toBe('\x01');
  });

  it('maps Ctrl+[ to Escape', () => {
    expect(comboToPtyEscape(['ctrl', '['])).toBe('\x1b');
  });

  it('falls back to joining keys for non-Ctrl combos', () => {
    expect(comboToPtyEscape(['alt', 'f'])).toBe('altf');
    expect(comboToPtyEscape(['shift', 'a'])).toBe('shifta');
  });

  it('falls back to joining for single-key arrays', () => {
    expect(comboToPtyEscape(['Enter'])).toBe('Enter');
  });

  it('falls back to joining for 3+ key arrays', () => {
    expect(comboToPtyEscape(['ctrl', 'shift', 'a'])).toBe('ctrlshifta');
  });
});
