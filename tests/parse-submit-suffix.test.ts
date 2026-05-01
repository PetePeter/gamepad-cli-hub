/**
 * Unit tests for parseSubmitSuffix helper — used in both renderer and Helm MCP.
 *
 * parseSubmitSuffix converts escape notation strings (e.g., '\\r', '\\n', '\\r\\n')
 * to their actual control characters (CR, LF, CRLF). This is used to determine
 * how text is submitted when delivered to a PTY or CLI session.
 *
 * Note: This test file imports parseSubmitSuffix directly from the renderer module
 * to test the identical implementation found in both renderer and Helm MCP.
 */

import { describe, it, expect } from 'vitest';
import { parseSubmitSuffix } from '../renderer/paste-handler';

// =============================================================================
// parseSubmitSuffix — escape sequence parsing for submit behavior
// =============================================================================

describe('parseSubmitSuffix (renderer)', () => {
  describe('escape sequence parsing', () => {
    it('converts escape notation \\r to CR character', () => {
      expect(parseSubmitSuffix('\\r')).toBe('\r');
    });

    it('converts escape notation \\n to LF character', () => {
      expect(parseSubmitSuffix('\\n')).toBe('\n');
    });

    it('converts escape notation \\t to TAB character', () => {
      expect(parseSubmitSuffix('\\t')).toBe('\t');
    });

    it('converts escape notation \\r\\n to CRLF sequence', () => {
      expect(parseSubmitSuffix('\\r\\n')).toBe('\r\n');
    });

    it('handles mixed sequences like \\r\\n\\r (passthrough)', () => {
      // Only exact matches for \\r, \\n, \\t, \\r\\n are parsed.
      // \\r\\n\\r is not an exact match, so it passes through as-is.
      expect(parseSubmitSuffix('\\r\\n\\r')).toBe('\\r\\n\\r');
    });
  });

  describe('default behavior', () => {
    it('returns CR character when suffix is undefined', () => {
      expect(parseSubmitSuffix()).toBe('\r');
    });

    it('returns CR character when suffix is empty string', () => {
      expect(parseSubmitSuffix('')).toBe('\r');
    });

    it('returns CR character when suffix is null (falsy)', () => {
      expect(parseSubmitSuffix(null as unknown as string)).toBe('\r');
    });

    it('passes through whitespace-only string (not empty/falsy)', () => {
      // parseSubmitSuffix checks 'if (!suffix)', which is falsy check.
      // Whitespace-only string '   ' is truthy, so it passes through.
      expect(parseSubmitSuffix('   ')).toBe('   ');
    });
  });

  describe('edge cases', () => {
    it('passes through unrecognized strings as-is', () => {
      expect(parseSubmitSuffix('foo')).toBe('foo');
    });

    it('passes through arbitrary text without parsing', () => {
      expect(parseSubmitSuffix('hello world')).toBe('hello world');
    });

    it('preserves backslash in non-recognized sequences', () => {
      expect(parseSubmitSuffix('\\x')).toBe('\\x');
    });

    it('does not parse sequences inside larger strings', () => {
      // Only exact matches are parsed, e.g. just '\\r', not 'prefix\\rsuffix'
      expect(parseSubmitSuffix('prefix\\r')).toBe('prefix\\r');
    });

    it('differentiates between \\r and \\r\\n', () => {
      const cr = parseSubmitSuffix('\\r');
      const crlf = parseSubmitSuffix('\\r\\n');
      expect(cr).not.toBe(crlf);
      expect(cr).toBe('\r');
      expect(crlf).toBe('\r\n');
    });

    it('is case-sensitive (does not parse \\R as CR)', () => {
      expect(parseSubmitSuffix('\\R')).toBe('\\R');
    });

    it('handles actual control characters in input', () => {
      // If someone passes an actual CR character, it should pass through
      expect(parseSubmitSuffix('\r')).toBe('\r');
    });

    it('handles actual LF character in input', () => {
      expect(parseSubmitSuffix('\n')).toBe('\n');
    });

    it('handles actual TAB character in input', () => {
      expect(parseSubmitSuffix('\t')).toBe('\t');
    });

    it('handles actual CRLF sequence in input', () => {
      expect(parseSubmitSuffix('\r\n')).toBe('\r\n');
    });
  });

  describe('idempotency and stability', () => {
    it('returns consistent results for the same input', () => {
      const input = '\\r';
      expect(parseSubmitSuffix(input)).toBe(parseSubmitSuffix(input));
    });

    it('parsing twice does not change the result', () => {
      // First parse: '\\r' → '\r'
      const firstParse = parseSubmitSuffix('\\r');
      // Second parse: '\r' → '\r' (passthrough, not a recognized escape sequence)
      const secondParse = parseSubmitSuffix(firstParse);
      expect(secondParse).toBe('\r');
    });
  });

  describe('all control characters have unique outputs', () => {
    it('CR, LF, TAB, and CRLF all produce distinct results', () => {
      const cr = parseSubmitSuffix('\\r');
      const lf = parseSubmitSuffix('\\n');
      const tab = parseSubmitSuffix('\\t');
      const crlf = parseSubmitSuffix('\\r\\n');

      const results = [cr, lf, tab, crlf];
      const uniqueResults = new Set(results.map(r => JSON.stringify(r)));
      expect(uniqueResults.size).toBe(4);
    });
  });

  describe('practical usage scenarios', () => {
    it('can be used to configure CR-only submission (macOS classic)', () => {
      const result = parseSubmitSuffix('\\r');
      expect(result).toBe('\r');
    });

    it('can be used to configure LF-only submission (Unix)', () => {
      const result = parseSubmitSuffix('\\n');
      expect(result).toBe('\n');
    });

    it('can be used to configure CRLF submission (Windows)', () => {
      const result = parseSubmitSuffix('\\r\\n');
      expect(result).toBe('\r\n');
    });

    it('handles unspecified suffix gracefully with CR default', () => {
      const unspecified = parseSubmitSuffix(undefined);
      const empty = parseSubmitSuffix('');
      expect(unspecified).toBe('\r');
      expect(empty).toBe('\r');
    });

    it('preserves unrecognized config strings for app-specific handling', () => {
      // If a tool has a custom suffix value like 'custom-suffix',
      // it passes through unchanged
      const custom = parseSubmitSuffix('custom-suffix');
      expect(custom).toBe('custom-suffix');
    });
  });
});
