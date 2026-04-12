import { describe, it, expect, beforeAll } from 'vitest';
import { stripMouseTracking } from '../renderer/terminal/pty-filter.js';

describe('stripMouseTracking', () => {
  it('strips X10 mouse enable sequence \\x1b[?1000h', () => {
    expect(stripMouseTracking('\x1b[?1000h')).toBe('');
  });

  it('strips button-event tracking enable \\x1b[?1002h', () => {
    expect(stripMouseTracking('\x1b[?1002h')).toBe('');
  });

  it('strips any-event tracking enable \\x1b[?1003h', () => {
    expect(stripMouseTracking('\x1b[?1003h')).toBe('');
  });

  it('strips SGR mouse mode enable \\x1b[?1006h', () => {
    expect(stripMouseTracking('\x1b[?1006h')).toBe('');
  });

  it('strips corresponding disable sequences (l suffix)', () => {
    expect(stripMouseTracking('\x1b[?1000l')).toBe('');
    expect(stripMouseTracking('\x1b[?1002l')).toBe('');
    expect(stripMouseTracking('\x1b[?1003l')).toBe('');
    expect(stripMouseTracking('\x1b[?1006l')).toBe('');
  });

  it('strips alternate scroll mode enable \\x1b[?1007h', () => {
    expect(stripMouseTracking('\x1b[?1007h')).toBe('');
  });

  it('strips alternate scroll mode disable \\x1b[?1007l', () => {
    expect(stripMouseTracking('\x1b[?1007l')).toBe('');
  });

  it('strips alternate scroll mode embedded in PTY output', () => {
    const input = 'prompt> \x1b[?1007hmore text';
    expect(stripMouseTracking(input)).toBe('prompt> more text');
  });

  it('strips all known mouse tracking codes', () => {
    // 1001 = VT200 highlight, 1004 = focus events, 1005 = UTF-8 mode, 1007 = alt scroll, 1015 = URXVT, 1016 = SGR pixel
    const codes = ['1001', '1004', '1005', '1007', '1015', '1016'];
    for (const code of codes) {
      expect(stripMouseTracking(`\x1b[?${code}h`), `enable ${code}`).toBe('');
      expect(stripMouseTracking(`\x1b[?${code}l`), `disable ${code}`).toBe('');
    }
  });

  it('strips multiple sequences in one chunk', () => {
    const input = '\x1b[?1000h\x1b[?1002h\x1b[?1006h';
    expect(stripMouseTracking(input)).toBe('');
  });

  it('preserves normal text', () => {
    expect(stripMouseTracking('hello world')).toBe('hello world');
  });

  it('preserves other escape sequences (colors, cursor, etc.)', () => {
    const colorSeq = '\x1b[32mgreen\x1b[0m';
    expect(stripMouseTracking(colorSeq)).toBe(colorSeq);

    const cursorSeq = '\x1b[H\x1b[2J';
    expect(stripMouseTracking(cursorSeq)).toBe(cursorSeq);
  });

  it('returns empty string for empty input', () => {
    expect(stripMouseTracking('')).toBe('');
  });

  it('handles mouse sequences embedded mid-text', () => {
    const input = 'before\x1b[?1000hafter';
    expect(stripMouseTracking(input)).toBe('beforeafter');
  });

  it('preserves non-mouse DEC private mode sequences', () => {
    // Alternate screen buffer, cursor visibility, etc.
    const altScreen = '\x1b[?1049h';
    expect(stripMouseTracking(altScreen)).toBe(altScreen);

    const cursorHide = '\x1b[?25l';
    expect(stripMouseTracking(cursorHide)).toBe(cursorHide);
  });

  // Compound DEC mode sequences
  it('strips tracked mode from compound sequence \\x1b[?1049;1007h', () => {
    expect(stripMouseTracking('\x1b[?1049;1007h')).toBe('\x1b[?1049h');
  });

  it('strips tracked mode from compound sequence \\x1b[?1007;1049h', () => {
    expect(stripMouseTracking('\x1b[?1007;1049h')).toBe('\x1b[?1049h');
  });

  it('strips multiple tracked modes from compound sequence', () => {
    expect(stripMouseTracking('\x1b[?1049;1000;1006h')).toBe('\x1b[?1049h');
  });

  it('strips entire compound sequence when all modes are tracked', () => {
    expect(stripMouseTracking('\x1b[?1000;1006;1007h')).toBe('');
  });

  it('preserves compound sequence with no tracked modes', () => {
    expect(stripMouseTracking('\x1b[?1049;25h')).toBe('\x1b[?1049;25h');
  });

  it('handles compound disable sequences (l suffix)', () => {
    expect(stripMouseTracking('\x1b[?1049;1007l')).toBe('\x1b[?1049l');
  });
});

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

  // Preserves non-alt-screen sequences
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
    expect(stripAltScreen('\x1b[?1049;1007h')).toBe('\x1b[?1007h');
  });

  it('strips all alt screen modes from compound sequence', () => {
    expect(stripAltScreen('\x1b[?1049;47;1048h')).toBe('');
  });

  it('preserves compound sequence with no alt screen modes', () => {
    expect(stripAltScreen('\x1b[?25;1007h')).toBe('\x1b[?25;1007h');
  });

  it('strips alt screen mode from compound disable sequence', () => {
    expect(stripAltScreen('\x1b[?1049;25l')).toBe('\x1b[?25l');
  });

  // Realistic scenario: full Copilot CLI alt screen enter + exit
  it('strips full alt screen enter/exit cycle', () => {
    const enter = '\x1b[?1049h\x1b[2J\x1b[H';
    const exit = '\x1b[?1049l';
    expect(stripAltScreen(enter)).toBe('\x1b[2J\x1b[H');
    expect(stripAltScreen(exit)).toBe('');
  });
});
