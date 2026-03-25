/**
 * Keyboard simulator unit tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock robotjs before importing the module - match actual API only
vi.mock('@jitsi/robotjs', () => ({
  default: {
    keyTap: vi.fn(),
    keyToggle: vi.fn(),
    typeString: vi.fn(),
  },
}));

import { KeyboardSimulator } from '../src/output/keyboard.js';
import robot from '@jitsi/robotjs';

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
      keyboard.sendKey('enter');
      expect(robot.keyTap).toHaveBeenCalledWith('enter');

      keyboard.sendKey('ctrl');
      expect(robot.keyTap).toHaveBeenCalledWith('control');

      keyboard.sendKey('esc');
      expect(robot.keyTap).toHaveBeenCalledWith('escape');

      vi.clearAllMocks();
      keyboard.sendKey('return');
      expect(robot.keyTap).toHaveBeenCalledWith('enter');
    });
  });

  describe('sendKeys', () => {
    it('sends a sequence of keys', () => {
      keyboard.sendKeys(['h', 'e', 'l', 'l', 'o']);

      expect(robot.keyTap).toHaveBeenCalledTimes(5);
      expect(robot.keyTap).toHaveBeenNthCalledWith(1, 'h');
      expect(robot.keyTap).toHaveBeenNthCalledWith(2, 'e');
      expect(robot.keyTap).toHaveBeenNthCalledWith(3, 'l');
      expect(robot.keyTap).toHaveBeenNthCalledWith(4, 'l');
      expect(robot.keyTap).toHaveBeenNthCalledWith(5, 'o');
    });

    it('sends command sequences', () => {
      keyboard.sendKeys(['/', 'h', 'e', 'l', 'p', 'Enter']);

      expect(robot.keyTap).toHaveBeenCalledTimes(6);
    });

    it('handles mixed keys and aliases', () => {
      keyboard.sendKeys(['ctrl', 'c', 'enter']);
      expect(robot.keyTap).toHaveBeenCalledTimes(3);
    });
  });

  describe('sendKeyCombo', () => {
    it('sends a key combination with modifiers', () => {
      keyboard.sendKeyCombo(['ctrl', 'c']);

      expect(robot.keyTap).toHaveBeenCalledWith('c', ['control']);
    });

    it('sends a three-key combination', () => {
      keyboard.sendKeyCombo(['ctrl', 'shift', 'esc']);

      expect(robot.keyTap).toHaveBeenCalledWith('escape', ['control', 'shift']);
    });

    it('handles single key as combo', () => {
      keyboard.sendKeyCombo(['a']);

      expect(robot.keyTap).toHaveBeenCalledWith('a');
    });

    it('handles empty combo gracefully', () => {
      keyboard.sendKeyCombo([]);

      expect(robot.keyTap).not.toHaveBeenCalled();
    });

    it('normalizes key names in combinations', () => {
      keyboard.sendKeyCombo(['cmd', 'v']);
      expect(robot.keyTap).toHaveBeenCalledWith('v', ['command']);
    });
  });

  describe('typeString', () => {
    it('types a string of text', () => {
      keyboard.typeString('Hello World');

      expect(robot.typeString).toHaveBeenCalledWith('Hello World');
    });
  });

  describe('setKeyDelay and getKeyDelay', () => {
    it('sets and retrieves the key delay', () => {
      expect(keyboard.getKeyDelay()).toBe(10);

      keyboard.setKeyDelay(50);
      expect(keyboard.getKeyDelay()).toBe(50);
      // Note: @jitsi/robotjs doesn't support setKeyboardDelay, delay is internal only
    });
  });

  describe('constructor', () => {
    it('uses default delay when not specified', () => {
      const defaultKeyboard = new KeyboardSimulator();

      expect(defaultKeyboard.getKeyDelay()).toBe(10);
      // Note: @jitsi/robotjs doesn't support setKeyboardDelay, delay is internal only
    });

    it('uses custom delay when specified', () => {
      const customKeyboard = new KeyboardSimulator(100);

      expect(customKeyboard.getKeyDelay()).toBe(100);
    });
  });
});
