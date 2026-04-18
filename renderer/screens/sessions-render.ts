/**
 * Sessions screen — card rendering, state dropdown, and UI building.
 *
 * Extracted from sessions.ts. Imports state access from sessions.ts (which re-exports
 * spawn helpers) to avoid direct sub-module cross-dependencies.
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
  getSessionState, getSessionActivity, setSessionState,
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
        // Rebuild groups and navList so renderSessions() picks up the new order
        sessionsState.groups = groupSessionsByDirectory(state.sessions, getSessionCwd, sessionsState.groupPrefs);
        sessionsState.navList = buildFlatNavList(sessionsState.groups);
        renderSessions();
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
  renderSessions();
}

/** Cancel editing and restore display mode */
export function cancelRename(): void {
  sessionsState.editingSessionId = null;
  renderSessions();
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
      renderSessions();
      refreshOverview();
    } else {
      logEvent(`Rename failed: ${result.error}`);
      sessionsState.editingSessionId = null;
      renderSessions();
    }
  } catch (error) {
    console.error('[Sessions] Rename failed:', error);
    logEvent('Rename failed');
    sessionsState.editingSessionId = null;
    renderSessions();
  }
}

// --- Render — sessions list (grouped by directory) ---
export function renderSessions(): void {
  // Vue owns #sessionsList — DOM manipulation here would clobber the virtual DOM.
  // SessionCard.vue / SessionGroup.vue render reactively from sessionsState.groups.
}

// --- State dropdown ---
export function showStateDropdown(anchor: HTMLElement, sessionId: string, currentState: string): void {
  // Close any existing dropdown
  document.querySelectorAll('.session-state-dropdown').forEach(el => el.remove());

  const dropdown = document.createElement('div');
  dropdown.className = 'session-state-dropdown';

  const states = ['implementing', 'waiting', 'planning', 'completed', 'idle'];
  let focusIndex = states.indexOf(currentState);
  if (focusIndex < 0) focusIndex = 0;

  for (const s of states) {
    const option = document.createElement('button');
    option.className = 'session-state-option';
    if (s === currentState) option.classList.add('active');
    option.textContent = getStateLabel(s);
    option.addEventListener('click', (e) => {
      e.stopPropagation();
      cleanup();
      setSessionState(sessionId, s);
    });
    dropdown.appendChild(option);
  }

  // Append to sidebar (not session-info) so it's not clipped by overflow
  const sidebar = document.getElementById('sidePanel') || anchor.parentElement!;
  sidebar.appendChild(dropdown);

  // Position relative to anchor, flipping if it would go off-screen
  const anchorRect = anchor.getBoundingClientRect();
  const sidebarRect = sidebar.getBoundingClientRect();
  dropdown.style.position = 'fixed';
  dropdown.style.left = `${anchorRect.left}px`;

  // Try above first; if clipped, put below
  const dropdownHeight = dropdown.offsetHeight || 120;
  if (anchorRect.top - dropdownHeight < sidebarRect.top) {
    dropdown.style.top = `${anchorRect.bottom + 2}px`;
  } else {
    dropdown.style.top = `${anchorRect.top - dropdownHeight - 2}px`;
  }

  // Focus the current state option
  const options = dropdown.querySelectorAll('.session-state-option') as NodeListOf<HTMLButtonElement>;
  options[focusIndex]?.focus();
  options[focusIndex]?.classList.add('dropdown-focused');

  // Keyboard navigation: Up/Down arrows + Enter to select + ESC to close
  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusIndex = Math.min(states.length - 1, focusIndex + 1);
      options[focusIndex]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusIndex = Math.max(0, focusIndex - 1);
      options[focusIndex]?.focus();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      cleanup();
      setSessionState(sessionId, states[focusIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cleanup();
    }
  }

  function cleanup(): void {
    dropdown.remove();
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('click', closeHandler, true);
  }

  // Expose cleanup for gamepad B-button dismissal
  (dropdown as any)._cleanup = cleanup;

  // Close on outside click
  const closeHandler = (e: MouseEvent) => {
    if (!dropdown.contains(e.target as Node)) {
      cleanup();
    }
  };

  document.addEventListener('keydown', onKeyDown, true);
  // Defer to avoid the current click closing immediately
  setTimeout(() => document.addEventListener('click', closeHandler, true), 0);
}

// --- Status counts ---

export function updateStatusCounts(): void {
  const totalEl = document.getElementById('statusTotalSessions');
  const activeEl = document.getElementById('statusActiveSessions');
  if (totalEl) totalEl.textContent = state.sessions.length.toString();
  if (activeEl) activeEl.textContent = state.sessions.some(s => s.id === state.activeSessionId) ? '1' : '0';
}
