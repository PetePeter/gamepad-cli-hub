import { describe, it, expect, beforeEach } from 'vitest';
import { PtyOutputBuffer } from '../renderer/terminal/pty-output-buffer.js';

describe('PtyOutputBuffer', () => {
  let buffer: PtyOutputBuffer;

  beforeEach(() => {
    buffer = new PtyOutputBuffer(10); // max 10 lines
  });

  describe('getLastLines', () => {
    it('returns empty array for unknown session', () => {
      expect(buffer.getLastLines('unknown', 5)).toEqual([]);
    });

    it('stores and retrieves lines from appended data', () => {
      buffer.append('s1', 'hello\nworld\n');
      expect(buffer.getLastLines('s1', 5)).toEqual(['hello', 'world']);
    });

    it('returns only the last N lines when requested', () => {
      buffer.append('s1', 'line1\nline2\nline3\nline4\n');
      expect(buffer.getLastLines('s1', 2)).toEqual(['line3', 'line4']);
    });

    it('handles data arriving in chunks (partial lines)', () => {
      buffer.append('s1', 'hel');
      buffer.append('s1', 'lo\nwor');
      buffer.append('s1', 'ld\n');
      expect(buffer.getLastLines('s1', 5)).toEqual(['hello', 'world']);
    });

    it('includes the current partial line (no trailing newline)', () => {
      buffer.append('s1', 'line1\npartial');
      expect(buffer.getLastLines('s1', 5)).toEqual(['line1', 'partial']);
    });

    it('drops oldest lines when buffer exceeds max', () => {
      // Buffer max is 10 lines
      for (let i = 1; i <= 15; i++) {
        buffer.append('s1', `line${i}\n`);
      }
      const lines = buffer.getLastLines('s1', 20);
      expect(lines.length).toBe(10);
      expect(lines[0]).toBe('line6');
      expect(lines[9]).toBe('line15');
    });

    it('handles multiple sessions independently', () => {
      buffer.append('s1', 'alpha\n');
      buffer.append('s2', 'beta\n');
      buffer.append('s1', 'gamma\n');
      expect(buffer.getLastLines('s1', 5)).toEqual(['alpha', 'gamma']);
      expect(buffer.getLastLines('s2', 5)).toEqual(['beta']);
    });
  });

  describe('ANSI stripping', () => {
    it('strips CSI color sequences', () => {
      buffer.append('s1', '\x1b[32mgreen text\x1b[0m\n');
      expect(buffer.getLastLines('s1', 1)).toEqual(['green text']);
    });

    it('strips bold/underline/italic sequences', () => {
      buffer.append('s1', '\x1b[1mbold\x1b[22m \x1b[4munderline\x1b[24m\n');
      expect(buffer.getLastLines('s1', 1)).toEqual(['bold underline']);
    });

    it('strips cursor movement sequences', () => {
      buffer.append('s1', '\x1b[2Jhello\x1b[H\n');
      expect(buffer.getLastLines('s1', 1)).toEqual(['hello']);
    });

    it('strips OSC sequences (title changes etc)', () => {
      buffer.append('s1', '\x1b]0;Window Title\x07actual text\n');
      expect(buffer.getLastLines('s1', 1)).toEqual(['actual text']);
    });

    it('strips DEC private mode sequences', () => {
      buffer.append('s1', '\x1b[?1049h\x1b[?25lsome text\x1b[?25h\n');
      expect(buffer.getLastLines('s1', 1)).toEqual(['some text']);
    });
  });

  describe('carriage return handling', () => {
    it('handles \\r\\n as a single newline', () => {
      buffer.append('s1', 'line1\r\nline2\r\n');
      expect(buffer.getLastLines('s1', 5)).toEqual(['line1', 'line2']);
    });

    it('handles \\r mid-line as line overwrite', () => {
      buffer.append('s1', 'loading...\rDone!     \n');
      expect(buffer.getLastLines('s1', 1)).toEqual(['Done!     ']);
    });
  });

  describe('clear', () => {
    it('removes all data for a session', () => {
      buffer.append('s1', 'data\n');
      buffer.clear('s1');
      expect(buffer.getLastLines('s1', 5)).toEqual([]);
    });

    it('does not affect other sessions', () => {
      buffer.append('s1', 'alpha\n');
      buffer.append('s2', 'beta\n');
      buffer.clear('s1');
      expect(buffer.getLastLines('s2', 5)).toEqual(['beta']);
    });
  });

  describe('onUpdate callback', () => {
    it('calls the update callback when data is appended', () => {
      const updates: string[] = [];
      buffer.onUpdate((sessionId) => updates.push(sessionId));
      buffer.append('s1', 'data\n');
      buffer.append('s2', 'data\n');
      expect(updates).toEqual(['s1', 's2']);
    });
  });
});
