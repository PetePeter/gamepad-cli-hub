import { describe, it, expect, beforeAll } from 'vitest';
import { stripAltScreen, applyPtyFilters } from '../renderer/terminal/pty-filter.js';

describe('stripAltScreen', () => {
  let stripAltScreen: typeof import('../renderer/terminal/pty-filter.js').stripAltScreen;

  beforeAll(async () => {
    const mod = await import('../renderer/terminal/pty-filter.js');
    stripAltScreen = mod.stripAltScreen;
  });

  // Mode 1049 — the most common alt screen sequence
  it('strips \\x1b[?1049h (enable alt screen + save cursor)', () => {
    expect(stripAltScreen('\x1b[?1049h')).toBe('');
  });

  it('strips \\x1b[?1049l (disable alt screen + restore cursor)', () => {
    expect(stripAltScreen('\x1b[?1049l')).toBe('');
  });

  // Mode 47 — original alt screen
  it('strips \\x1b[?47h (original alt screen enable)', () => {
    expect(stripAltScreen('\x1b[?47h')).toBe('');
  });

  it('strips \\x1b[?47l (original alt screen disable)', () => {
    expect(stripAltScreen('\x1b[?47l')).toBe('');
  });

  // Mode 1047 — xterm alt screen
  it('strips \\x1b[?1047h (xterm alt screen enable)', () => {
    expect(stripAltScreen('\x1b[?1047h')).toBe('');
  });

  it('strips \\x1b[?1047l (xterm alt screen disable)', () => {
    expect(stripAltScreen('\x1b[?1047l')).toBe('');
  });

  // Mode 1048 — cursor save/restore
  it('strips \\x1b[?1048h (save cursor)', () => {
    expect(stripAltScreen('\x1b[?1048h')).toBe('');
  });

  it('strips \\x1b[?1048l (restore cursor)', () => {
    expect(stripAltScreen('\x1b[?1048l')).toBe('');
  });

  // ED 3 — erase scrollback
  it('strips \\x1b[3J (erase scrollback)', () => {
    expect(stripAltScreen('\x1b[3J')).toBe('');
  });

  // Text surrounding sequences
  it('strips alt screen sequences from mixed content', () => {
    expect(stripAltScreen('hello\x1b[?1049hworld')).toBe('helloworld');
  });

  it('strips erase scrollback from mixed content', () => {
    expect(stripAltScreen('before\x1b[3Jafter')).toBe('beforeafter');
  });

  it('strips multiple alt screen sequences in one chunk', () => {
    const input = '\x1b[?1049h\x1b[?1048h\x1b[3J';
    expect(stripAltScreen(input)).toBe('');
  });

  // ED 2 passes through — xterm.js pushes viewport to scrollback on ED 2
  it('preserves \\x1b[2J (clear screen)', () => {
    expect(stripAltScreen('\x1b[2J')).toBe('\x1b[2J');
  });

  it('preserves cursor movement sequences', () => {
    const cursor = '\x1b[10;5H';
    expect(stripAltScreen(cursor)).toBe(cursor);
  });

  it('preserves SGR (color) sequences', () => {
    const sgr = '\x1b[31;1m';
    expect(stripAltScreen(sgr)).toBe(sgr);
  });

  it('preserves plain text', () => {
    expect(stripAltScreen('just plain text')).toBe('just plain text');
  });

  it('returns empty string for empty input', () => {
    expect(stripAltScreen('')).toBe('');
  });

  // Compound sequences — strip only alt screen modes, preserve others
  it('strips alt screen mode from compound sequence', () => {
    expect(stripAltScreen('\x1b[?1049;25h')).toBe('\x1b[?25h');
  });

  it('strips all alt screen modes from compound sequence', () => {
    expect(stripAltScreen('\x1b[?1049;47;1048h')).toBe('');
  });

  it('preserves compound sequence with no tracked modes', () => {
    expect(stripAltScreen('\x1b[?25;7h')).toBe('\x1b[?25;7h');
  });

  it('strips alt screen mode from compound disable sequence', () => {
    expect(stripAltScreen('\x1b[?1049;25l')).toBe('\x1b[?25l');
  });

  // Realistic scenario: full Copilot CLI alt screen enter + exit
  it('strips full alt screen enter/exit cycle', () => {
    const enter = '\x1b[?1049h\x1b[2J\x1b[H';
    const exit = '\x1b[?1049l';
    // Alt screen stripped, ED 2 preserved for scrollback
    expect(stripAltScreen(enter)).toBe('\x1b[2J\x1b[H');
    expect(stripAltScreen(exit)).toBe('');
  });
});

describe('applyPtyFilters', () => {
  // Fast path — no escape sequences
  it('returns plain text unchanged (fast path)', () => {
    const text = 'Hello world, this is LLM output';
    expect(applyPtyFilters(text)).toBe(text);
  });

  it('returns empty string unchanged', () => {
    expect(applyPtyFilters('')).toBe('');
  });

  it('fast path ignores non-DEC escape sequences', () => {
    const sgr = '\x1b[31;1mred text\x1b[0m';
    expect(applyPtyFilters(sgr)).toBe(sgr);
  });

  // No-op by default — mouse tracking passes through natively to xterm.js
  it('preserves mouse tracking sequences by default (xterm.js handles natively)', () => {
    expect(applyPtyFilters('\x1b[?1000h')).toBe('\x1b[?1000h');
  });

  it('preserves alt screen sequences when stripAltScreen is false', () => {
    expect(applyPtyFilters('\x1b[?1049h')).toBe('\x1b[?1049h');
  });

  it('preserves \\x1b[2J when stripAltScreen is true (pushes to scrollback)', () => {
    expect(applyPtyFilters('\x1b[2J', { stripAltScreen: true })).toBe('\x1b[2J');
  });

  // stripAltScreen mode
  it('strips alt screen sequences when stripAltScreen is true', () => {
    const input = '\x1b[?1049h';
    expect(applyPtyFilters(input, { stripAltScreen: true })).toBe('');
  });

  it('strips compound sequence with alt screen modes only', () => {
    const input = '\x1b[?1049;25h';
    expect(applyPtyFilters(input, { stripAltScreen: true })).toBe('\x1b[?25h');
  });

  it('preserves mouse tracking in compound sequence even with stripAltScreen', () => {
    const input = '\x1b[?1049;1007;25h';
    expect(applyPtyFilters(input, { stripAltScreen: true })).toBe('\x1b[?1007;25h');
  });

  it('preserves \\x1b[2J regardless of stripAltScreen', () => {
    expect(applyPtyFilters('\x1b[2J')).toBe('\x1b[2J');
    expect(applyPtyFilters('\x1b[2J', { stripAltScreen: true })).toBe('\x1b[2J');
  });

  it('handles full TUI redraw cycle', () => {
    const input = '\x1b[?1049h\x1b[?1000h\x1b[2J\x1b[Hcontent\x1b[3J';
    const result = applyPtyFilters(input, { stripAltScreen: true });
    // Alt screen and ED 3 stripped; mouse tracking preserved; ED 2 preserved
    expect(result).toBe('\x1b[?1000h\x1b[2J\x1b[Hcontent');
  });

  it('strips ED 3 only when stripAltScreen is true', () => {
    expect(applyPtyFilters('a\x1b[3Jb')).toBe('a\x1b[3Jb');
    expect(applyPtyFilters('a\x1b[3Jb', { stripAltScreen: true })).toBe('ab');
  });

  it('is a no-op when no options provided and no DEC sequences present', () => {
    const text = 'just some text with \x1b[32mcolor\x1b[0m';
    expect(applyPtyFilters(text)).toBe(text);
  });
});
