import { describe, it, expect } from 'vitest';
import { parseAccentColor, contrastText } from '../src/session/color-contrast.js';

describe('parseAccentColor', () => {
  it('normalises Windows rrggbbaa to #rrggbb', () => {
    expect(parseAccentColor('0078d4ff')).toBe('#0078d4');
  });

  it('accepts a 6-digit value with or without a leading #', () => {
    expect(parseAccentColor('#4fd08b')).toBe('#4fd08b');
    expect(parseAccentColor('4FD08B')).toBe('#4fd08b');
  });

  it('returns null for empty or malformed input', () => {
    expect(parseAccentColor('')).toBeNull();
    expect(parseAccentColor(null)).toBeNull();
    expect(parseAccentColor(undefined)).toBeNull();
    expect(parseAccentColor('nothex')).toBeNull();
    expect(parseAccentColor('12345')).toBeNull();
  });
});

describe('contrastText', () => {
  it('returns dark text on a light accent', () => {
    expect(contrastText('#ffffff')).toBe('#000000');
    expect(contrastText('#ffd400')).toBe('#000000'); // bright yellow
  });

  it('returns light text on a dark accent', () => {
    expect(contrastText('#000000')).toBe('#ffffff');
    expect(contrastText('#0a3d91')).toBe('#ffffff'); // deep blue
  });

  it('resolves boundary colours deterministically either side of the threshold', () => {
    // Dark grey sits below the WCAG luminance threshold → white text.
    expect(contrastText('#595959')).toBe('#ffffff');
    // Lighter grey crosses the threshold → black text.
    expect(contrastText('#999999')).toBe('#000000');
  });

  it('falls back to light text for an unparseable colour', () => {
    expect(contrastText('bogus')).toBe('#ffffff');
  });
});
