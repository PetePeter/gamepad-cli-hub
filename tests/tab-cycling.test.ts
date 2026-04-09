// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import { resolveNextTerminalId } from '../renderer/tab-cycling.js';

describe('Tab cycling (Ctrl+Tab order)', () => {
  // Sessions sorted by display order: A, B, C
  // Terminals created in different order: C, A, B
  const sortedIds = ['A', 'B', 'C'];
  const terminalIds = ['C', 'A', 'B']; // insertion order

  describe('forward (Ctrl+Tab)', () => {
    it('cycles A → B following sorted display order', () => {
      expect(resolveNextTerminalId(sortedIds, terminalIds, 'A', 1)).toBe('B');
    });

    it('cycles B → C following sorted display order', () => {
      expect(resolveNextTerminalId(sortedIds, terminalIds, 'B', 1)).toBe('C');
    });

    it('wraps C → A at the end', () => {
      expect(resolveNextTerminalId(sortedIds, terminalIds, 'C', 1)).toBe('A');
    });
  });

  describe('backward (Ctrl+Shift+Tab)', () => {
    it('cycles C → B following sorted display order', () => {
      expect(resolveNextTerminalId(sortedIds, terminalIds, 'C', -1)).toBe('B');
    });

    it('cycles B → A following sorted display order', () => {
      expect(resolveNextTerminalId(sortedIds, terminalIds, 'B', -1)).toBe('A');
    });

    it('wraps A → C at the beginning', () => {
      expect(resolveNextTerminalId(sortedIds, terminalIds, 'A', -1)).toBe('C');
    });
  });

  describe('edge cases', () => {
    it('returns null when only one terminal exists', () => {
      expect(resolveNextTerminalId(['A'], ['A'], 'A', 1)).toBeNull();
    });

    it('returns null when no active terminal', () => {
      expect(resolveNextTerminalId(sortedIds, terminalIds, null, 1)).toBeNull();
    });

    it('returns null when active terminal is not in the list', () => {
      expect(resolveNextTerminalId(sortedIds, terminalIds, 'Z', 1)).toBeNull();
    });

    it('returns null when terminal list is empty', () => {
      expect(resolveNextTerminalId(sortedIds, [], 'A', 1)).toBeNull();
    });

    it('skips sessions without terminals', () => {
      // Display order: A, B, C, D — but only A and D have terminals
      const sorted = ['A', 'B', 'C', 'D'];
      const terminals = ['D', 'A']; // only these have PTYs
      expect(resolveNextTerminalId(sorted, terminals, 'A', 1)).toBe('D');
      expect(resolveNextTerminalId(sorted, terminals, 'D', 1)).toBe('A');
    });

    it('uses display order not insertion order', () => {
      // Created in order: Z, Y, X — but displayed as X, Y, Z
      const displayed = ['X', 'Y', 'Z'];
      const created = ['Z', 'Y', 'X'];
      expect(resolveNextTerminalId(displayed, created, 'X', 1)).toBe('Y');
      expect(resolveNextTerminalId(displayed, created, 'Y', 1)).toBe('Z');
    });
  });

  describe('navList-based ordering (group-aware)', () => {
    it('follows navList visual order across groups', () => {
      // Group 1: A, B (visible) | Group 2: C, D (visible)
      // navList order: A, B, C, D
      const navOrder = ['A', 'B', 'C', 'D'];
      const terminals = ['D', 'C', 'B', 'A'];
      expect(resolveNextTerminalId(navOrder, terminals, 'A', 1)).toBe('B');
      expect(resolveNextTerminalId(navOrder, terminals, 'B', 1)).toBe('C');
      expect(resolveNextTerminalId(navOrder, terminals, 'D', 1)).toBe('A');
    });

    it('reaches collapsed-group sessions appended after visible ones', () => {
      // Visible: A, B | Collapsed group has: C
      // Tab cycle order: A, B, C
      const tabCycleOrder = ['A', 'B', 'C'];
      const terminals = ['C', 'A', 'B'];
      expect(resolveNextTerminalId(tabCycleOrder, terminals, 'B', 1)).toBe('C');
      expect(resolveNextTerminalId(tabCycleOrder, terminals, 'C', 1)).toBe('A');
    });

    it('order is stable regardless of activity changes', () => {
      // Even if sessions change activity, navList order stays the same
      // because navList is rebuilt from group prefs + directory grouping
      const navOrder = ['X', 'Y', 'Z'];
      const terminals = ['Z', 'X', 'Y'];
      // Forward cycle is always X → Y → Z → X
      expect(resolveNextTerminalId(navOrder, terminals, 'X', 1)).toBe('Y');
      expect(resolveNextTerminalId(navOrder, terminals, 'Y', 1)).toBe('Z');
      expect(resolveNextTerminalId(navOrder, terminals, 'Z', 1)).toBe('X');
      // Backward is always Z → Y → X → Z
      expect(resolveNextTerminalId(navOrder, terminals, 'Z', -1)).toBe('Y');
      expect(resolveNextTerminalId(navOrder, terminals, 'Y', -1)).toBe('X');
      expect(resolveNextTerminalId(navOrder, terminals, 'X', -1)).toBe('Z');
    });
  });
});
