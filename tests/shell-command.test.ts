import { describe, expect, it } from 'vitest';
import { normalizeCmdInput } from '../renderer/utils/shell-command.js';

describe('normalizeCmdInput', () => {
  it('converts multiline setup snippets into cmd.exe submissions', () => {
    expect(normalizeCmdInput('set A=1\nset B=2\ncodex mcp add helm')).toBe(
      'set A=1\rset B=2\rcodex mcp add helm\r',
    );
  });

  it('normalizes existing CRLF input without adding blank submissions', () => {
    expect(normalizeCmdInput('set A=1\r\ncodex mcp add helm')).toBe('set A=1\rcodex mcp add helm\r');
  });
});
