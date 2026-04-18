/**
 * App store — Pinia wrapper around the reactive AppState singleton.
 *
 * Legacy code imports `state` from `../state.js` (the reactive object).
 * Vue components use `useAppStore()` for the same data + computed getters.
 */

import { defineStore } from 'pinia';
import { computed } from 'vue';
import { state } from '../state.js';
import type { Session, AppState } from '../state.js';

export const useAppStore = defineStore('app', () => {
  // ── Getters ──────────────────────────────────────────────────────────
  const activeSession = computed<Session | undefined>(
    () => state.sessions.find(s => s.id === state.activeSessionId),
  );

  const sessionCount = computed(() => state.sessions.length);

  const hasActiveSession = computed(() => state.activeSessionId !== null);

  // ── Actions ──────────────────────────────────────────────────────────
  function setScreen(screen: string) {
    state.currentScreen = screen;
  }

  function setActiveSessionId(id: string | null) {
    state.activeSessionId = id;
  }

  function addSession(session: Session) {
    state.sessions.push(session);
  }

  function removeSession(id: string) {
    const idx = state.sessions.findIndex(s => s.id === id);
    if (idx !== -1) state.sessions.splice(idx, 1);
  }

  function updateSession(id: string, updates: Partial<Session>) {
    const session = state.sessions.find(s => s.id === id);
    if (session) Object.assign(session, updates);
  }

  function setGamepadCount(count: number) {
    state.gamepadCount = count;
  }

  function logEvent(event: { time: string; event: string }) {
    state.eventLog.push(event);
    if (state.eventLog.length > 100) state.eventLog.shift();
  }

  function setActiveProfile(profile: string) {
    state.activeProfile = profile;
  }

  // Re-export reactive state fields + getters + actions
  return {
    state,
    activeSession,
    sessionCount,
    hasActiveSession,
    setScreen,
    setActiveSessionId,
    addSession,
    removeSession,
    updateSession,
    setGamepadCount,
    logEvent,
    setActiveProfile,
  };
});
