import { describe, expect, it } from 'vitest';
import { decodeBase64Strict, decodeBase64StrictOrThrow } from '../src/utils/base64.js';
import { escapeHtmlAttribute, escapeHtmlText } from '../src/utils/html.js';
import {
  escapeHtml as escapeTelegramHtml,
  formatAgentMessageForTelegram,
  validateMobileFriendlyTelegramText,
} from '../src/telegram/utils.js';

describe('shared low-level utilities', () => {
  it('escapes HTML text nodes without changing quote output', () => {
    expect(escapeHtmlText(`A&B <tag> "quoted" 'single'`))
      .toBe(`A&amp;B &lt;tag&gt; "quoted" 'single'`);
  });

  it('escapes HTML attribute values with quote handling', () => {
    expect(escapeHtmlAttribute(`A&B <tag> "quoted" 'single'`))
      .toBe('A&amp;B &lt;tag&gt; &quot;quoted&quot; &#x27;single&#x27;');
  });

  it('keeps Telegram escape behavior on the shared attribute escaper', () => {
    expect(escapeTelegramHtml(`A&B <tag> "quoted" 'single'`))
      .toBe('A&amp;B &lt;tag&gt; &quot;quoted&quot; &#x27;single&#x27;');
  });

  it('formats agent Telegram messages with existing text-node escaping', () => {
    expect(formatAgentMessageForTelegram(`Hi <user> "ok"`))
      .toBe('Agent message:\n\nHi &lt;user&gt; "ok"');
  });

  it('validates mobile-friendly Telegram text in one shared place', () => {
    expect(() => validateMobileFriendlyTelegramText('Need a quick decision?')).not.toThrow();
    expect(() => validateMobileFriendlyTelegramText('')).toThrow('required');
    expect(() => validateMobileFriendlyTelegramText('x'.repeat(141))).toThrow('140 characters');
    expect(() => validateMobileFriendlyTelegramText('x'.repeat(1601))).toThrow('1600 characters');
  });

  it('shares strict base64 decoding with throwing and nullable call sites', () => {
    expect(decodeBase64Strict('aGVs bG8=')?.toString('utf8')).toBe('hello');
    expect(decodeBase64Strict('not base64!')).toBeNull();
    expect(decodeBase64StrictOrThrow('aGVsbG8=')?.toString('utf8')).toBe('hello');
    expect(() => decodeBase64StrictOrThrow('not base64!', 'custom base64 error')).toThrow('custom base64 error');
  });
});

