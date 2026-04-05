/**
 * Ring buffer for PTY output — stores the last N lines per session
 * as ANSI-stripped plain text for preview display.
 */

import { stripAnsi } from '../../src/utils/strip-ansi.js';

export { stripAnsi };

interface SessionBuffer {
  lines: string[];
  partial: string; // current incomplete line (no newline yet)
}

export class PtyOutputBuffer {
  private buffers = new Map<string, SessionBuffer>();
  private maxLines: number;
  private updateCallbacks: Array<(sessionId: string) => void> = [];

  constructor(maxLines = 50) {
    this.maxLines = maxLines;
  }

  append(sessionId: string, data: string): void {
    let buf = this.buffers.get(sessionId);
    if (!buf) {
      buf = { lines: [], partial: '' };
      this.buffers.set(sessionId, buf);
    }

    // Strip ANSI first, then normalize \r\n to \n
    const clean = stripAnsi(data).replace(/\r\n/g, '\n');

    // Combine with any partial line from previous append
    const combined = buf.partial + clean;

    // Split on \n (handles \r\n too since we process \r separately)
    const parts = combined.split('\n');

    // Last element is the new partial (may be empty if data ended with \n)
    buf.partial = parts.pop() ?? '';

    // Process each completed line
    for (const rawLine of parts) {
      // Handle \r: take content after last \r
      const crIndex = rawLine.lastIndexOf('\r');
      const line = crIndex >= 0 ? rawLine.substring(crIndex + 1) : rawLine;
      buf.lines.push(line);
    }

    // Trim to max
    if (buf.lines.length > this.maxLines) {
      buf.lines = buf.lines.slice(-this.maxLines);
    }

    // Notify listeners
    for (const cb of this.updateCallbacks) {
      cb(sessionId);
    }
  }

  getLastLines(sessionId: string, count: number): string[] {
    const buf = this.buffers.get(sessionId);
    if (!buf) return [];

    // Include partial line if non-empty
    const allLines = buf.partial ? [...buf.lines, buf.partial] : [...buf.lines];
    return allLines.slice(-count);
  }

  clear(sessionId: string): void {
    this.buffers.delete(sessionId);
  }

  onUpdate(callback: (sessionId: string) => void): void {
    this.updateCallbacks.push(callback);
  }

  offUpdate(callback: (sessionId: string) => void): void {
    this.updateCallbacks = this.updateCallbacks.filter(cb => cb !== callback);
  }
}
