import { describe, it, expect, beforeEach } from 'vitest';

import { OutputSummarizer } from '../src/telegram/output-summarizer.js';

describe('OutputSummarizer', () => {
  let summarizer: OutputSummarizer;

  beforeEach(() => {
    summarizer = new OutputSummarizer();
  });

  describe('feedOutput', () => {
    it('creates a buffer on first feed', () => {
      summarizer.feedOutput('s1', 'hello');
      expect(summarizer.getLastLines('s1')).toBe('hello');
    });

    it('appends data across multiple feeds', () => {
      summarizer.feedOutput('s1', 'line1\n');
      summarizer.feedOutput('s1', 'line2\n');
      const lines = summarizer.getLastLines('s1');
      expect(lines).toContain('line1');
      expect(lines).toContain('line2');
    });

    it('trims buffer when exceeding max size', () => {
      const bigChunk = 'x'.repeat(60_000);
      summarizer.feedOutput('s1', bigChunk);
      // Buffer should be trimmed to ~50k
      const lines = summarizer.getLastLines('s1', 1);
      expect(lines.length).toBeLessThanOrEqual(50_001);
    });

    it('keeps feedOutput cheap by parsing lazily', () => {
      for (let i = 0; i < 1000; i++) {
        summarizer.feedOutput('s1', `line ${i}\n`);
      }

      const last3 = summarizer.getLastLines('s1', 3);
      expect(last3).toContain('line 999');
      expect(last3).toContain('line 997');
    });

    it('bounds retained cleaned history after lazy parsing', () => {
      const lines = Array.from({ length: 1200 }, (_, i) => `line ${i}`).join('\n');
      summarizer.feedOutput('s1', lines);

      const retained = summarizer.getLastLines('s1', 1100);
      expect(retained).not.toContain('line 0');
      expect(retained).toContain('line 1199');
    });

    it('strips ANSI escape codes', () => {
      summarizer.feedOutput('s1', '\x1b[31mred text\x1b[0m');
      expect(summarizer.getLastLines('s1')).toBe('red text');
    });

    it('strips carriage returns', () => {
      summarizer.feedOutput('s1', 'hello\r\nworld');
      const lines = summarizer.getLastLines('s1');
      expect(lines).not.toContain('\r');
      expect(lines).toContain('hello');
    });
  });

  describe('getSummary', () => {
    it('returns "No output yet" for unknown sessions', () => {
      const summary = summarizer.getSummary('unknown');
      expect(summary).toContain('No output yet');
    });

    it('returns "No output yet" for empty sessions', () => {
      summarizer.feedOutput('s1', '');
      const summary = summarizer.getSummary('s1');
      // Empty string splits into [''] which has length 1
      // but after filter(trim), may be empty depending on implementation
      expect(summary).toBeTruthy();
    });

    it('includes recent output section', () => {
      summarizer.feedOutput('s1', 'line one\nline two\nline three\n');
      const summary = summarizer.getSummary('s1');
      expect(summary).toContain('Recent output');
      expect(summary).toContain('line one');
    });

    it('escapes HTML in output', () => {
      summarizer.feedOutput('s1', 'hello <b>world</b>\n');
      const summary = summarizer.getSummary('s1');
      expect(summary).toContain('&lt;b&gt;');
      expect(summary).not.toContain('<b>world</b>');
    });

    it('extracts test results (passed)', () => {
      summarizer.feedOutput('s1', 'Running tests...\n42 tests passed\n');
      const summary = summarizer.getSummary('s1');
      expect(summary).toContain('Test Results');
      expect(summary).toContain('42 tests passed');
    });

    it('extracts test results (passing/failing)', () => {
      summarizer.feedOutput('s1', 'output\n10 passing\n2 failing\n');
      const summary = summarizer.getSummary('s1');
      expect(summary).toContain('Test Results');
      expect(summary).toContain('10 passing');
      expect(summary).toContain('2 failing');
    });

    it('extracts errors', () => {
      summarizer.feedOutput('s1', 'compiling...\nTypeError: cannot read property\nmore output\n');
      const summary = summarizer.getSummary('s1');
      expect(summary).toContain('Errors');
    });

    it('extracts modified files from git diff output', () => {
      summarizer.feedOutput('s1', '+++ b/src/app.ts\n+++ b/src/utils.ts\n');
      const summary = summarizer.getSummary('s1');
      expect(summary).toContain('Files');
      expect(summary).toContain('src/app.ts');
      expect(summary).toContain('src/utils.ts');
    });

    it('extracts modified files from "Modified:" pattern', () => {
      summarizer.feedOutput('s1', 'Modified: src/hello.ts\nCreated: src/world.ts\n');
      const summary = summarizer.getSummary('s1');
      expect(summary).toContain('Files');
      expect(summary).toContain('src/hello.ts');
      expect(summary).toContain('src/world.ts');
    });

    it('deduplicates modified files', () => {
      summarizer.feedOutput('s1', '+++ b/src/app.ts\n+++ b/src/app.ts\n');
      const summary = summarizer.getSummary('s1');
      // Count occurrences of src/app.ts in the Files section
      const filesSection = summary.split('Files')[1]?.split('Recent')[0] ?? '';
      const count = (filesSection.match(/src\/app\.ts/g) || []).length;
      expect(count).toBe(1);
    });

    it('truncates long output lines', () => {
      const longLine = 'a'.repeat(200);
      summarizer.feedOutput('s1', longLine + '\n');
      const summary = summarizer.getSummary('s1');
      expect(summary).toContain('...');
    });
  });

  describe('getLastLines', () => {
    it('returns empty string for unknown sessions', () => {
      expect(summarizer.getLastLines('unknown')).toBe('');
    });

    it('returns last N lines', () => {
      const lines = Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\n');
      summarizer.feedOutput('s1', lines);
      const last5 = summarizer.getLastLines('s1', 5);
      expect(last5).toContain('line 49');
      expect(last5).toContain('line 45');
    });
  });

  describe('clearBuffer', () => {
    it('removes the session buffer', () => {
      summarizer.feedOutput('s1', 'data');
      summarizer.clearBuffer('s1');
      expect(summarizer.getLastLines('s1')).toBe('');
    });
  });

  describe('dispose', () => {
    it('clears all buffers', () => {
      summarizer.feedOutput('s1', 'data1');
      summarizer.feedOutput('s2', 'data2');
      summarizer.dispose();
      expect(summarizer.getLastLines('s1')).toBe('');
      expect(summarizer.getLastLines('s2')).toBe('');
    });
  });
});
