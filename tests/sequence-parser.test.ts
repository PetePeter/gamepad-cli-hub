// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import { parseSequence, formatSequencePreview, type SequenceAction } from '../src/input/sequence-parser';

describe('parseSequence', () => {
  describe('plain text', () => {
    it('returns empty array for empty string', () => {
      expect(parseSequence('')).toEqual([]);
    });

    it('parses single character', () => {
      expect(parseSequence('a')).toEqual([{ type: 'text', value: 'a' }]);
    });

    it('collapses adjacent characters into one text action', () => {
      expect(parseSequence('hello')).toEqual([{ type: 'text', value: 'hello' }]);
    });

    it('preserves special characters in text', () => {
      expect(parseSequence('#@!$%')).toEqual([{ type: 'text', value: '#@!$%' }]);
    });

    it('preserves spaces in text', () => {
      expect(parseSequence('hello world')).toEqual([{ type: 'text', value: 'hello world' }]);
    });
  });

  describe('special keys', () => {
    it('parses {Enter}', () => {
      expect(parseSequence('{Enter}')).toEqual([{ type: 'key', key: 'Enter' }]);
    });

    it('parses {Tab}', () => {
      expect(parseSequence('{Tab}')).toEqual([{ type: 'key', key: 'Tab' }]);
    });

    it('parses {F5}', () => {
      expect(parseSequence('{F5}')).toEqual([{ type: 'key', key: 'F5' }]);
    });

    it('parses {Esc}', () => {
      expect(parseSequence('{Esc}')).toEqual([{ type: 'key', key: 'Esc' }]);
    });

    it('parses {Space}', () => {
      expect(parseSequence('{Space}')).toEqual([{ type: 'key', key: 'Space' }]);
    });
  });

  describe('{Send} token', () => {
    it('parses {Send} as key action', () => {
      expect(parseSequence('{Send}')).toEqual([{ type: 'key', key: 'Send' }]);
    });

    it('parses text{Send} as text + key', () => {
      expect(parseSequence('hello{Send}')).toEqual([
        { type: 'text', value: 'hello' },
        { type: 'key', key: 'Send' },
      ]);
    });
  });

  describe('combos', () => {
    it('parses {Ctrl+S}', () => {
      expect(parseSequence('{Ctrl+S}')).toEqual([{ type: 'combo', keys: ['Ctrl', 'S'] }]);
    });

    it('parses {Ctrl+Shift+P} as three-key combo', () => {
      expect(parseSequence('{Ctrl+Shift+P}')).toEqual([
        { type: 'combo', keys: ['Ctrl', 'Shift', 'P'] },
      ]);
    });

    it('parses {Alt+F4}', () => {
      expect(parseSequence('{Alt+F4}')).toEqual([{ type: 'combo', keys: ['Alt', 'F4'] }]);
    });
  });

  describe('modifier holds', () => {
    it('parses {Ctrl Down}', () => {
      expect(parseSequence('{Ctrl Down}')).toEqual([{ type: 'modDown', key: 'Ctrl' }]);
    });

    it('parses {Ctrl Up}', () => {
      expect(parseSequence('{Ctrl Up}')).toEqual([{ type: 'modUp', key: 'Ctrl' }]);
    });

    it('parses {Shift Down}', () => {
      expect(parseSequence('{Shift Down}')).toEqual([{ type: 'modDown', key: 'Shift' }]);
    });

    it('parses {Shift Up}', () => {
      expect(parseSequence('{Shift Up}')).toEqual([{ type: 'modUp', key: 'Shift' }]);
    });

    it('is case-insensitive for Down/Up keywords', () => {
      expect(parseSequence('{Alt down}')).toEqual([{ type: 'modDown', key: 'Alt' }]);
      expect(parseSequence('{Alt UP}')).toEqual([{ type: 'modUp', key: 'Alt' }]);
    });
  });

  describe('wait', () => {
    it('parses {Wait 500}', () => {
      expect(parseSequence('{Wait 500}')).toEqual([{ type: 'wait', ms: 500 }]);
    });

    it('parses {Wait 2000}', () => {
      expect(parseSequence('{Wait 2000}')).toEqual([{ type: 'wait', ms: 2000 }]);
    });

    it('parses {Wait 0}', () => {
      expect(parseSequence('{Wait 0}')).toEqual([{ type: 'wait', ms: 0 }]);
    });

    it('is case-insensitive for Wait keyword', () => {
      expect(parseSequence('{wait 100}')).toEqual([{ type: 'wait', ms: 100 }]);
      expect(parseSequence('{WAIT 200}')).toEqual([{ type: 'wait', ms: 200 }]);
    });

    it('caps wait at 30 seconds', () => {
      expect(parseSequence('{Wait 999999}')).toEqual([{ type: 'wait', ms: 30000 }]);
    });
  });

  describe('literal braces', () => {
    it('converts {{ to literal {', () => {
      expect(parseSequence('{{')).toEqual([{ type: 'text', value: '{' }]);
    });

    it('converts }} to literal }', () => {
      expect(parseSequence('}}')).toEqual([{ type: 'text', value: '}' }]);
    });

    it('handles {{ and }} inside text', () => {
      expect(parseSequence('a{{b}}c')).toEqual([{ type: 'text', value: 'a{b}c' }]);
    });
  });

  describe('newlines', () => {
    it('converts \\n to Enter key', () => {
      expect(parseSequence('\n')).toEqual([{ type: 'key', key: 'Enter' }]);
    });

    it('splits text around newlines', () => {
      expect(parseSequence('a\nb')).toEqual([
        { type: 'text', value: 'a' },
        { type: 'key', key: 'Enter' },
        { type: 'text', value: 'b' },
      ]);
    });

    it('handles multiple consecutive newlines', () => {
      expect(parseSequence('\n\n')).toEqual([
        { type: 'key', key: 'Enter' },
        { type: 'key', key: 'Enter' },
      ]);
    });
  });

  describe('mixed sequences', () => {
    it('parses /clear{Enter} as text + key', () => {
      expect(parseSequence('/clear{Enter}')).toEqual([
        { type: 'text', value: '/clear' },
        { type: 'key', key: 'Enter' },
      ]);
    });

    it('parses {Ctrl+L}/clear{Enter} as combo + text + key', () => {
      expect(parseSequence('{Ctrl+L}/clear{Enter}')).toEqual([
        { type: 'combo', keys: ['Ctrl', 'L'] },
        { type: 'text', value: '/clear' },
        { type: 'key', key: 'Enter' },
      ]);
    });

    it('handles text between keys', () => {
      expect(parseSequence('{Tab}hello{Enter}')).toEqual([
        { type: 'key', key: 'Tab' },
        { type: 'text', value: 'hello' },
        { type: 'key', key: 'Enter' },
      ]);
    });
  });

  describe('multi-line sequences', () => {
    it('parses /allow-all\\nsomething\\n{Ctrl+S}', () => {
      expect(parseSequence('/allow-all\nsomething\n{Ctrl+S}')).toEqual([
        { type: 'text', value: '/allow-all' },
        { type: 'key', key: 'Enter' },
        { type: 'text', value: 'something' },
        { type: 'key', key: 'Enter' },
        { type: 'combo', keys: ['Ctrl', 'S'] },
      ]);
    });

    it('handles trailing newline', () => {
      expect(parseSequence('hello\n')).toEqual([
        { type: 'text', value: 'hello' },
        { type: 'key', key: 'Enter' },
      ]);
    });
  });

  describe('edge cases', () => {
    it('treats unclosed brace as literal text', () => {
      expect(parseSequence('hello{world')).toEqual([{ type: 'text', value: 'hello{world' }]);
    });

    it('skips empty {}', () => {
      expect(parseSequence('a{}b')).toEqual([{ type: 'text', value: 'ab' }]);
    });

    it('handles consecutive special keys', () => {
      expect(parseSequence('{Tab}{Tab}{Enter}')).toEqual([
        { type: 'key', key: 'Tab' },
        { type: 'key', key: 'Tab' },
        { type: 'key', key: 'Enter' },
      ]);
    });

    it('passes through unknown keys as-is', () => {
      expect(parseSequence('{FooBar}')).toEqual([{ type: 'key', key: 'FooBar' }]);
    });

    it('handles lone closing brace as literal text', () => {
      expect(parseSequence('a}b')).toEqual([{ type: 'text', value: 'a}b' }]);
    });

    it('handles modifier hold + text + modifier release', () => {
      expect(parseSequence('{Ctrl Down}c{Ctrl Up}')).toEqual([
        { type: 'modDown', key: 'Ctrl' },
        { type: 'text', value: 'c' },
        { type: 'modUp', key: 'Ctrl' },
      ]);
    });

    it('handles wait in a mixed sequence', () => {
      expect(parseSequence('hello{Wait 100}{Enter}')).toEqual([
        { type: 'text', value: 'hello' },
        { type: 'wait', ms: 100 },
        { type: 'key', key: 'Enter' },
      ]);
    });

    it('filters empty keys in combos like {+A}', () => {
      const result = parseSequence('{+A}');
      expect(result).toEqual([{ type: 'combo', keys: ['A'] }]);
    });
  });
});

describe('formatSequencePreview', () => {
  it('formats text action', () => {
    const actions: SequenceAction[] = [{ type: 'text', value: 'hello' }];
    expect(formatSequencePreview(actions)).toBe('Type "hello"');
  });

  it('formats key action', () => {
    const actions: SequenceAction[] = [{ type: 'key', key: 'Enter' }];
    expect(formatSequencePreview(actions)).toBe('Enter');
  });

  it('formats combo action', () => {
    const actions: SequenceAction[] = [{ type: 'combo', keys: ['Ctrl', 'S'] }];
    expect(formatSequencePreview(actions)).toBe('Ctrl+S');
  });

  it('formats modDown action', () => {
    const actions: SequenceAction[] = [{ type: 'modDown', key: 'Ctrl' }];
    expect(formatSequencePreview(actions)).toBe('Ctrl ↓');
  });

  it('formats modUp action', () => {
    const actions: SequenceAction[] = [{ type: 'modUp', key: 'Ctrl' }];
    expect(formatSequencePreview(actions)).toBe('Ctrl ↑');
  });

  it('formats wait action', () => {
    const actions: SequenceAction[] = [{ type: 'wait', ms: 500 }];
    expect(formatSequencePreview(actions)).toBe('Wait 500ms');
  });

  it('joins multiple actions with arrow separator', () => {
    const actions: SequenceAction[] = [
      { type: 'text', value: '/clear' },
      { type: 'key', key: 'Enter' },
      { type: 'combo', keys: ['Ctrl', 'S'] },
    ];
    expect(formatSequencePreview(actions)).toBe('Type "/clear" → Enter → Ctrl+S');
  });

  it('returns empty string for empty actions', () => {
    expect(formatSequencePreview([])).toBe('');
  });
});
