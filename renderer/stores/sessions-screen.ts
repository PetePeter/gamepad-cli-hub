/**
 * Sessions screen store — single authoritative owner of sessions navigation state.
 *
 * The sessionsState reactive object is defined here and re-exported from
 * screens/sessions-state.ts for backward-compatible imports. Vue components
 * should use useSessionsScreenStore() for computed helpers and actions.
 */

import { defineStore } from 'pinia';
import { reactive, computed } from 'vue';
import type { NavItem, SessionGroup, SessionGroupPrefs } from '../session-groups.js';
import { isSessionHiddenFromOverview } from '../session-groups.js';
import { buildSessionShortcutMap } from '../utils/session-shortcut-map.js';
import type { ProjectDirectoryItem } from '../screens/planner-directories.js';

export type SessionsFocus = 'sessions' | 'spawn' | 'plans';

export interface SessionsScreenState {
  activeFocus: SessionsFocus;
  sessionsFocusIndex: number;
  spawnFocusIndex: number;
  cardColumn: 0 | 1 | 2 | 3 | 4;
  cliTypes: string[];
  directories: ProjectDirectoryItem[];
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

export const useSessionsScreenStore = defineStore('sessionsScreen', () => {
  const isOverviewOpen = computed(() => sessionsState.overviewGroup !== null);

  const activeNavItem = computed(() =>
    sessionsState.navList[sessionsState.sessionsFocusIndex] ?? null,
  );

  const focusedGroup = computed(() => {
    const item = activeNavItem.value;
    if (!item) return null;
    if (item.type === 'group-header') {
      return sessionsState.groups.find(g => g.dirPath === item.id) ?? null;
    }
    if (item.type === 'session-card') {
      return sessionsState.groups.find(g => g.sessions.some(s => s.id === item.id)) ?? null;
    }
    return null;
  });

  const hiddenSessionIds = computed<Set<string>>(() => {
    const hidden = new Set<string>();
    for (const group of sessionsState.groups) {
      for (const session of group.sessions) {
        if (isSessionHiddenFromOverview(session, sessionsState.groupPrefs)) {
          hidden.add(session.id);
        }
      }
    }
    return hidden;
  });

  const sessionShortcutMap = computed<Map<string, number>>(() =>
    buildSessionShortcutMap(sessionsState.navList, hiddenSessionIds.value),
  );

  function setFocus(zone: SessionsFocus): void {
    sessionsState.activeFocus = zone;
  }

  function openOverview(dirPath: string, isGlobal = false): void {
    sessionsState.overviewGroup = dirPath;
    sessionsState.overviewIsGlobal = isGlobal;
    sessionsState.overviewFocusIndex = 0;
  }

  function closeOverview(): void {
    sessionsState.overviewGroup = null;
    sessionsState.overviewIsGlobal = false;
    sessionsState.overviewFocusIndex = 0;
  }

  function setEditingSession(id: string | null): void {
    sessionsState.editingSessionId = id;
  }

  return {
    sessionsState,
    isOverviewOpen,
    activeNavItem,
    focusedGroup,
    hiddenSessionIds,
    sessionShortcutMap,
    setFocus,
    openOverview,
    closeOverview,
    setEditingSession,
  };
});
