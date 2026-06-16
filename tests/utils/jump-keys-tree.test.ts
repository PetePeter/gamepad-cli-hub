/**
 * Tree picker jump-key unit tests — 36-slot accelerator indexing.
 *
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import {
  treeJumpKeyLabel,
  treeJumpButtonToPosition,
  TREE_JUMP_SLOT_COUNT,
} from '../../renderer/utils/jump-keys.js';

describe('TREE_JUMP_SLOT_COUNT', () => {
  it('is 36 (10 digits + 26 letters)', () => {
    expect(TREE_JUMP_SLOT_COUNT).toBe(36);
  });
});

describe('treeJumpKeyLabel', () => {
  it('returns "1".."9" for positions 0-8', () => {
    for (let i = 0; i < 9; i++) {
      expect(treeJumpKeyLabel(i)).toBe(String(i + 1));
    }
  });

  it('returns "0" for position 9', () => {
    expect(treeJumpKeyLabel(9)).toBe('0');
  });

  it('returns "a" for position 10', () => {
    expect(treeJumpKeyLabel(10)).toBe('a');
  });

  it('returns "z" for position 35', () => {
    expect(treeJumpKeyLabel(35)).toBe('z');
  });

  it('returns "j" for position 19 (mid-range check)', () => {
    expect(treeJumpKeyLabel(19)).toBe('j');
  });

  it('returns null for position 36 (out of range)', () => {
    expect(treeJumpKeyLabel(36)).toBeNull();
  });

  it('returns null for negative positions', () => {
    expect(treeJumpKeyLabel(-1)).toBeNull();
  });
});

describe('treeJumpButtonToPosition', () => {
  it('maps Digit1..Digit9 to 0..8', () => {
    for (let i = 1; i <= 9; i++) {
      expect(treeJumpButtonToPosition(`Digit${i}`)).toBe(i - 1);
    }
  });

  it('maps Digit0 to 9', () => {
    expect(treeJumpButtonToPosition('Digit0')).toBe(9);
  });

  it('maps KeyA to 10', () => {
    expect(treeJumpButtonToPosition('KeyA')).toBe(10);
  });

  it('maps KeyZ to 35', () => {
    expect(treeJumpButtonToPosition('KeyZ')).toBe(35);
  });

  it('maps KeyJ to 19 (mid-range check)', () => {
    expect(treeJumpButtonToPosition('KeyJ')).toBe(19);
  });

  it('returns null for unknown buttons', () => {
    expect(treeJumpButtonToPosition('ShiftLeft')).toBeNull();
    expect(treeJumpButtonToPosition('Escape')).toBeNull();
    expect(treeJumpButtonToPosition('')).toBeNull();
  });
});
