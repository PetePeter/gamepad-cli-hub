import { describe, it, expect } from 'vitest';
import {
  JUMP_SLOT_COUNT,
  jumpKeyLabel,
  jumpButtonToPosition,
} from '../renderer/utils/jump-keys.js';

describe('jumpKeyLabel', () => {
  it('labels the first nine rows 1..9', () => {
    expect(jumpKeyLabel(0)).toBe(1);
    expect(jumpKeyLabel(8)).toBe(9);
  });

  it('labels the tenth row 0', () => {
    expect(jumpKeyLabel(9)).toBe(0);
  });

  it('returns null beyond the tenth row', () => {
    expect(jumpKeyLabel(10)).toBeNull();
    expect(jumpKeyLabel(99)).toBeNull();
  });

  it('returns null for negative positions', () => {
    expect(jumpKeyLabel(-1)).toBeNull();
  });

  it('numbers exactly JUMP_SLOT_COUNT rows', () => {
    const labelled = Array.from({ length: 30 }, (_, i) => jumpKeyLabel(i)).filter(l => l !== null);
    expect(labelled).toHaveLength(JUMP_SLOT_COUNT);
  });
});

describe('jumpButtonToPosition', () => {
  it('maps Digit1..Digit9 to positions 0..8', () => {
    expect(jumpButtonToPosition('Digit1')).toBe(0);
    expect(jumpButtonToPosition('Digit9')).toBe(8);
  });

  it('maps Digit0 to position 9 (the tenth row)', () => {
    expect(jumpButtonToPosition('Digit0')).toBe(9);
  });

  it('returns null for non-digit buttons', () => {
    expect(jumpButtonToPosition('A')).toBeNull();
    expect(jumpButtonToPosition('DPadUp')).toBeNull();
    expect(jumpButtonToPosition('Digit12')).toBeNull();
  });

  it('round-trips with jumpKeyLabel', () => {
    for (let pos = 0; pos < JUMP_SLOT_COUNT; pos++) {
      const label = jumpKeyLabel(pos);
      expect(jumpButtonToPosition(`Digit${label}`)).toBe(pos);
    }
  });
});
