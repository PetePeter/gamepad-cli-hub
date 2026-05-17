/**
 * App store — Pinia owner for renderer application state.
 */

import { defineStore } from 'pinia';
import { computed, reactive } from 'vue';
import type { Session, AppState } from '../state.js';

export const appState: AppState = reactive({
  currentScreen: 'sessions',
  sessions: [],
  activeSessionId: null,
  recentSessionId: null,
  lastSelectedSessionId: null,
  gamepadCount: 0,
  eventLog: [],
  cliTypes: [],
  availableSpawnTypes: [],
  cliBindingsCache: {},
  cliSequencesCache: {},
  cliToolsCache: {},
  projects: [],
  settingsTab: 'tools',
  sessionStates: new Map(),
  sessionActivityLevels: new Map(),
  lastOutputTimes: new Map(),
  draftCounts: new Map(),
  planCodingCounts: new Map(),
  planStartableCounts: new Map(),
  planDirStartableCounts: new Map(),
  planDirCodingCounts: new Map(),
  planDirBlockedCounts: new Map(),
  planDirReviewCounts: new Map(),
  planDirPlanningCounts: new Map(),
  workingPlanLabels: new Map(),
  workingPlanTooltips: new Map(),
  pendingSchedules: new Map(),
  snappedOutSessions: new Set(),
});

export const useAppStore = defineStore('app', () => {
  const state = appState;

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

  function setSessions(sessions: Session[]) {
    state.sessions = sessions;
  }

  function upsertSession(session: Session) {
    const idx = state.sessions.findIndex(s => s.id === session.id);
    if (idx !== -1) state.sessions[idx] = session;
    else state.sessions.push(session);
  }

  function setProjects(projects: AppState['projects']) {
    state.projects = projects;
  }

  function setGamepadCount(count: number) {
    state.gamepadCount = count;
  }

  function logEvent(event: { time: string; event: string }) {
    state.eventLog.push(event);
    if (state.eventLog.length > 100) state.eventLog.shift();
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
    setSessions,
    upsertSession,
    setProjects,
    setGamepadCount,
    logEvent,
  };
});
