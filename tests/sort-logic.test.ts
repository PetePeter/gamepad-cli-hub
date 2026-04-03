import { describe, it, expect } from 'vitest';
import {
  sortSessions,
  sortBindingEntries,
  SESSION_SORT_LABELS,
  BINDING_SORT_LABELS,
} from '../renderer/sort-logic.js';
import type { Session } from '../renderer/state.js';
import type { SessionSortField, BindingSortField, SortDirection } from '../renderer/sort-logic.js';

// ============================================================================
// Helpers
// ============================================================================

function makeSession(overrides: Partial<Session> & { id: string }): Session {
  return { name: '', cliType: '', processId: 0, ...overrides };
}

const noopState = () => 'idle';
const noopDir = () => '';
const noopActivity = () => 'idle';

// ============================================================================
// sortSessions
// ============================================================================

describe('sortSessions', () => {
  it('returns a new array (does not mutate input)', () => {
    const sessions = [makeSession({ id: 'a' }), makeSession({ id: 'b' })];
    const result = sortSessions(sessions, 'name', 'asc', noopState, noopDir);
    expect(result).not.toBe(sessions);
    expect(sessions.map((s) => s.id)).toEqual(['a', 'b']);
  });

  describe('sort by state', () => {
    const sessions = [
      makeSession({ id: 'idle1' }),
      makeSession({ id: 'impl' }),
      makeSession({ id: 'wait' }),
      makeSession({ id: 'plan' }),
    ];
    const getState = (id: string): string => {
      const map: Record<string, string> = {
        idle1: 'idle',
        impl: 'implementing',
        wait: 'waiting',
        plan: 'planning',
      };
      return map[id] || 'idle';
    };

    it('ascending: implementing → waiting → planning → idle', () => {
      const result = sortSessions(sessions, 'state', 'asc', getState, noopDir);
      expect(result.map((s) => s.id)).toEqual(['impl', 'wait', 'plan', 'idle1']);
    });

    it('descending: idle → planning → waiting → implementing', () => {
      const result = sortSessions(sessions, 'state', 'desc', getState, noopDir);
      expect(result.map((s) => s.id)).toEqual(['idle1', 'plan', 'wait', 'impl']);
    });

    it('unknown states get same priority as idle', () => {
      const sessionsWithUnknown = [
        makeSession({ id: 'unknown' }),
        makeSession({ id: 'impl' }),
      ];
      const getStateWithUnknown = (id: string) =>
        id === 'impl' ? 'implementing' : 'some_random_state';
      const result = sortSessions(sessionsWithUnknown, 'state', 'asc', getStateWithUnknown, noopDir);
      expect(result.map((s) => s.id)).toEqual(['impl', 'unknown']);
    });
  });

  describe('sort by activity', () => {
    const sessions = [
      makeSession({ id: 'green' }),
      makeSession({ id: 'grey' }),
      makeSession({ id: 'blue' }),
    ];
    const getActivity = (id: string): string => {
      const map: Record<string, string> = {
        green: 'active',
        blue: 'inactive',
        grey: 'idle',
      };
      return map[id] || 'idle';
    };

    it('ascending: idle (grey) → inactive (blue) → active (green)', () => {
      const result = sortSessions(sessions, 'activity', 'asc', noopState, noopDir, getActivity);
      expect(result.map((s) => s.id)).toEqual(['grey', 'blue', 'green']);
    });

    it('descending: active (green) → inactive (blue) → idle (grey)', () => {
      const result = sortSessions(sessions, 'activity', 'desc', noopState, noopDir, getActivity);
      expect(result.map((s) => s.id)).toEqual(['green', 'blue', 'grey']);
    });

    it('unknown activity levels get same priority as idle', () => {
      const sessionsWithUnknown = [
        makeSession({ id: 'unknown' }),
        makeSession({ id: 'green' }),
      ];
      const getActivityWithUnknown = (id: string) =>
        id === 'green' ? 'active' : 'some_random_level';
      const result = sortSessions(sessionsWithUnknown, 'activity', 'asc', noopState, noopDir, getActivityWithUnknown);
      expect(result.map((s) => s.id)).toEqual(['unknown', 'green']);
    });

    it('falls back to idle when getSessionActivity is not provided', () => {
      const result = sortSessions(sessions, 'activity', 'asc', noopState, noopDir);
      // All treated as idle → stable order
      expect(result).toHaveLength(3);
    });
  });

  describe('sort by cliType', () => {
    const sessions = [
      makeSession({ id: 'c', cliType: 'zsh' }),
      makeSession({ id: 'a', cliType: 'bash' }),
      makeSession({ id: 'b', cliType: 'powershell' }),
    ];

    it('ascending: alphabetical', () => {
      const result = sortSessions(sessions, 'cliType', 'asc', noopState, noopDir);
      expect(result.map((s) => s.id)).toEqual(['a', 'b', 'c']);
    });

    it('descending: reverse alphabetical', () => {
      const result = sortSessions(sessions, 'cliType', 'desc', noopState, noopDir);
      expect(result.map((s) => s.id)).toEqual(['c', 'b', 'a']);
    });

    it('handles empty cliType', () => {
      const sessionsWithEmpty = [
        makeSession({ id: 'x', cliType: 'bash' }),
        makeSession({ id: 'y', cliType: '' }),
      ];
      const result = sortSessions(sessionsWithEmpty, 'cliType', 'asc', noopState, noopDir);
      expect(result.map((s) => s.id)).toEqual(['y', 'x']);
    });
  });

  describe('sort by directory', () => {
    const sessions = [
      makeSession({ id: 'c' }),
      makeSession({ id: 'a' }),
      makeSession({ id: 'b' }),
    ];
    const getDir = (id: string): string => {
      const map: Record<string, string> = { a: '/home/alpha', b: '/home/beta', c: '/home/gamma' };
      return map[id] || '';
    };

    it('ascending: alphabetical by directory', () => {
      const result = sortSessions(sessions, 'directory', 'asc', noopState, getDir);
      expect(result.map((s) => s.id)).toEqual(['a', 'b', 'c']);
    });

    it('descending: reverse alphabetical by directory', () => {
      const result = sortSessions(sessions, 'directory', 'desc', noopState, getDir);
      expect(result.map((s) => s.id)).toEqual(['c', 'b', 'a']);
    });
  });

  describe('sort by name', () => {
    const sessions = [
      makeSession({ id: '1', name: 'Zeta' }),
      makeSession({ id: '2', name: 'Alpha' }),
      makeSession({ id: '3', name: 'Mu' }),
    ];

    it('ascending: alphabetical by name', () => {
      const result = sortSessions(sessions, 'name', 'asc', noopState, noopDir);
      expect(result.map((s) => s.id)).toEqual(['2', '3', '1']);
    });

    it('descending: reverse alphabetical by name', () => {
      const result = sortSessions(sessions, 'name', 'desc', noopState, noopDir);
      expect(result.map((s) => s.id)).toEqual(['1', '3', '2']);
    });

    it('handles empty names', () => {
      const sessionsWithEmpty = [
        makeSession({ id: 'x', name: 'Beta' }),
        makeSession({ id: 'y', name: '' }),
      ];
      const result = sortSessions(sessionsWithEmpty, 'name', 'asc', noopState, noopDir);
      expect(result.map((s) => s.id)).toEqual(['y', 'x']);
    });
  });

  it('handles empty session array', () => {
    const result = sortSessions([], 'name', 'asc', noopState, noopDir);
    expect(result).toEqual([]);
  });

  it('handles single session', () => {
    const sessions = [makeSession({ id: 'only' })];
    const result = sortSessions(sessions, 'name', 'asc', noopState, noopDir);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('only');
  });
});

// ============================================================================
// sortBindingEntries
// ============================================================================

describe('sortBindingEntries', () => {
  it('returns a new array (does not mutate input)', () => {
    const entries: [string, any][] = [['B', { action: 'x' }], ['A', { action: 'y' }]];
    const result = sortBindingEntries(entries, 'button', 'asc');
    expect(result).not.toBe(entries);
    expect(entries[0][0]).toBe('B');
  });

  describe('sort by button', () => {
    it('ascending: follows controller layout order', () => {
      const entries: [string, any][] = [
        ['RightBumper', { action: 'rb' }],
        ['A', { action: 'a' }],
        ['DPadUp', { action: 'up' }],
        ['Y', { action: 'y' }],
      ];
      const result = sortBindingEntries(entries, 'button', 'asc');
      expect(result.map((e) => e[0])).toEqual(['A', 'Y', 'DPadUp', 'RightBumper']);
    });

    it('descending: reverse controller layout order', () => {
      const entries: [string, any][] = [
        ['A', { action: 'a' }],
        ['LeftStick', { action: 'ls' }],
        ['Back', { action: 'back' }],
      ];
      const result = sortBindingEntries(entries, 'button', 'desc');
      expect(result.map((e) => e[0])).toEqual(['LeftStick', 'Back', 'A']);
    });

    it('unknown buttons sort after all known buttons', () => {
      const entries: [string, any][] = [
        ['CustomButton', { action: 'custom' }],
        ['A', { action: 'a' }],
      ];
      const result = sortBindingEntries(entries, 'button', 'asc');
      expect(result.map((e) => e[0])).toEqual(['A', 'CustomButton']);
    });

    it('unknown buttons are alphabetical among themselves', () => {
      const entries: [string, any][] = [
        ['Zeta', { action: 'z' }],
        ['Alpha', { action: 'a' }],
      ];
      const result = sortBindingEntries(entries, 'button', 'asc');
      expect(result.map((e) => e[0])).toEqual(['Alpha', 'Zeta']);
    });
  });

  describe('sort by action', () => {
    it('ascending: alphabetical by action name', () => {
      const entries: [string, any][] = [
        ['B', { action: 'jump' }],
        ['A', { action: 'attack' }],
        ['X', { action: 'dash' }],
      ];
      const result = sortBindingEntries(entries, 'action', 'asc');
      expect(result.map((e) => e[0])).toEqual(['A', 'X', 'B']);
    });

    it('descending: reverse alphabetical by action name', () => {
      const entries: [string, any][] = [
        ['A', { action: 'attack' }],
        ['B', { action: 'jump' }],
      ];
      const result = sortBindingEntries(entries, 'action', 'desc');
      expect(result.map((e) => e[0])).toEqual(['B', 'A']);
    });

    it('ties in action break by button name', () => {
      const entries: [string, any][] = [
        ['Y', { action: 'same' }],
        ['A', { action: 'same' }],
      ];
      const result = sortBindingEntries(entries, 'action', 'asc');
      expect(result.map((e) => e[0])).toEqual(['A', 'Y']);
    });

    it('handles missing action gracefully', () => {
      const entries: [string, any][] = [
        ['A', { action: 'attack' }],
        ['B', null],
        ['X', {}],
      ];
      const result = sortBindingEntries(entries, 'action', 'asc');
      // null and {} both have empty action, sort before 'attack'
      expect(result.map((e) => e[0])).toEqual(['B', 'X', 'A']);
    });
  });

  it('handles empty entries', () => {
    const result = sortBindingEntries([], 'button', 'asc');
    expect(result).toEqual([]);
  });
});

// ============================================================================
// Label exports
// ============================================================================

describe('label exports', () => {
  it('SESSION_SORT_LABELS has all session sort fields', () => {
    expect(SESSION_SORT_LABELS).toEqual({
      state: 'State',
      activity: 'Activity',
      cliType: 'CLI Type',
      directory: 'Directory',
      name: 'Name',
    });
  });

  it('BINDING_SORT_LABELS has all binding sort fields', () => {
    expect(BINDING_SORT_LABELS).toEqual({
      button: 'Button',
      action: 'Action',
    });
  });
});
