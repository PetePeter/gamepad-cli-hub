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
});
