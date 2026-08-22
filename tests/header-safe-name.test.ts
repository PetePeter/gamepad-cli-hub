import { describe, it, expect } from 'vitest';
import { toHeaderSafeName } from '../src/utils/header-safe-name.js';

/** What a client actually enforces on a header value. */
const isPrintableAscii = (s: string) => /^[\x20-\x7E]*$/.test(s);

describe('toHeaderSafeName', () => {
  it('leaves an already-safe name untouched', () => {
    expect(toHeaderSafeName('Claude Code (dev) #2')).toBe('Claude Code (dev) #2');
  });

  // The regression that started this: `claude mcp add` refused the whole Helm
  // server because of the em dash, and the session lost every Helm tool.
  it('folds the em dash that broke claude mcp add', () => {
    expect(toHeaderSafeName('Windows verify — artifacts')).toBe('Windows verify - artifacts');
  });

  it('folds curly quotes and ellipsis to their ASCII spelling', () => {
    expect(toHeaderSafeName('“Oscar’s” session…')).toBe('"Oscar\'s" session...');
  });

  it('keeps accented letters recognisable instead of deleting them', () => {
    expect(toHeaderSafeName('José — café')).toBe('Jose - cafe');
  });

  it('drops emoji, which have no ASCII spelling', () => {
    expect(toHeaderSafeName('deploy 🚀 prod')).toBe('deploy  prod');
  });

  it('strips CR/LF rather than replacing them, closing header injection', () => {
    const injected = toHeaderSafeName('name\r\nX-Evil: 1');
    expect(injected).toBe('nameX-Evil: 1');
    expect(injected).not.toMatch(/[\r\n]/);
  });

  it('falls back to a placeholder when nothing survives', () => {
    expect(toHeaderSafeName('🎉🎉')).toBe('session');
    expect(toHeaderSafeName('')).toBe('session');
  });

  it('never emits a character a client would reject', () => {
    const hostile = ['Windows verify — artifacts', 'José', '🚀', 'a\r\nb', '日本語', 'ünïcødé 名前'];
    for (const name of hostile) {
      expect(isPrintableAscii(toHeaderSafeName(name))).toBe(true);
    }
  });
});
