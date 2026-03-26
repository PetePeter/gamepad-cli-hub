/**
 * Renderer utils — shared helper function tests.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect } from 'vitest';
import { getSequenceSyntaxHelpText } from '../renderer/utils.js';

describe('getSequenceSyntaxHelpText', () => {
  it('returns a non-empty string', () => {
    const text = getSequenceSyntaxHelpText();
    expect(text.length).toBeGreaterThan(0);
  });

  it('contains Enter key reference', () => {
    const text = getSequenceSyntaxHelpText();
    expect(text).toContain('{Enter}');
  });

  it('contains Ctrl combo reference', () => {
    const text = getSequenceSyntaxHelpText();
    expect(text).toContain('{Ctrl+');
  });

  it('contains Wait delay reference', () => {
    const text = getSequenceSyntaxHelpText();
    expect(text).toContain('{Wait');
  });

  it('contains modifier key list', () => {
    const text = getSequenceSyntaxHelpText();
    expect(text).toContain('Ctrl');
    expect(text).toContain('Alt');
    expect(text).toContain('Shift');
  });

  it('contains escaped brace syntax', () => {
    const text = getSequenceSyntaxHelpText();
    expect(text).toContain('{{');
    expect(text).toContain('}}');
  });
});
