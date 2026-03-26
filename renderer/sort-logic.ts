/**
 * Pure sort functions for sessions and bindings.
 * No side effects — easily testable.
 */

import type { Session } from './state.js';

// ============================================================================
// Types
// ============================================================================

export type SessionSortField = 'state' | 'cliType' | 'directory' | 'name';
export type BindingSortField = 'button' | 'action';
export type SortDirection = 'asc' | 'desc';

// ============================================================================
// Session sorting
// ============================================================================

const STATE_PRIORITY: Record<string, number> = {
  implementing: 0,
  waiting: 1,
  planning: 2,
  idle: 3,
};

/**
 * Sort sessions by a given field and direction.
 * Returns a new sorted array (does not mutate input).
 */
export function sortSessions(
  sessions: Session[],
  field: SessionSortField,
  direction: SortDirection,
  getSessionState: (id: string) => string,
  getSessionDirectory: (id: string) => string,
): Session[] {
  const sorted = [...sessions];
  const dir = direction === 'asc' ? 1 : -1;

  sorted.sort((a, b) => {
    let cmp = 0;
    switch (field) {
      case 'state': {
        const stateA = STATE_PRIORITY[getSessionState(a.id)] ?? 3;
        const stateB = STATE_PRIORITY[getSessionState(b.id)] ?? 3;
        cmp = stateA - stateB;
        break;
      }
      case 'cliType':
        cmp = (a.cliType || '').localeCompare(b.cliType || '');
        break;
      case 'directory':
        cmp = getSessionDirectory(a.id).localeCompare(getSessionDirectory(b.id));
        break;
      case 'name':
        cmp = (a.name || '').localeCompare(b.name || '');
        break;
    }
    return cmp * dir;
  });

  return sorted;
}

// ============================================================================
// Binding sorting
// ============================================================================

/**
 * Controller layout order — groups buttons by physical location.
 * Buttons not in this list sort after all listed buttons.
 */
const BUTTON_LAYOUT_ORDER: string[] = [
  // Face buttons
  'A', 'B', 'X', 'Y',
  // D-pad
  'DPadUp', 'DPadDown', 'DPadLeft', 'DPadRight',
  // Bumpers & triggers
  'LeftBumper', 'RightBumper', 'LeftTrigger', 'RightTrigger',
  // Center buttons
  'Back', 'Sandwich', 'Xbox',
  // Stick clicks
  'LeftStick', 'RightStick',
  // Left stick directions
  'LeftStickUp', 'LeftStickDown', 'LeftStickLeft', 'LeftStickRight',
  // Right stick directions
  'RightStickUp', 'RightStickDown', 'RightStickLeft', 'RightStickRight',
];

/**
 * Sort binding entries by a given field and direction.
 * Input: array of [button, binding] pairs from Object.entries(bindings).
 * Returns a new sorted array (does not mutate input).
 */
export function sortBindingEntries(
  entries: [string, any][],
  field: BindingSortField,
  direction: SortDirection,
): [string, any][] {
  const sorted = [...entries];
  const dir = direction === 'asc' ? 1 : -1;

  sorted.sort((a, b) => {
    let cmp = 0;
    switch (field) {
      case 'button': {
        const idxA = BUTTON_LAYOUT_ORDER.indexOf(a[0]);
        const idxB = BUTTON_LAYOUT_ORDER.indexOf(b[0]);
        const orderA = idxA >= 0 ? idxA : BUTTON_LAYOUT_ORDER.length;
        const orderB = idxB >= 0 ? idxB : BUTTON_LAYOUT_ORDER.length;
        cmp = orderA - orderB;
        if (cmp === 0) cmp = a[0].localeCompare(b[0]);
        break;
      }
      case 'action': {
        const actionA = a[1]?.action || '';
        const actionB = b[1]?.action || '';
        cmp = actionA.localeCompare(actionB);
        if (cmp === 0) cmp = a[0].localeCompare(b[0]);
        break;
      }
    }
    return cmp * dir;
  });

  return sorted;
}

// ============================================================================
// Display labels for sort fields
// ============================================================================

export const SESSION_SORT_LABELS: Record<SessionSortField, string> = {
  state: 'State',
  cliType: 'CLI Type',
  directory: 'Directory',
  name: 'Name',
};

export const BINDING_SORT_LABELS: Record<BindingSortField, string> = {
  button: 'Button',
  action: 'Action',
};
