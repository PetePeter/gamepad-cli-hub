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
import { parseSubmitSuffix as parseSubmitSuffixRenderer } from '../renderer/paste-handler';
import { parseSubmitSuffix as parseSubmitSuffixMcp } from '../src/mcp/submit-suffix';

// =============================================================================
// parseSubmitSuffix — escape sequence parsing for submit behavior
// =============================================================================

describe('parseSubmitSuffix (renderer)', () => {
  describe('escape sequence parsing', () => {
    it('converts escape notation \\r to CR character', () => {
      expect(parseSubmitSuffixRenderer('\\r')).toBe('\r');
    });

    it('converts escape notation \\n to LF character', () => {
      expect(parseSubmitSuffixRenderer('\\n')).toBe('\n');
    });

    it('converts escape notation \\t to TAB character', () => {
      expect(parseSubmitSuffixRenderer('\\t')).toBe('\t');
    });

    it('converts escape notation \\r\\n to CRLF sequence', () => {
      expect(parseSubmitSuffixRenderer('\\r\\n')).toBe('\r\n');
    });

    it('handles mixed sequences like \\r\\n\\r (passthrough)', () => {
      // Only exact matches for \\r, \\n, \\t, \\r\\n are parsed.
      // \\r\\n\\r is not an exact match, so it passes through as-is.
      expect(parseSubmitSuffixRenderer('\\r\\n\\r')).toBe('\\r\\n\\r');
    });
  });

  describe('default behavior', () => {
    it('returns CR character when suffix is undefined', () => {
      expect(parseSubmitSuffixRenderer()).toBe('\r');
    });

    it('returns CR character when suffix is empty string', () => {
      expect(parseSubmitSuffixRenderer('')).toBe('\r');
    });

    it('returns CR character when suffix is null (falsy)', () => {
      expect(parseSubmitSuffixRenderer(null as unknown as string)).toBe('\r');
    });

    it('passes through whitespace-only string (not empty/falsy)', () => {
      // parseSubmitSuffix checks 'if (!suffix)', which is falsy check.
      // Whitespace-only string '   ' is truthy, so it passes through.
      expect(parseSubmitSuffixRenderer('   ')).toBe('   ');
    });
  });

  describe('edge cases', () => {
    it('passes through unrecognized strings as-is', () => {
      expect(parseSubmitSuffixRenderer('foo')).toBe('foo');
    });

    it('passes through arbitrary text without parsing', () => {
      expect(parseSubmitSuffixRenderer('hello world')).toBe('hello world');
    });

    it('preserves backslash in non-recognized sequences', () => {
      expect(parseSubmitSuffixRenderer('\\x')).toBe('\\x');
    });

    it('does not parse sequences inside larger strings', () => {
      // Only exact matches are parsed, e.g. just '\\r', not 'prefix\\rsuffix'
      expect(parseSubmitSuffixRenderer('prefix\\r')).toBe('prefix\\r');
    });

    it('differentiates between \\r and \\r\\n', () => {
      const cr = parseSubmitSuffixRenderer('\\r');
      const crlf = parseSubmitSuffixRenderer('\\r\\n');
      expect(cr).not.toBe(crlf);
      expect(cr).toBe('\r');
      expect(crlf).toBe('\r\n');
    });

    it('is case-sensitive (does not parse \\R as CR)', () => {
      expect(parseSubmitSuffixRenderer('\\R')).toBe('\\R');
    });

    it('handles actual control characters in input', () => {
      // If someone passes an actual CR character, it should pass through
      expect(parseSubmitSuffixRenderer('\r')).toBe('\r');
    });

    it('handles actual LF character in input', () => {
      expect(parseSubmitSuffixRenderer('\n')).toBe('\n');
    });

    it('handles actual TAB character in input', () => {
      expect(parseSubmitSuffixRenderer('\t')).toBe('\t');
    });

    it('handles actual CRLF sequence in input', () => {
      expect(parseSubmitSuffixRenderer('\r\n')).toBe('\r\n');
    });
  });

  describe('idempotency and stability', () => {
    it('returns consistent results for the same input', () => {
      const input = '\\r';
      expect(parseSubmitSuffixRenderer(input)).toBe(parseSubmitSuffixRenderer(input));
    });

    it('parsing twice does not change the result', () => {
      // First parse: '\\r' → '\r'
      const firstParse = parseSubmitSuffixRenderer('\\r');
      // Second parse: '\r' → '\r' (passthrough, not a recognized escape sequence)
      const secondParse = parseSubmitSuffixRenderer(firstParse);
      expect(secondParse).toBe('\r');
    });
  });

  describe('all control characters have unique outputs', () => {
    it('CR, LF, TAB, and CRLF all produce distinct results', () => {
      const cr = parseSubmitSuffixRenderer('\\r');
      const lf = parseSubmitSuffixRenderer('\\n');
      const tab = parseSubmitSuffixRenderer('\\t');
      const crlf = parseSubmitSuffixRenderer('\\r\\n');

      const results = [cr, lf, tab, crlf];
      const uniqueResults = new Set(results.map(r => JSON.stringify(r)));
      expect(uniqueResults.size).toBe(4);
    });
  });

  describe('practical usage scenarios', () => {
    it('can be used to configure CR-only submission (macOS classic)', () => {
      const result = parseSubmitSuffixRenderer('\\r');
      expect(result).toBe('\r');
    });

    it('can be used to configure LF-only submission (Unix)', () => {
      const result = parseSubmitSuffixRenderer('\\n');
      expect(result).toBe('\n');
    });

    it('can be used to configure CRLF submission (Windows)', () => {
      const result = parseSubmitSuffixRenderer('\\r\\n');
      expect(result).toBe('\r\n');
    });

    it('handles unspecified suffix gracefully with CR default', () => {
      const unspecified = parseSubmitSuffixRenderer(undefined);
      const empty = parseSubmitSuffixRenderer('');
      expect(unspecified).toBe('\r');
      expect(empty).toBe('\r');
    });

    it('preserves unrecognized config strings for app-specific handling', () => {
      // If a tool has a custom suffix value like 'custom-suffix',
      // it passes through unchanged
      const custom = parseSubmitSuffixRenderer('custom-suffix');
      expect(custom).toBe('custom-suffix');
    });
  });
});

// =============================================================================
// parseSubmitSuffix (MCP) — sequence parser support for submit behavior
// =============================================================================

describe('parseSubmitSuffix (MCP)', () => {
  describe('escape sequence parsing', () => {
    it('converts escape notation \\r to CR character', () => {
      expect(parseSubmitSuffixMcp('\\r')).toBe('\r');
    });

    it('converts escape notation \\n to LF character', () => {
      expect(parseSubmitSuffixMcp('\\n')).toBe('\n');
    });

    it('converts escape notation \\t to TAB character', () => {
      expect(parseSubmitSuffixMcp('\\t')).toBe('\t');
    });

    it('converts escape notation \\r\\n to CRLF sequence', () => {
      expect(parseSubmitSuffixMcp('\\r\\n')).toBe('\r\n');
    });
  });

  describe('sequence syntax parsing (new feature)', () => {
    it('parses {Send} sequence action to CR character', () => {
      expect(parseSubmitSuffixMcp('{Send}')).toBe('\r');
    });

    it('parses {Enter} sequence action to CR character', () => {
      expect(parseSubmitSuffixMcp('{Enter}')).toBe('\r');
    });

    it('parses {Ctrl+D} sequence action to EOF character', () => {
      // Ctrl+D = chr(0x04) (ASCII EOT)
      expect(parseSubmitSuffixMcp('{Ctrl+D}')).toBe('\x04');
    });

    it('parses {Ctrl+C} sequence action to SIGINT character', () => {
      // Ctrl+C = chr(0x03) (ASCII ETX)
      expect(parseSubmitSuffixMcp('{Ctrl+C}')).toBe('\x03');
    });

    it('parses {Ctrl+Z} sequence action correctly', () => {
      // Ctrl+Z = chr(0x1a) (ASCII SUB)
      expect(parseSubmitSuffixMcp('{Ctrl+Z}')).toBe('\x1a');
    });

    it('parses {Tab} sequence action to TAB escape', () => {
      expect(parseSubmitSuffixMcp('{Tab}')).toBe('\t');
    });

    it('parses {Esc} sequence action to ESC escape', () => {
      expect(parseSubmitSuffixMcp('{Esc}')).toBe('\x1b');
    });

    it('parses {F1} sequence action to F1 escape sequence', () => {
      expect(parseSubmitSuffixMcp('{F1}')).toBe('\x1bOP');
    });

    it('skips {Wait N} actions and returns empty (falls through to suffix)', () => {
      // {Wait 100} should be skipped. Since it's the only action, result is empty.
      expect(parseSubmitSuffixMcp('{Wait 100}')).toBe('{Wait 100}');
    });

    it('skips {noSubmit} actions', () => {
      // {noSubmit} is skipped. Since it's the only action, result is empty, falls through.
      expect(parseSubmitSuffixMcp('{noSubmit}')).toBe('{noSubmit}');
    });
  });

  describe('default behavior', () => {
    it('returns CR character when suffix is undefined', () => {
      expect(parseSubmitSuffixMcp()).toBe('\r');
    });

    it('returns CR character when suffix is empty string', () => {
      expect(parseSubmitSuffixMcp('')).toBe('\r');
    });

    it('returns CR character when suffix is null (falsy)', () => {
      expect(parseSubmitSuffixMcp(null as unknown as string)).toBe('\r');
    });
  });

  describe('edge cases and fallthrough', () => {
    it('passes through unrecognized strings as-is', () => {
      expect(parseSubmitSuffixMcp('hello')).toBe('hello');
    });

    it('passes through whitespace-only string (not empty/falsy)', () => {
      expect(parseSubmitSuffixMcp('   ')).toBe('   ');
    });

    it('falls through when sequence parsing produces empty result', () => {
      // A sequence with only skip-actions (wait, noSubmit, modDown, modUp)
      // should result in empty string, then fall through to original suffix
      expect(parseSubmitSuffixMcp('{Wait 100}')).toBe('{Wait 100}');
    });

    it('handles text + sequence syntax mixed', () => {
      // Input "\\r{Send}" is NOT an exact match for the escape notation,
      // so it goes through sequence parsing. Sequence parser treats backslash-r
      // as plain text (not as escape notation), then {Send} as a key action.
      // Result: literal backslash + r + CR character (3 chars: \ + r + CR)
      expect(parseSubmitSuffixMcp('\\r{Send}')).toBe('\\r\r');
    });

    it('handles actual control characters in input', () => {
      // If someone passes an actual CR character, it should pass through
      expect(parseSubmitSuffixMcp('\r')).toBe('\r');
    });
  });

  describe('practical usage scenarios (MCP-specific)', () => {
    it('can submit via {Send} token from profile YAML', () => {
      const result = parseSubmitSuffixMcp('{Send}');
      expect(result).toBe('\r');
    });

    it('can submit via {Enter} token from profile YAML', () => {
      const result = parseSubmitSuffixMcp('{Enter}');
      expect(result).toBe('\r');
    });

    it('can send Ctrl+D (EOF) to terminate a session', () => {
      const result = parseSubmitSuffixMcp('{Ctrl+D}');
      expect(result).toBe('\x04');
    });

    it('maintains backward compatibility with escape notation', () => {
      const result = parseSubmitSuffixMcp('\\r');
      expect(result).toBe('\r');
    });

    it('defaults to CR when no suffix is specified', () => {
      expect(parseSubmitSuffixMcp(undefined)).toBe('\r');
    });
  });
});
