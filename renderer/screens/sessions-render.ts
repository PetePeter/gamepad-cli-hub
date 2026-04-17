/**
 * Sessions screen — card rendering, state dropdown, and UI building.
 *
 * Extracted from sessions.ts. Imports state access from sessions.ts (which re-exports
 * spawn helpers) to avoid direct sub-module cross-dependencies.
 */

import { state } from '../state.js';
import { sessionsState } from './sessions-state.js';
import { logEvent, getCliDisplayName } from '../utils.js';
import { showCloseConfirm } from '../modals/close-confirm.js';
import { sortSessions, SESSION_SORT_LABELS, type SessionSortField, type SortDirection } from '../sort-logic.js';
import { createSortControl, type SortControlHandle } from '../components/sort-control.js';
import {
  groupSessionsByDirectory, buildFlatNavList, findNavIndexBySessionId,
  getVisibleSessions, isSessionHiddenFromOverview, type SessionGroup,
} from '../session-groups.js';
import { showOverview, refreshOverview, isOverviewVisible } from './group-overview.js';
import { getActivityColor } from '../state-colors.js';
import { createDraftBadge } from '../drafts/draft-strip.js';

// Circular import — safe: all usages are inside function bodies, not at module-evaluation time.
import {
  getSessionState, getSessionActivity, setSessionState, doCloseSession,
  loadSessionsData, updateSessionsFocus,
  switchToSession, getSessionCwd, getTerminalManager,
  toggleGroupCollapse, moveGroupUpAction, moveGroupDownAction,
  getDraftCountCache, getLastOutputTime, formatElapsed,
  toggleSessionOverviewVisibility,
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
  const list = document.getElementById('sessionsList');
  const empty = document.getElementById('sessionsEmpty');
  if (!list) return;
  list.innerHTML = '';

  if (state.sessions.length === 0) {
    list.style.display = 'none';
    if (empty) empty.style.display = '';
    return;
  }

  list.style.display = '';
  if (empty) empty.style.display = 'none';

  // Walk navList so DOM order matches focus indexing. Empty groups are
  // already excluded from navList (buildFlatNavList skips them), so no
  // sticky bookmark rows appear. Headers and cards both carry their nav
  // index — updateSessionsFocus applies focus styling to .focusable elements.
  for (let i = 0; i < sessionsState.navList.length; i++) {
    const item = sessionsState.navList[i];
    if (item.type === 'overview-button') {
      list.appendChild(createOverviewButton(i));
    } else if (item.type === 'group-header') {
      const group = sessionsState.groups[item.groupIndex];
      if (group) list.appendChild(createGroupHeader(group, i));
    } else {
      const session = state.sessions.find(s => s.id === item.id);
      if (session) list.appendChild(createSessionCard(session, i));
    }
  }
}

function createOverviewButton(index: number): HTMLElement {
  const button = document.createElement('div');
  button.className = 'group-header overview-nav-button';
  button.dataset.navIndex = String(index);
  if (index === sessionsState.sessionsFocusIndex && sessionsState.activeFocus === 'sessions') {
    button.classList.add('focused');
  }

  const label = document.createElement('span');
  label.className = 'group-name';
  label.textContent = 'Overview';

  const count = document.createElement('span');
  count.className = 'overview-visible-count';
  const visibleCount = getVisibleSessions(sessionsState.groups, sessionsState.groupPrefs).length;
  count.textContent = `${visibleCount} session${visibleCount === 1 ? '' : 's'}`;

  button.appendChild(label);
  button.appendChild(count);
  button.addEventListener('click', () => showOverview(null, state.activeSessionId ?? undefined));
  return button;
}

function createGroupHeader(group: SessionGroup, index: number): HTMLElement {
  const header = document.createElement('div');
  header.className = 'group-header';
  header.dataset.dirPath = group.dirPath;
  header.dataset.navIndex = String(index);
  if (index === sessionsState.sessionsFocusIndex && sessionsState.activeFocus === 'sessions') {
    header.classList.add('focused');
  }

  const chevron = document.createElement('span');
  chevron.className = 'group-chevron';
  chevron.textContent = group.collapsed ? '\u25B8' : '\u25BE';

  const nameSpan = document.createElement('span');
  nameSpan.className = 'group-name';
  nameSpan.textContent = `${group.dirName} (${group.sessions.length})`;
  nameSpan.style.cursor = 'pointer';
  nameSpan.title = 'Open group overview';
  nameSpan.addEventListener('click', (e) => {
    e.stopPropagation();
    showOverview(group.dirPath);
  });

  const moveUp = document.createElement('button');
  moveUp.className = 'group-move-up';
  moveUp.textContent = '\u25B2';
  moveUp.title = 'Move group up';
  moveUp.addEventListener('click', (e) => {
    e.stopPropagation();
    moveGroupUpAction(group.dirPath);
  });

  const moveDown = document.createElement('button');
  moveDown.className = 'group-move-down';
  moveDown.textContent = '\u25BC';
  moveDown.title = 'Move group down';
  moveDown.addEventListener('click', (e) => {
    e.stopPropagation();
    moveGroupDownAction(group.dirPath);
  });

  const plansBtn = document.createElement('button');
  plansBtn.className = 'group-plans-btn';
  plansBtn.textContent = '\uD83D\uDDFA\uFE0F';
  plansBtn.title = 'Open plans for this directory';

  // Startable-count badge (async — updates after render)
  if (window.gamepadCli?.planStartableForDir) {
    window.gamepadCli.planStartableForDir(group.dirPath).then((items: any[]) => {
      if (items && items.length > 0) {
        const badge = document.createElement('span');
        badge.className = 'plans-btn-badge';
        badge.textContent = String(items.length);
        plansBtn.appendChild(badge);
      }
    }).catch(() => {});
  }

  plansBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    import('../plans/plan-screen.js').then(({ showPlanScreen }) => {
      showPlanScreen(group.dirPath);
    });
  });

  header.appendChild(chevron);
  header.appendChild(nameSpan);
  header.appendChild(moveUp);
  header.appendChild(moveDown);
  header.appendChild(plansBtn);

  const isFocused = index === sessionsState.sessionsFocusIndex && sessionsState.activeFocus === 'sessions';
  if (isFocused && sessionsState.cardColumn === 1) moveUp.classList.add('card-col-focused');
  if (isFocused && sessionsState.cardColumn === 2) moveDown.classList.add('card-col-focused');
  if (isFocused && sessionsState.cardColumn === 3) plansBtn.classList.add('card-col-focused');

  header.addEventListener('click', () => toggleGroupCollapse(group.dirPath));

  return header;
}

function createSessionCard(session: typeof state.sessions[0], index: number): HTMLElement {
  const card = document.createElement('div');
  card.className = 'session-card';
  if (session.id === state.activeSessionId) card.classList.add('active');
  if (index === sessionsState.sessionsFocusIndex && sessionsState.activeFocus === 'sessions') {
    card.classList.add('focused');
  }
  card.dataset.sessionId = session.id;
  card.dataset.navIndex = String(index);

  const sessionState = getSessionState(session.id);
  const activityLevel = getSessionActivity(session.id);
  const displayName = session.name !== session.cliType ? session.name : getCliDisplayName(session.cliType);

  const isEditing = sessionsState.editingSessionId === session.id;
  const isFocusedCard = index === sessionsState.sessionsFocusIndex && sessionsState.activeFocus === 'sessions';

  // --- Line 1: top row — dot, state, badges, spacer, timer, rename, close ---

  const topRow = document.createElement('div');
  topRow.className = 'session-top-row';

  const activityDot = document.createElement('span');
  activityDot.className = 'session-activity-dot';
  activityDot.style.background = getActivityColor(activityLevel);

  const stateBtn = document.createElement('button');
  stateBtn.className = 'session-state-btn';
  if (isFocusedCard && sessionsState.cardColumn === 1) stateBtn.classList.add('card-col-focused');
  stateBtn.textContent = getStateLabel(sessionState);
  stateBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showStateDropdown(stateBtn, session.id, sessionState);
  });

  topRow.appendChild(activityDot);
  topRow.appendChild(stateBtn);

  const badge = createDraftBadge(getDraftCountCache(session.id));
  if (badge) topRow.appendChild(badge);

  const spacer = document.createElement('span');
  spacer.style.flex = '1';
  topRow.appendChild(spacer);

  const timer = document.createElement('span');
  timer.className = 'session-timer';
  const lastOutput = getLastOutputTime(session.id);
  timer.textContent = lastOutput ? formatElapsed(Date.now() - lastOutput) : '';
  topRow.appendChild(timer);

  let renameBtn: HTMLButtonElement | null = null;
  if (!isEditing) {
    renameBtn = document.createElement('button');
    renameBtn.className = 'session-rename';
    if (isFocusedCard && sessionsState.cardColumn === 2) renameBtn.classList.add('card-col-focused');
    renameBtn.textContent = '✎';
    renameBtn.title = 'Rename session';
    renameBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      startRename(session.id);
    });
    topRow.appendChild(renameBtn);
  }

  const eyeBtn = document.createElement('button');
  eyeBtn.className = 'session-overview-toggle';
  if (isFocusedCard && sessionsState.cardColumn === 3) eyeBtn.classList.add('card-col-focused');
  const hiddenFromOverview = isSessionHiddenFromOverview(session, sessionsState.groupPrefs);
  eyeBtn.textContent = hiddenFromOverview ? '👁‍🗨' : '👁';
  eyeBtn.title = hiddenFromOverview ? 'Show in overview' : 'Hide from overview';
  eyeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSessionOverviewVisibility(session.id);
  });
  topRow.appendChild(eyeBtn);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'session-close';
  if (isFocusedCard && sessionsState.cardColumn === 4) closeBtn.classList.add('card-col-focused');
  closeBtn.textContent = '✕';
  closeBtn.title = `Close ${displayName}`;
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showCloseConfirm(session.id, displayName, doCloseSession, getDraftCountCache(session.id));
  });
  topRow.appendChild(closeBtn);

  // --- Line 2: session name (editable) ---

  const nameLine = document.createElement('div');
  nameLine.className = 'session-name-line';

  if (isEditing) {
    const input = document.createElement('input');
    input.className = 'session-rename-input';
    input.type = 'text';
    input.maxLength = 50;
    input.value = session.name;
    input.placeholder = 'Enter name...';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'session-rename-save';
    saveBtn.textContent = '✓';
    saveBtn.title = 'Save (Enter)';
    saveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      commitRename(session.id, input.value);
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'session-rename-cancel';
    cancelBtn.textContent = '×';
    cancelBtn.title = 'Cancel (Escape)';
    cancelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      cancelRename();
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        commitRename(session.id, input.value);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        cancelRename();
      }
    });

    setTimeout(() => { input.focus(); input.select(); }, 0);

    nameLine.appendChild(input);
    nameLine.appendChild(saveBtn);
    nameLine.appendChild(cancelBtn);
  } else {
    const name = document.createElement('span');
    name.className = 'session-name';
    name.textContent = displayName;
    name.addEventListener('click', (e) => {
      e.stopPropagation();
      startRename(session.id);
    });
    nameLine.appendChild(name);

    const workingPlan = document.createElement('span');
    workingPlan.className = 'session-working-plan';
    nameLine.appendChild(workingPlan);
    void renderWorkingPlan(session.id, workingPlan);
  }

  // --- Line 3: terminal title (meta) ---

  // Assemble card: topRow → nameLine → metaLine
  card.appendChild(topRow);
  card.appendChild(nameLine);

  if (session.title && session.title !== displayName) {
    const meta = document.createElement('span');
    meta.className = 'session-meta';
    meta.textContent = session.title;
    meta.title = session.title;
    card.appendChild(meta);
  }

  card.addEventListener('click', () => switchToSession(session.id));
  return card;
}

async function renderWorkingPlan(sessionId: string, target: HTMLElement): Promise<void> {
  try {
    const plans = await window.gamepadCli?.planDoingForSession?.(sessionId);
    if (!target.isConnected) return;
    const plan = (plans ?? [])[0];
    if (!plan) {
      target.textContent = '';
      target.title = '';
      return;
    }

    const prefix = plan.status === 'blocked' ? '⛔' : plan.status === 'question' ? '❓' : '🗺️';
    const label = `${prefix} ${plan.title}`;
    target.textContent = label;
    target.title = plan.stateInfo ? `${plan.title}\n${plan.stateInfo}` : plan.title;
  } catch {
    if (target.isConnected) {
      target.textContent = '';
      target.title = '';
    }
  }
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
