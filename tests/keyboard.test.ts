/**
 * KeyboardSimulator — voice-only API tests.
 *
 * Tests the six public methods: keyTap, sendKeyCombo,
 * keyDown, keyUp, comboDown, comboUp, plus the singleton export.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@jitsi/robotjs', () => ({
  default: {
    keyTap: vi.fn(),
    keyToggle: vi.fn(),
  },
}));

import { KeyboardSimulator, keyboard } from '../src/output/keyboard.js';
import robot from '@jitsi/robotjs';

describe('KeyboardSimulator', () => {
  let kb: KeyboardSimulator;

  beforeEach(() => {
    kb = new KeyboardSimulator();
    vi.clearAllMocks();
  });

  // ── keyTap ────────────────────────────────────────────────

  describe('keyTap', () => {
    it('taps a regular key', () => {
      kb.keyTap('a');
      expect(robot.keyTap).toHaveBeenCalledWith('a');
    });

    it('normalizes ctrl → control', () => {
      kb.keyTap('ctrl');
      expect(robot.keyTap).toHaveBeenCalledWith('control');
    });

    it('normalizes esc → escape', () => {
      kb.keyTap('esc');
      expect(robot.keyTap).toHaveBeenCalledWith('escape');
    });

    it('normalizes return → enter', () => {
      kb.keyTap('return');
      expect(robot.keyTap).toHaveBeenCalledWith('enter');
    });

    it('normalizes cmd → command', () => {
      kb.keyTap('cmd');
      expect(robot.keyTap).toHaveBeenCalledWith('command');
    });

    it('normalizes case-insensitively', () => {
      kb.keyTap('CTRL');
      expect(robot.keyTap).toHaveBeenCalledWith('control');
    });

    it('passes unknown keys through lowercased', () => {
      kb.keyTap('F5');
      expect(robot.keyTap).toHaveBeenCalledWith('f5');
    });
  });

  // ── sendKeyCombo ──────────────────────────────────────────

  describe('sendKeyCombo', () => {
    it('sends modifiers + main key via robot.keyTap', () => {
      kb.sendKeyCombo(['ctrl', 'c']);
      expect(robot.keyTap).toHaveBeenCalledWith('c', ['control']);
    });

    it('supports three-key combos', () => {
      kb.sendKeyCombo(['ctrl', 'shift', 'esc']);
      expect(robot.keyTap).toHaveBeenCalledWith('escape', ['control', 'shift']);
    });

    it('delegates single key to keyTap', () => {
      kb.sendKeyCombo(['a']);
      expect(robot.keyTap).toHaveBeenCalledWith('a');
    });

    it('is a no-op for empty array', () => {
      kb.sendKeyCombo([]);
      expect(robot.keyTap).not.toHaveBeenCalled();
      expect(robot.keyToggle).not.toHaveBeenCalled();
    });

    it('normalizes all keys in the combo', () => {
      kb.sendKeyCombo(['cmd', 'return']);
      expect(robot.keyTap).toHaveBeenCalledWith('enter', ['command']);
    });
  });

  // ── keyDown ───────────────────────────────────────────────

  describe('keyDown', () => {
    it('calls robot.keyToggle with down', () => {
      kb.keyDown('shift');
      expect(robot.keyToggle).toHaveBeenCalledWith('shift', 'down');
    });

    it('normalizes the key name', () => {
      kb.keyDown('ctrl');
      expect(robot.keyToggle).toHaveBeenCalledWith('control', 'down');
    });
  });

  // ── keyUp ─────────────────────────────────────────────────

  describe('keyUp', () => {
    it('calls robot.keyToggle with up', () => {
      kb.keyUp('shift');
      expect(robot.keyToggle).toHaveBeenCalledWith('shift', 'up');
    });

    it('normalizes the key name', () => {
      kb.keyUp('esc');
      expect(robot.keyToggle).toHaveBeenCalledWith('escape', 'up');
    });
  });

  // ── comboDown ─────────────────────────────────────────────

  describe('comboDown', () => {
    it('presses each key down in order', () => {
      kb.comboDown(['ctrl', 'shift', 'a']);

      expect(robot.keyToggle).toHaveBeenCalledTimes(3);
      expect(robot.keyToggle).toHaveBeenNthCalledWith(1, 'control', 'down');
      expect(robot.keyToggle).toHaveBeenNthCalledWith(2, 'shift', 'down');
      expect(robot.keyToggle).toHaveBeenNthCalledWith(3, 'a', 'down');
    });

    it('is a no-op for empty array', () => {
      kb.comboDown([]);
      expect(robot.keyToggle).not.toHaveBeenCalled();
    });
  });

  // ── comboUp ───────────────────────────────────────────────

  describe('comboUp', () => {
    it('releases each key in reverse order', () => {
      kb.comboUp(['ctrl', 'shift', 'a']);

      expect(robot.keyToggle).toHaveBeenCalledTimes(3);
      expect(robot.keyToggle).toHaveBeenNthCalledWith(1, 'a', 'up');
      expect(robot.keyToggle).toHaveBeenNthCalledWith(2, 'shift', 'up');
      expect(robot.keyToggle).toHaveBeenNthCalledWith(3, 'control', 'up');
    });

    it('is a no-op for empty array', () => {
      kb.comboUp([]);
      expect(robot.keyToggle).not.toHaveBeenCalled();
    });
  });

  // ── singleton export ──────────────────────────────────────

  describe('singleton export', () => {
    it('keyboard is an instance of KeyboardSimulator', () => {
      expect(keyboard).toBeInstanceOf(KeyboardSimulator);
    });
  });
});
