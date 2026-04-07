/**
 * Parses PTY output into smart summaries for Telegram.
 *
 * Extracts key information:
 * - Test results (passed/failed counts)
 * - Errors and warnings
 * - Modified files (from git diff output)
 * - Last N lines of output
 *
 * Maintains a rolling buffer per session, capped at MAX_BUFFER_SIZE.
 */

import { escapeHtml, cleanTerminalOutput } from './utils.js';

const MAX_BUFFER_SIZE = 50_000;
const SUMMARY_LINES = 20;

interface SessionBuffer {
  raw: string;
  lines: string[];
}

export class OutputSummarizer {
  private buffers = new Map<string, SessionBuffer>();

  /**
   * Feed output data from a PTY session.
   * Called on every pty:data event.
   */
  feedOutput(sessionId: string, data: string): void {
    let buffer = this.buffers.get(sessionId);
    if (!buffer) {
      buffer = { raw: '', lines: [] };
      this.buffers.set(sessionId, buffer);
    }

    buffer.raw += data;

    if (buffer.raw.length > MAX_BUFFER_SIZE) {
      buffer.raw = buffer.raw.slice(-MAX_BUFFER_SIZE);
    }

    buffer.lines = cleanTerminalOutput(buffer.raw).split('\n');
  }

  /**
   * Get an HTML-formatted summary for a session.
   * Combines extracted metrics with recent output.
   */
  getSummary(sessionId: string): string {
    const buffer = this.buffers.get(sessionId);
    if (!buffer || buffer.lines.length === 0) {
      return '📋 <i>No output yet</i>';
    }

    const parts: string[] = [];

    const testResults = extractTestResults(buffer.lines);
    if (testResults) parts.push(testResults);

    const errors = extractErrors(buffer.lines);
    if (errors) parts.push(errors);

    const files = extractModifiedFiles(buffer.lines);
    if (files) parts.push(files);

    const recent = formatRecentOutput(buffer.lines);
    if (recent) parts.push(recent);

    return parts.join('\n\n') || '📋 <i>No meaningful output detected</i>';
  }

  /** Get the last N lines of stripped output. */
  getLastLines(sessionId: string, count: number = SUMMARY_LINES): string {
    const buffer = this.buffers.get(sessionId);
    if (!buffer) return '';
    return buffer.lines.slice(-count).join('\n');
  }

  /** Clear the buffer for a session. */
  clearBuffer(sessionId: string): void {
    this.buffers.delete(sessionId);
  }

  /** Clean up all buffers. */
  dispose(): void {
    this.buffers.clear();
  }
}

// ---------------------------------------------------------------------------
// Extractors — each scans the output for a specific pattern
// ---------------------------------------------------------------------------

function extractTestResults(lines: string[]): string | null {
  const patterns = [
    /(\d+)\s+(?:tests?\s+)?passed/i,
    /(\d+)\s+(?:tests?\s+)?failed/i,
    /Tests:\s+(\d+)\s+passed.*?(\d+)\s+failed/i,
    /(\d+)\s+passing/i,
    /(\d+)\s+failing/i,
  ];

  const tail = lines.slice(-50);
  const results: string[] = [];

  for (const line of tail) {
    for (const pattern of patterns) {
      if (pattern.test(line)) {
        results.push(line.trim());
        break;
      }
    }
  }

  if (results.length === 0) return null;
  return `🧪 <b>Test Results:</b>\n${results.map(r => `  ${escapeHtml(r)}`).join('\n')}`;
}

function extractErrors(lines: string[]): string | null {
  const tail = lines.slice(-100);
  const errorLines: string[] = [];

  for (const line of tail) {
    // Match lines containing "error" but skip summary lines like "2 errors"
    if (/error/i.test(line) && !/^\s*\d+\s+errors?\s*$/i.test(line)) {
      errorLines.push(line.trim());
    }
  }

  if (errorLines.length === 0) return null;

  const display = errorLines.slice(-5);
  return `❌ <b>Errors (${errorLines.length}):</b>\n${display.map(e => `  <code>${escapeHtml(truncate(e, 100))}</code>`).join('\n')}`;
}

function extractModifiedFiles(lines: string[]): string | null {
  const files: string[] = [];

  for (const line of lines) {
    const diffMatch = line.match(/^\+\+\+ [ab]\/(.+)/);
    if (diffMatch) {
      files.push(diffMatch[1]);
      continue;
    }

    const modMatch = line.match(/(?:Modified|Created|Updated|Changed):\s+(.+)/i);
    if (modMatch) {
      files.push(modMatch[1].trim());
    }
  }

  if (files.length === 0) return null;

  const unique = [...new Set(files)];
  const display = unique.slice(-10);
  return `📁 <b>Files (${unique.length}):</b>\n${display.map(f => `  ${escapeHtml(f)}`).join('\n')}`;
}

function formatRecentOutput(lines: string[]): string | null {
  const recent = lines.slice(-SUMMARY_LINES).filter(l => l.trim());
  if (recent.length === 0) return null;

  const trimmed = recent.map(l => truncate(l, 100));
  return `📜 <b>Recent output:</b>\n<code>${escapeHtml(trimmed.join('\n'))}</code>`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncate(text: string, max: number): string {
  return text.length > max ? text.substring(0, max - 3) + '...' : text;
}
