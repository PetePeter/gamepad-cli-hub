/**
 * Sessions screen store — Pinia wrapper around the sessions navigation state.
 *
 * Legacy code imports `sessionsState` from `../screens/sessions-state.js`.
 * Vue components use `useSessionsScreenStore()` for the same data + helpers.
 */

import { defineStore } from 'pinia';
import { computed } from 'vue';
import { sessionsState } from '../screens/sessions-state.js';
import type { SessionsFocus } from '../screens/sessions-state.js';

export const useSessionsScreenStore = defineStore('sessionsScreen', () => {
  // ── Getters ──────────────────────────────────────────────────────────
  const isOverviewOpen = computed(() => sessionsState.overviewGroup !== null);

  const activeNavItem = computed(() =>
    sessionsState.navList[sessionsState.sessionsFocusIndex] ?? null,
  );

  const focusedGroup = computed(() => {
    const item = activeNavItem.value;
    if (!item) return null;
    return sessionsState.groups.find(
      g => g.dir === (item.type === 'group' ? item.dir : item.session?.workingDir),
    ) ?? null;
  });

  // ── Actions ──────────────────────────────────────────────────────────
  function setFocus(zone: SessionsFocus) {
    sessionsState.activeFocus = zone;
  }

  function openOverview(dirPath: string, isGlobal = false) {
    sessionsState.overviewGroup = dirPath;
    sessionsState.overviewIsGlobal = isGlobal;
    sessionsState.overviewFocusIndex = 0;
  }

  function closeOverview() {
    sessionsState.overviewGroup = null;
    sessionsState.overviewIsGlobal = false;
    sessionsState.overviewFocusIndex = 0;
  }

  function setEditingSession(id: string | null) {
    sessionsState.editingSessionId = id;
  }

  return {
    sessionsState,
    isOverviewOpen,
    activeNavItem,
    focusedGroup,
    setFocus,
    openOverview,
    closeOverview,
    setEditingSession,
  };
});
