import { describe, expect, it } from 'vitest';
import { TerminalOutputBuffer } from '../src/session/terminal-output-buffer.js';

describe('TerminalOutputBuffer', () => {
  it('keeps raw and stripped tails with partial lines', () => {
    const buffer = new TerminalOutputBuffer(10);

    buffer.append('s1', '\x1b[32mhello\x1b[0m\npart', 100);
    buffer.append('s1', 'ial\nlast', 200);

    expect(buffer.tail('s1', 5, 'both')).toEqual({
      raw: ['\x1b[32mhello\x1b[0m', 'partial', 'last'],
      stripped: ['hello', 'partial', 'last'],
      lastOutputAt: 200,
    });
  });

  it('collapses carriage-return redraws to the latest line', () => {
    const buffer = new TerminalOutputBuffer(10);

    buffer.append('s1', 'progress 50%\rprogress 100%\n', 100);

    expect(buffer.tail('s1', 5, 'stripped')).toEqual({
      stripped: ['progress 100%'],
      lastOutputAt: 100,
    });
  });

  it('trims to the configured maximum line count', () => {
    const buffer = new TerminalOutputBuffer(3);

    buffer.append('s1', 'one\ntwo\nthree\nfour\n', 100);

    expect(buffer.tail('s1', 10, 'raw')).toEqual({
      raw: ['two', 'three', 'four'],
      lastOutputAt: 100,
    });
  });

  describe('stripBlankLines', () => {
    it('mode=stripped removes entries where trim() === ""', () => {
      const buffer = new TerminalOutputBuffer(20);

      buffer.append('s1', 'alpha\n\nbeta\n   \ngamma\n', 100);

      const result = buffer.tail('s1', 10, 'stripped', true);
      expect(result.stripped).toEqual(['alpha', 'beta', 'gamma']);
      expect(result.lastOutputAt).toBe(100);
    });

    it('default (no flag) returns same output as before — regression guard', () => {
      const buffer = new TerminalOutputBuffer(20);

      buffer.append('s1', 'alpha\n\nbeta\n', 100);

      const withFalse = buffer.tail('s1', 10, 'stripped', false);
      const withDefault = buffer.tail('s1', 10, 'stripped');
      expect(withFalse).toEqual(withDefault);
      // Blank line is preserved when stripBlankLines is not set.
      expect(withDefault.stripped).toEqual(['alpha', '', 'beta']);
    });

    it('mode=both preserves row correspondence after filtering', () => {
      const buffer = new TerminalOutputBuffer(20);

      // Line 1: ANSI-coloured "hello" → raw has escape codes, stripped has "hello"
      // Line 2: blank → both raw and stripped are blank
      // Line 3: "world"
      buffer.append('s1', '\x1b[32mhello\x1b[0m\n\nworld\n', 100);

      const result = buffer.tail('s1', 10, 'both', true);

      // Blank row (index 1) must be dropped from both arrays.
      expect(result.stripped).toEqual(['hello', 'world']);
      expect(result.raw).toEqual(['\x1b[32mhello\x1b[0m', 'world']);

      // Verify correspondence: raw[i] and stripped[i] describe the same source line.
      result.raw!.forEach((rawLine, i) => {
        // The stripped counterpart must be the ANSI-stripped version of the raw line.
        // We simply check that stripped[i] is non-blank and paired consistently.
        expect(result.stripped![i].trim()).not.toBe('');
      });
    });
  });
});
