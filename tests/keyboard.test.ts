/**
 * Keyboard simulator unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KeyboardSimulator } from '../src/output/keyboard.js';

// Mock robotjs - match actual API only, no fake methods
vi.mock('@jitsi/robotjs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@jitsi/robotjs')>();
  return {
    ...actual,
    keyTap: vi.fn(() => true),
    keyToggle: vi.fn(() => ({})),
    typeString: vi.fn(),
  };
});

import * as robot from '@jitsi/robotjs';

describe('KeyboardSimulator', () => {
  let keyboard: KeyboardSimulator;

  beforeEach(() => {
    keyboard = new KeyboardSimulator(10);
    vi.clearAllMocks();
  });

  describe('sendKey', () => {
    it('sends a single key tap', () => {
      keyboard.sendKey('a');
      expect(robot.keyTap).toHaveBeenCalledWith('a');
    });

    it('normalizes common key aliases', () => {
      keyboard.sendKey('ctrl');
      expect(robot.keyTap).toHaveBeenCalledWith('control');

      keyboard.sendKey('esc');
      expect(robot.keyTap).toHaveBeenCalledWith('escape');

      keyboard.sendKey('return');
      expect(robot.keyTap).toHaveBeenCalledWith('enter');
    });
  });

  describe('sendKeys', () => {
    it('sends multiple keys in sequence', () => {
      keyboard.sendKeys(['h', 'e', 'l', 'l', 'o']);
      expect(robot.keyTap).toHaveBeenCalledTimes(5);
    });

    it('handles mixed keys and aliases', () => {
      keyboard.sendKeys(['ctrl', 'c', 'enter']);
      expect(robot.keyTap).toHaveBeenCalledTimes(3);
    });
  });

  describe('sendKeyCombo', () => {
    it('sends a single key when only one key provided', () => {
      keyboard.sendKeyCombo(['a']);
      expect(robot.keyTap).toHaveBeenCalledWith('a');
    });

    it('sends key combination with modifiers', () => {
      keyboard.sendKeyCombo(['ctrl', 'c']);
      expect(robot.keyTap).toHaveBeenCalledWith('c', ['control']);
    });

    it('handles multiple modifiers', () => {
      keyboard.sendKeyCombo(['ctrl', 'shift', 'esc']);
      expect(robot.keyTap).toHaveBeenCalledWith('escape', ['control', 'shift']);
    });

    it('normalizes key names in combinations', () => {
      keyboard.sendKeyCombo(['cmd', 'v']);
      expect(robot.keyTap).toHaveBeenCalledWith('v', ['command']);
    });

    it('does nothing for empty array', () => {
      keyboard.sendKeyCombo([]);
      expect(robot.keyTap).not.toHaveBeenCalled();
    });
  });

  describe('typeString', () => {
    it('types a string of text', () => {
      keyboard.typeString('Hello World');
      expect(robot.typeString).toHaveBeenCalledWith('Hello World');
    });
  });

  describe('setKeyDelay', () => {
    it('updates the key delay', () => {
      keyboard.setKeyDelay(50);
      expect(keyboard.getKeyDelay()).toBe(50);
    });
  });

  describe('getKeyDelay', () => {
    it('returns the default delay', () => {
      expect(keyboard.getKeyDelay()).toBe(10);
    });

    it('returns updated delay after setKeyDelay', () => {
      keyboard.setKeyDelay(100);
      expect(keyboard.getKeyDelay()).toBe(100);
    });
  });
});
