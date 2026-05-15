import { describe, it, expect } from 'vitest';
import { CONTROLLER_BUTTONS } from '../renderer/controller-buttons.js';

describe('CONTROLLER_BUTTONS', () => {
  it('includes all four face buttons', () => {
    expect(CONTROLLER_BUTTONS).toContain('A');
    expect(CONTROLLER_BUTTONS).toContain('B');
    expect(CONTROLLER_BUTTONS).toContain('X');
    expect(CONTROLLER_BUTTONS).toContain('Y');
  });

  it('includes all four d-pad directions', () => {
    expect(CONTROLLER_BUTTONS).toContain('DPadUp');
    expect(CONTROLLER_BUTTONS).toContain('DPadDown');
    expect(CONTROLLER_BUTTONS).toContain('DPadLeft');
    expect(CONTROLLER_BUTTONS).toContain('DPadRight');
  });

  it('includes bumpers and triggers', () => {
    expect(CONTROLLER_BUTTONS).toContain('LeftBumper');
    expect(CONTROLLER_BUTTONS).toContain('RightBumper');
    expect(CONTROLLER_BUTTONS).toContain('LeftTrigger');
    expect(CONTROLLER_BUTTONS).toContain('RightTrigger');
  });

  it('includes stick clicks', () => {
    expect(CONTROLLER_BUTTONS).toContain('LeftStick');
    expect(CONTROLLER_BUTTONS).toContain('RightStick');
  });

  it('includes all 8 stick-direction virtual buttons', () => {
    const directions = [
      'LeftStickUp', 'LeftStickDown', 'LeftStickLeft', 'LeftStickRight',
      'RightStickUp', 'RightStickDown', 'RightStickLeft', 'RightStickRight',
    ];
    for (const btn of directions) {
      expect(CONTROLLER_BUTTONS).toContain(btn);
    }
  });

  it('has no duplicates', () => {
    expect(new Set(CONTROLLER_BUTTONS).size).toBe(CONTROLLER_BUTTONS.length);
  });

  it('is readonly — consumers cannot mutate it', () => {
    expect(Object.isFrozen(CONTROLLER_BUTTONS)).toBe(true);
  });
});
