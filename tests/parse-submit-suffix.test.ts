import { describe, it, expect } from 'vitest';
import { parseSubmitSuffix as parseSubmitSuffixRenderer } from '../renderer/paste-handler';
import { parseSubmitSuffix as parseSubmitSuffixMcp } from '../src/mcp/submit-suffix';

describe('parseSubmitSuffix (renderer)', () => {
  it('converts \\r, \\n, \\t escape notation to control characters', () => {
    expect(parseSubmitSuffixRenderer('\\r')).toBe('\r');
    expect(parseSubmitSuffixRenderer('\\n')).toBe('\n');
    expect(parseSubmitSuffixRenderer('\\t')).toBe('\t');
    expect(parseSubmitSuffixRenderer('\\r\\n')).toBe('\r\n');
  });

  it('defaults to CR when undefined, null, or empty string', () => {
    expect(parseSubmitSuffixRenderer()).toBe('\r');
    expect(parseSubmitSuffixRenderer('')).toBe('\r');
    expect(parseSubmitSuffixRenderer(null as unknown as string)).toBe('\r');
  });

  it('passes through unrecognized strings as-is', () => {
    expect(parseSubmitSuffixRenderer('foo')).toBe('foo');
    expect(parseSubmitSuffixRenderer('prefix\\r')).toBe('prefix\\r');
    expect(parseSubmitSuffixRenderer('\\x')).toBe('\\x');
  });

  it('passes through whitespace-only string (truthy, not converted)', () => {
    expect(parseSubmitSuffixRenderer('   ')).toBe('   ');
  });

  it('\\r\\n partial match does not parse as double-escape', () => {
    expect(parseSubmitSuffixRenderer('\\r\\n\\r')).toBe('\\r\\n\\r');
  });
});

describe('parseSubmitSuffix (MCP)', () => {
  it('converts \\r, \\n, \\t escape notation to control characters', () => {
    expect(parseSubmitSuffixMcp('\\r')).toBe('\r');
    expect(parseSubmitSuffixMcp('\\n')).toBe('\n');
    expect(parseSubmitSuffixMcp('\\t')).toBe('\t');
    expect(parseSubmitSuffixMcp('\\r\\n')).toBe('\r\n');
  });

  it('defaults to CR when undefined, null, or empty string', () => {
    expect(parseSubmitSuffixMcp()).toBe('\r');
    expect(parseSubmitSuffixMcp('')).toBe('\r');
    expect(parseSubmitSuffixMcp(null as unknown as string)).toBe('\r');
  });

  it('parses sequence tokens to their control characters', () => {
    expect(parseSubmitSuffixMcp('{Send}')).toBe('\r');
    expect(parseSubmitSuffixMcp('{Enter}')).toBe('\r');
    expect(parseSubmitSuffixMcp('{Ctrl+D}')).toBe('\x04');
    expect(parseSubmitSuffixMcp('{Ctrl+C}')).toBe('\x03');
    expect(parseSubmitSuffixMcp('{Tab}')).toBe('\t');
    expect(parseSubmitSuffixMcp('{Esc}')).toBe('\x1b');
    expect(parseSubmitSuffixMcp('{F1}')).toBe('\x1bOP');
  });

  it('passes through unrecognized strings and skip-actions', () => {
    expect(parseSubmitSuffixMcp('hello')).toBe('hello');
    expect(parseSubmitSuffixMcp('{Wait 100}')).toBe('{Wait 100}');
    expect(parseSubmitSuffixMcp('{noSubmit}')).toBe('{noSubmit}');
  });
});
