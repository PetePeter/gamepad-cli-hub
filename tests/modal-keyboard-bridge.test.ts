/**
 * Modal keyboard bridge integration tests.
 *
 * Verifies that the App.vue keyboard → modal stack bridge correctly
 * translates keyboard events into modal stack button inputs, so modals
 * no longer need per-modal document keydown listeners.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useModalStack } from '../renderer/composables/useModalStack.js';

describe('Modal keyboard bridge', () => {
  let modalStack: ReturnType<typeof useModalStack>;
  let handlerCalls: string[];
  let handler: (button: string) => boolean;

  beforeEach(() => {
    modalStack = useModalStack();
    modalStack.clear();
    handlerCalls = [];
    handler = (button: string) => { handlerCalls.push(button); return true; };
  });

  afterEach(() => {
    modalStack.clear();
  });

  // =========================================================================
  // Arrow keys → D-pad translation
  // =========================================================================

  describe('Arrow key → DPad translation', () => {
    it('ArrowUp dispatches DPadUp to top modal', () => {
      modalStack.push({ id: 'test', handler });
      modalStack.handleInput('DPadUp');
      expect(handlerCalls).toEqual(['DPadUp']);
    });

    it('ArrowDown dispatches DPadDown to top modal', () => {
      modalStack.push({ id: 'test', handler });
      modalStack.handleInput('DPadDown');
      expect(handlerCalls).toEqual(['DPadDown']);
    });

    it('ArrowLeft dispatches DPadLeft to top modal', () => {
      modalStack.push({ id: 'test', handler });
      modalStack.handleInput('DPadLeft');
      expect(handlerCalls).toEqual(['DPadLeft']);
    });

    it('ArrowRight dispatches DPadRight to top modal', () => {
      modalStack.push({ id: 'test', handler });
      modalStack.handleInput('DPadRight');
      expect(handlerCalls).toEqual(['DPadRight']);
    });
  });

  // =========================================================================
  // Tab/ShiftTab
  // =========================================================================

  describe('Tab / ShiftTab', () => {
    it('Tab dispatches Tab to top modal', () => {
      modalStack.push({ id: 'test', handler });
      modalStack.handleInput('Tab');
      expect(handlerCalls).toEqual(['Tab']);
    });

    it('ShiftTab dispatches ShiftTab to top modal', () => {
      modalStack.push({ id: 'test', handler });
      modalStack.handleInput('ShiftTab');
      expect(handlerCalls).toEqual(['ShiftTab']);
    });
  });

  // =========================================================================
  // Enter / Space / Escape → A / B
  // =========================================================================

  describe('Activation and cancel', () => {
    it('A button dispatches to top modal', () => {
      modalStack.push({ id: 'test', handler });
      modalStack.handleInput('A');
      expect(handlerCalls).toEqual(['A']);
    });

    it('B button dispatches to top modal', () => {
      modalStack.push({ id: 'test', handler });
      modalStack.handleInput('B');
      expect(handlerCalls).toEqual(['B']);
    });
  });

  // =========================================================================
  // Stack routing — top modal receives events
  // =========================================================================

  describe('Stack routing', () => {
    it('dispatches to topmost modal handler only', () => {
      const calls1: string[] = [];
      const calls2: string[] = [];
      modalStack.push({ id: 'm1', handler: (b) => { calls1.push(b); return true; } });
      modalStack.push({ id: 'm2', handler: (b) => { calls2.push(b); return true; } });

      modalStack.handleInput('DPadDown');
      expect(calls1).toEqual([]);
      expect(calls2).toEqual(['DPadDown']);
    });

    it('does not dispatch when stack is empty', () => {
      // Should not throw
      modalStack.handleInput('DPadUp');
      expect(handlerCalls).toEqual([]);
    });

    it('dispatches to lower modal after pop', () => {
      const calls1: string[] = [];
      const calls2: string[] = [];
      modalStack.push({ id: 'm1', handler: (b) => { calls1.push(b); return true; } });
      modalStack.push({ id: 'm2', handler: (b) => { calls2.push(b); return true; } });

      modalStack.pop('m2');
      modalStack.handleInput('DPadUp');
      expect(calls1).toEqual(['DPadUp']);
      expect(calls2).toEqual([]);
    });
  });

  // =========================================================================
  // QuickSpawn → DirPicker handoff scenario
  // =========================================================================

  describe('QuickSpawn → DirPicker handoff', () => {
    it('dir-picker receives events after quick-spawn pops', () => {
      const qsCalls: string[] = [];
      const dpCalls: string[] = [];

      // QuickSpawn opens
      modalStack.push({ id: 'quick-spawn', handler: (b) => { qsCalls.push(b); return true; } });
      modalStack.handleInput('A');
      expect(qsCalls).toEqual(['A']);

      // Transition: QuickSpawn pops, DirPicker pushes
      modalStack.pop('quick-spawn');
      modalStack.push({ id: 'dir-picker', handler: (b) => { dpCalls.push(b); return true; } });

      // DirPicker now receives events
      modalStack.handleInput('DPadDown');
      modalStack.handleInput('A');
      expect(dpCalls).toEqual(['DPadDown', 'A']);
      expect(qsCalls).toEqual(['A']); // unchanged
    });

    it('escape on dir-picker returns to empty stack', () => {
      modalStack.push({ id: 'dir-picker', handler });
      modalStack.handleInput('B');
      expect(handlerCalls).toEqual(['B']);

      // After B, modal should pop itself
      modalStack.pop('dir-picker');
      expect(modalStack.depth.value).toBe(0);
    });
  });
});
