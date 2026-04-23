/**
 * Sessions screen state — grouped session list + spawn grid navigation.
 * Wrapped in Vue's reactive() so Vue components automatically track changes.
 */

import { reactive } from 'vue';
import type { NavItem, SessionGroup, SessionGroupPrefs } from '../session-groups.js';

export type SessionsFocus = 'sessions' | 'spawn' | 'plans';

export interface SessionsScreenState {
  activeFocus: SessionsFocus;
  sessionsFocusIndex: number;
  spawnFocusIndex: number;
  cardColumn: 0 | 1 | 2 | 3 | 4;
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
  /** True when the current overview shows visible sessions across all folders. */
  overviewIsGlobal: boolean;
  /** Focused card index within the overview grid. */
  overviewFocusIndex: number;
  /** Focused button index within the plans grid. */
  plansFocusIndex: number;
}

export const sessionsState: SessionsScreenState = reactive({
  activeFocus: 'sessions',
  sessionsFocusIndex: 0,
  spawnFocusIndex: 0,
  cardColumn: 0,
  cliTypes: [],
  directories: [],
  editingSessionId: null,
  navList: [],
  groups: [],
  groupPrefs: { order: [], collapsed: [], overviewHidden: [], bookmarked: [] },
  overviewGroup: null,
  overviewIsGlobal: false,
  overviewFocusIndex: 0,
  plansFocusIndex: 0,
});
