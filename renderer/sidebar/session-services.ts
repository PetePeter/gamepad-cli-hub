/**
 * Sidebar session services: sort preferences, rename flow, and status counts.
 *
 * Vue owns rendering; these helpers keep non-visual sidebar behavior behind a
 * named service boundary for the session screen.
 */

import { state } from '../state.js';
import { sessionsState } from '../screens/sessions-state.js';
import { configClient, sessionsClient } from '../ipc/clients.js';
import { logEvent } from '../utils.js';
import { sortSessions, SESSION_SORT_LABELS, type SessionSortField, type SortDirection } from '../sort-logic.js';
import { createSortControl, type SortControlHandle } from '../components/sort-control.js';
import {
  groupSessionsByDirectory, buildFlatNavList,
} from '../session-groups.js';
import { refreshOverview, isOverviewVisible } from '../screens/group-overview.js';
import {
  getSessionState, getSessionActivity,
  loadSessionsData, updateSessionsFocus,
  getSessionCwd, getTerminalManager,
} from '../screens/sessions.js';
import { useNavigationStore } from '../stores/navigation.js';

let sessionsSortControl: SortControlHandle | null = null;
export let sessionsSortField: SessionSortField = 'state';
export let sessionsSortDirection: SortDirection = 'asc';

export async function initSessionsSortControl(): Promise<void> {
  const container = document.getElementById('sessionsSortBar');
  if (!container) return;

  if (sessionsSortControl && !container.contains(sessionsSortControl.element)) {
    sessionsSortControl.destroy();
    sessionsSortControl = null;
  }

  if (!sessionsSortControl) {
    try {
      const prefs = await configClient.configGetSortPrefs('sessions');
      if (prefs) {
        sessionsSortField = (prefs.field as SessionSortField) || 'state';
        sessionsSortDirection = (prefs.direction as SortDirection) || 'asc';
        state.sessions = sortSessions(
          state.sessions,
          sessionsSortField,
          sessionsSortDirection,
          getSessionState,
          getSessionCwd,
          getSessionActivity,
        );
      }
    } catch (e) {
      console.error('[Sessions] Failed to load sort prefs:', e);
    }

    const options = Object.entries(SESSION_SORT_LABELS).map(([value, label]) => ({ value, label }));

    sessionsSortControl = createSortControl({
      area: 'sessions',
      options,
      currentField: sessionsSortField,
      currentDirection: sessionsSortDirection,
      onChange: async (field, direction) => {
        sessionsSortField = field as SessionSortField;
        sessionsSortDirection = direction;
        state.sessions = sortSessions(
          state.sessions,
          sessionsSortField,
          sessionsSortDirection,
          getSessionState,
          getSessionCwd,
          getSessionActivity,
        );
        sessionsState.groups = groupSessionsByDirectory(state.sessions, getSessionCwd, sessionsState.groupPrefs);
        sessionsState.navList = buildFlatNavList(sessionsState.groups);
        useNavigationStore().onNavListRebuilt();
        updateSessionsFocus();
        if (isOverviewVisible()) refreshOverview();
        try {
          await configClient.configSetSortPrefs('sessions', { field, direction });
        } catch (e) {
          console.error('[Sessions] Failed to save sort prefs:', e);
        }
      },
    });

    container.innerHTML = '';
    container.appendChild(sessionsSortControl.element);
  } else {
    sessionsSortControl.update(sessionsSortField, sessionsSortDirection);
  }
}

export function startRename(sessionId: string): void {
  sessionsState.editingSessionId = sessionId;
}

export function cancelRename(): void {
  sessionsState.editingSessionId = null;
}

export async function commitRename(sessionId: string, newName: string): Promise<void> {
  const trimmed = newName.trim();
  if (!trimmed) {
    logEvent('Name cannot be empty');
    return;
  }
  if (trimmed.length > 50) {
    logEvent('Name too long (max 50 chars)');
    return;
  }

  try {
    const result = await sessionsClient.sessionRename(sessionId, trimmed);
    if (result.success) {
      logEvent(`Renamed to: ${trimmed}`);
      sessionsState.editingSessionId = null;
      const tm = getTerminalManager();
      if (tm) tm.renameSession(sessionId, trimmed);
      await loadSessionsData();
      refreshOverview();
    } else {
      logEvent(`Rename failed: ${result.error}`);
      sessionsState.editingSessionId = null;
    }
  } catch (error) {
    console.error('[Sessions] Rename failed:', error);
    logEvent('Rename failed');
    sessionsState.editingSessionId = null;
  }
}

export function updateStatusCounts(): void {
  const totalEl = document.getElementById('statusTotalSessions');
  const activeEl = document.getElementById('statusActiveSessions');
  if (totalEl) totalEl.textContent = state.sessions.length.toString();
  if (activeEl) activeEl.textContent = state.sessions.some(s => s.id === state.activeSessionId) ? '1' : '0';
}
