/**
 * Sessions screen helpers for sort controls, rename state, and the state dropdown.
 *
 * Vue owns the sidebar session-list rendering. This module only keeps the
 * non-visual sidebar helpers that still need imperative DOM access.
 */

import { state } from '../state.js';
import { sessionsState } from './sessions-state.js';
import { logEvent } from '../utils.js';
import { sortSessions, SESSION_SORT_LABELS, type SessionSortField, type SortDirection } from '../sort-logic.js';
import { createSortControl, type SortControlHandle } from '../components/sort-control.js';
import {
  groupSessionsByDirectory, buildFlatNavList,
} from '../session-groups.js';
import { refreshOverview, isOverviewVisible } from './group-overview.js';


// Circular import — safe: all usages are inside function bodies, not at module-evaluation time.
import {
  getSessionState, getSessionActivity,
  loadSessionsData, updateSessionsFocus,
  getSessionCwd, getTerminalManager,
} from './sessions.js';

// --- Constants ---

const STATE_LABELS: Record<string, string> = {
  implementing: '🔨 Implementing',
  waiting: '⏳ Waiting',
  planning: '🧠 Planning',
  completed: '🎉 Completed',
  idle: '💤 Idle',
};

const STATE_ORDER: Record<string, number> = {
  implementing: 0,
  waiting: 1,
  planning: 2,
  completed: 3,
  idle: 4,
};

export function getStateLabel(sessionState: string): string {
  return STATE_LABELS[sessionState] || '💤 Idle';
}

// --- Sort state ---
let sessionsSortControl: SortControlHandle | null = null;
export let sessionsSortField: SessionSortField = 'state';
export let sessionsSortDirection: SortDirection = 'asc';

// --- Sort control initialization ---
export async function initSessionsSortControl(): Promise<void> {
  const container = document.getElementById('sessionsSortBar');
  if (!container) return;

  // Recreate if the cached control was removed from the DOM (e.g., after a screen tear-down)
  if (sessionsSortControl && !container.contains(sessionsSortControl.element)) {
    sessionsSortControl.destroy();
    sessionsSortControl = null;
  }

  // Load saved prefs (only on first call or when no control exists)
  if (!sessionsSortControl) {
    try {
      const prefs = await window.gamepadCli.configGetSortPrefs('sessions');
      if (prefs) {
        sessionsSortField = (prefs.field as SessionSortField) || 'state';
        sessionsSortDirection = (prefs.direction as SortDirection) || 'asc';
        // Re-sort with loaded prefs
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
        // Rebuild groups and navList so the Vue sidebar reacts to the new order.
        sessionsState.groups = groupSessionsByDirectory(state.sessions, getSessionCwd, sessionsState.groupPrefs);
        sessionsState.navList = buildFlatNavList(sessionsState.groups);
        updateSessionsFocus();
        if (isOverviewVisible()) refreshOverview();
        try {
          await window.gamepadCli.configSetSortPrefs('sessions', { field, direction });
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

// --- Rename ---
/** Start editing a session name */
export function startRename(sessionId: string): void {
  sessionsState.editingSessionId = sessionId;
}

/** Cancel editing and restore display mode */
export function cancelRename(): void {
  sessionsState.editingSessionId = null;
}

/** Commit the rename and update the session */
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
    if (!window.gamepadCli) return;
    const result = await window.gamepadCli.sessionRename(sessionId, trimmed);
    if (result.success) {
      logEvent(`Renamed to: ${trimmed}`);
      sessionsState.editingSessionId = null;
      // Update the name in TerminalManager so it persists across reloads
      const tm = getTerminalManager();
      if (tm) tm.renameSession(sessionId, trimmed);
      // Reload sessions to get updated data
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

// --- Status counts ---

export function updateStatusCounts(): void {
  const totalEl = document.getElementById('statusTotalSessions');
  const activeEl = document.getElementById('statusActiveSessions');
  if (totalEl) totalEl.textContent = state.sessions.length.toString();
  if (activeEl) activeEl.textContent = state.sessions.some(s => s.id === state.activeSessionId) ? '1' : '0';
}
