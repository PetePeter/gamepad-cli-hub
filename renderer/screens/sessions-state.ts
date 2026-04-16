/**
 * Sessions screen state — grouped session list + spawn grid navigation.
 */

import type { NavItem, SessionGroup, SessionGroupPrefs } from '../session-groups.js';

export type SessionsFocus = 'sessions' | 'spawn' | 'plans';

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
  /** Directory path of the group currently shown in overview (null = hidden). */
  overviewGroup: string | null;
  /** Focused card index within the overview grid. */
  overviewFocusIndex: number;
  /** Focused button index within the plans grid. */
  plansFocusIndex: number;
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
  overviewGroup: null,
  overviewFocusIndex: 0,
  plansFocusIndex: 0,
};
