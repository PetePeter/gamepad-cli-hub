/**
 * Keyboard Simulator happy path tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock robotjs before importing the module
vi.mock('@jitsi/robotjs', () => ({
  keyTap: vi.fn(),
  keyToggle: vi.fn(),
  typeString: vi.fn(),
  setKeyboardDelay: vi.fn(),
  default: {
    keyTap: vi.fn(),
    keyToggle: vi.fn(),
    typeString: vi.fn(),
    setKeyboardDelay: vi.fn(),
  },
}));

import { KeyboardSimulator } from '../src/output/keyboard.js';
import * as robot from '@jitsi/robotjs';

describe('KeyboardSimulator - Happy Path', () => {
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
  });

  describe('longPress', () => {
    it('holds a key for the specified duration', () => {
      const shortDuration = 50;

      keyboard.longPress('space', shortDuration);

      expect(robot.keyToggle).toHaveBeenNthCalledWith(1, 'space', 'down');
      expect(robot.keyToggle).toHaveBeenNthCalledWith(2, 'space', 'up');
      expect(robot.keyToggle).toHaveBeenCalledTimes(2);
    });

    it('normalizes key names in long press', () => {
      keyboard.longPress('enter', 20);

      expect(robot.keyToggle).toHaveBeenNthCalledWith(1, 'enter', 'down');
      expect(robot.keyToggle).toHaveBeenNthCalledWith(2, 'enter', 'up');
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

      expect(robot.setKeyboardDelay).toHaveBeenLastCalledWith(50);
    });
  });

  describe('constructor', () => {
    it('uses default delay when not specified', () => {
      const defaultKeyboard = new KeyboardSimulator();

      expect(defaultKeyboard.getKeyDelay()).toBe(10);
      expect(robot.setKeyboardDelay).toHaveBeenCalledWith(10);
    });

    it('uses custom delay when specified', () => {
      const customKeyboard = new KeyboardSimulator(100);

      expect(customKeyboard.getKeyDelay()).toBe(100);
      expect(robot.setKeyboardDelay).toHaveBeenCalledWith(100);
    });
  });
});
