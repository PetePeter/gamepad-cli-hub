/**
 * Sessions screen state — grouped session list + spawn grid navigation.
 */

import type { NavItem, SessionGroup, SessionGroupPrefs } from '../session-groups.js';

export type SessionsFocus = 'sessions' | 'spawn';

export interface SessionsScreenState {
  activeFocus: SessionsFocus;
  sessionsFocusIndex: number;
  spawnFocusIndex: number;
  cardColumn: 0 | 1 | 2 | 3;
  cliTypes: string[];
  directories: Array<{ name: string; path: string }>;
  editingSessionId: string | null;
  /** Flat navigation list (group headers + session cards). */
  navList: NavItem[];
  /** Grouped session data for rendering. */
  groups: SessionGroup[];
  /** Persisted group preferences (order + collapse). */
  groupPrefs: SessionGroupPrefs;
}

export const sessionsState: SessionsScreenState = {
  activeFocus: 'sessions',
  sessionsFocusIndex: 0,
  spawnFocusIndex: 0,
  cardColumn: 0,
  cliTypes: [],
  directories: [],
  editingSessionId: null,
  navList: [],
  groups: [],
  groupPrefs: { order: [], collapsed: [] },
};
