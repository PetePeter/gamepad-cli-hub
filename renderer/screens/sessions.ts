/**
 * Sessions screen — vertical session list + quick spawn grid.
 *
 * Main orchestrator: state management, navigation handlers, public API.
 * Delegates rendering to sessions-render.ts and spawn logic to sessions-spawn.ts.
 */

import { state } from '../state.js';
import { sessionsState } from './sessions-state.js';
import { logEvent, getCliDisplayName, toDirection } from '../utils.js';
import type { Session } from '../state.js';
import { showCloseConfirm } from '../modals/close-confirm.js';
import { sortSessions, type SessionSortField, type SortDirection } from '../sort-logic.js';
import {
  groupSessionsByDirectory, buildFlatNavList,
  moveGroupUp, moveGroupDown, toggleCollapse,
  findNavIndexBySessionId,
} from '../session-groups.js';

// Sub-module imports — circular at module level, safe because all usages are in function bodies.
import {
  renderSessions, initSessionsSortControl, updateStatusCounts,
  startRename, showStateDropdown, commitRename, cancelRename,
  sessionsSortField, sessionsSortDirection,
} from './sessions-render.js';

import {
  doSpawn, showTerminalArea, hideTerminalArea,
  setDirPickerBridge, setTerminalManagerGetter, setPendingContextText,
  spawnNewSession, switchToSession,
  getSessionCwd, getTerminalManager,
  autoSelectFocusedSession, renderSpawnGrid,
  handleSessionsZone, handleSpawnZone, handleSpawnZoneButton,
  lastSwitchTime, clamp,
} from './sessions-spawn.js';

// Re-export public API from sub-modules so all consumers import from sessions.ts only.
export {
  doSpawn, showTerminalArea, hideTerminalArea,
  setDirPickerBridge, setTerminalManagerGetter, setPendingContextText,
  spawnNewSession, switchToSession,
  getSessionCwd, getTerminalManager,
} from './sessions-spawn.js';

// ============================================================================
// Session state maps
// ============================================================================

const sessionStates = new Map<string, string>();

/** Track session activity level (active/inactive/idle based on output timing) */
const sessionActivity = new Map<string, string>();

// Draft count cache — updated on session load and draft changes
const draftCounts = new Map<string, number>();

export function getDraftCountCache(sessionId: string): number {
  return draftCounts.get(sessionId) ?? 0;
}

export function setDraftCountCache(sessionId: string, count: number): void {
  draftCounts.set(sessionId, count);
}

const ACTIVITY_DEBOUNCE_MS = 300;

export function getSessionState(sessionId: string): string {
  return sessionStates.get(sessionId) || 'idle';
}

export function setSessionState(sessionId: string, newState: string): void {
  sessionStates.set(sessionId, newState);
  loadSessions();
}

export function removeSessionState(sessionId: string): void {
  sessionStates.delete(sessionId);
  sessionActivity.delete(sessionId);
}

/** Get session activity level */
export function getSessionActivity(sessionId: string): string {
  return sessionActivity.get(sessionId) ?? 'idle';
}

/** Set session activity level */
export function setSessionActivity(sessionId: string, level: string): void {
  // Ignore active events right after a session switch (likely focus-induced PTY noise)
  if (level === 'active' && Date.now() - lastSwitchTime < ACTIVITY_DEBOUNCE_MS) {
    return;
  }
  const previous = sessionActivity.get(sessionId) ?? 'idle';
  if (previous !== level) {
    sessionActivity.set(sessionId, level);
    loadSessions();
  }
}

export function doCloseSession(sessionId: string): void {
  const tm = getTerminalManager();
  if (tm) tm.destroyTerminal(sessionId);
  removeSessionState(sessionId);
  loadSessions();
}

// ============================================================================
// Group prefs
// ============================================================================

let groupPrefsLoaded = false;

async function initSessionGroupPrefs(): Promise<void> {
  if (groupPrefsLoaded) return;
  try {
    if (!window.gamepadCli) return;
    const prefs = await window.gamepadCli.configGetSessionGroupPrefs();
    if (prefs) {
      sessionsState.groupPrefs = prefs;
    }
  } catch (e) {
    console.error('[Sessions] Failed to load group prefs:', e);
  }
  groupPrefsLoaded = true;
}

/** Ensure order array contains all current dir paths (appends missing ones). */
function ensureCompleteOrder(order: string[], allDirPaths: string[]): string[] {
  const missing = allDirPaths.filter(d => !order.includes(d));
  return missing.length > 0 ? [...order, ...missing] : order;
}

async function saveGroupPrefs(): Promise<void> {
  try {
    if (!window.gamepadCli) return;
    await window.gamepadCli.configSetSessionGroupPrefs(sessionsState.groupPrefs);
  } catch (e) {
    console.error('[Sessions] Failed to save group prefs:', e);
  }
}

export async function toggleGroupCollapse(dirPath: string): Promise<void> {
  sessionsState.groupPrefs = {
    ...sessionsState.groupPrefs,
    collapsed: toggleCollapse(sessionsState.groupPrefs.collapsed, dirPath),
  };
  await saveGroupPrefs();
  await loadSessions();
}

export async function moveGroupUpAction(dirPath: string): Promise<void> {
  const allDirPaths = sessionsState.groups.map(g => g.dirPath);
  const fullOrder = ensureCompleteOrder(sessionsState.groupPrefs.order, allDirPaths);
  const newOrder = moveGroupUp(fullOrder, dirPath);
  sessionsState.groupPrefs = { ...sessionsState.groupPrefs, order: newOrder };
  await saveGroupPrefs();
  await loadSessions();
}

export async function moveGroupDownAction(dirPath: string): Promise<void> {
  const allDirPaths = sessionsState.groups.map(g => g.dirPath);
  const fullOrder = ensureCompleteOrder(sessionsState.groupPrefs.order, allDirPaths);
  const newOrder = moveGroupDown(fullOrder, dirPath);
  sessionsState.groupPrefs = { ...sessionsState.groupPrefs, order: newOrder };
  await saveGroupPrefs();
  await loadSessions();
}

/** Get the session at the current nav focus (only if it's a session-card). */
function getSessionAtFocus(): Session | undefined {
  const navItem = sessionsState.navList[sessionsState.sessionsFocusIndex];
  if (!navItem || navItem.type !== 'session-card') return undefined;
  return state.sessions.find(s => s.id === navItem.id);
}

function confirmCloseSession(): void {
  const session = getSessionAtFocus();
  if (!session) return;
  const displayName = session.name !== session.cliType
    ? session.name
    : getCliDisplayName(session.cliType);

  showCloseConfirm(session.id, displayName, doCloseSession, getDraftCountCache(session.id));
}

function startRenameForFocused(): void {
  const session = getSessionAtFocus();
  if (!session) return;
  startRename(session.id);
}

// ============================================================================
// Public API
// ============================================================================

export async function loadSessions(): Promise<void> {
  await initSessionGroupPrefs();
  await loadSessionsData();
  await initSessionsSortControl();
  renderSessions();
  renderSpawnGrid();
  updateStatusCounts();
}

export function handleSessionsScreenButton(button: string): boolean {
  // State dropdown intercepts all input when open
  const dropdown = document.querySelector('.session-state-dropdown');
  if (dropdown) {
    handleStateDropdownButton(button, dropdown as HTMLElement);
    return true; // consumed
  }

  // Rename mode intercepts all input
  if (sessionsState.editingSessionId) {
    const input = document.querySelector('.session-rename-input') as HTMLInputElement;
    if (button === 'A') {
      if (input) commitRename(sessionsState.editingSessionId, input.value);
      return true;
    }
    if (button === 'B') {
      cancelRename();
      return true;
    }
    if (input && (button === 'DPadLeft' || button === 'DPadRight')) {
      const pos = input.selectionStart ?? 0;
      const newPos = button === 'DPadLeft' ? Math.max(0, pos - 1) : Math.min(input.value.length, pos + 1);
      input.setSelectionRange(newPos, newPos);
      return true;
    }
    return true; // consume all other buttons
  }

  const dir = toDirection(button);

  if (dir) {
    // D-pad navigation — always consumed
    if (sessionsState.activeFocus === 'sessions') {
      handleSessionsZone(button, dir);
    } else {
      handleSpawnZone(button, dir);
    }
    return true;
  }

  // Non-directional buttons: check specific handlers
  if (sessionsState.activeFocus === 'sessions') {
    return handleSessionsZoneButton(button);
  } else {
    return handleSpawnZoneButton(button);
  }
}

export function updateSessionHighlight(): void {
  renderSessions();
  updateSessionsFocus();
}

/** Sync sidebar session highlight after a tab switch (e.g. Ctrl+Tab) */
export function syncSessionHighlight(sessionId: string): void {
  const idx = findNavIndexBySessionId(sessionsState.navList, sessionId);
  if (idx >= 0) {
    sessionsState.sessionsFocusIndex = idx;
    state.activeSessionId = sessionId;
    renderSessions();
    updateSessionsFocus();
  }
}

/**
 * Returns session IDs in visual display order for Ctrl+Tab cycling.
 * Uses navList (group-aware, sorted) as primary order, then appends any
 * terminal sessions hidden inside collapsed groups so they're still reachable.
 */
export function getTabCycleSessionIds(): string[] {
  const visibleIds = sessionsState.navList
    .filter(item => item.type === 'session-card')
    .map(item => item.id);

  const visibleSet = new Set(visibleIds);
  const allIds = state.sessions.map(s => s.id);
  const collapsedIds = allIds.filter(id => !visibleSet.has(id));

  return [...visibleIds, ...collapsedIds];
}

// ============================================================================
// Data loading
// ============================================================================

export async function loadSessionsData(): Promise<void> {
  if (!window.gamepadCli) return;

  // Only show embedded terminal sessions — no external window sessions
  state.sessions = [];
  const tm = getTerminalManager();
  if (tm) {
    for (const id of tm.getSessionIds()) {
      const session = tm.getSession(id);
      const cliType = session?.cliType || 'unknown';
      state.sessions.push({
        id,
        name: session?.name || cliType,
        cliType,
        processId: 0,
        workingDir: session?.cwd || '',
        title: session?.title,
      } as Session);
    }
  }

  // Sort sessions by user preference
  state.sessions = sortSessions(
    state.sessions,
    sessionsSortField,
    sessionsSortDirection,
    getSessionState,
    getSessionCwd,
    getSessionActivity,
  );

  // Build groups and flat navigation list
  sessionsState.groups = groupSessionsByDirectory(state.sessions, getSessionCwd, sessionsState.groupPrefs);
  sessionsState.navList = buildFlatNavList(sessionsState.groups);

  try {
    sessionsState.cliTypes = await window.gamepadCli.configGetCliTypes();
  } catch (e) { console.error('[Sessions] Failed to load CLI types:', e); }

  try {
    sessionsState.directories = (await window.gamepadCli.configGetWorkingDirs()) || [];
  } catch (e) { console.error('[Sessions] Failed to load directories:', e); }

  // Clamp focus indices after data reload
  const activeIdx = state.activeSessionId
    ? findNavIndexBySessionId(sessionsState.navList, state.activeSessionId)
    : -1;
  sessionsState.sessionsFocusIndex = activeIdx >= 0
    ? activeIdx
    : clamp(sessionsState.sessionsFocusIndex, 0, Math.max(0, sessionsState.navList.length - 1));
  sessionsState.spawnFocusIndex = clamp(
    sessionsState.spawnFocusIndex, 0, Math.max(0, sessionsState.cliTypes.length - 1),
  );
}

// ============================================================================
// State dropdown handlers
// ============================================================================

/** Open the state dropdown for the currently focused session card. */
function openStateDropdownForFocused(): void {
  const session = getSessionAtFocus();
  if (!session) return;
  const card = document.querySelector(`.session-card[data-session-id="${session.id}"]`);
  const stateBtn = card?.querySelector('.session-state-btn') as HTMLElement;
  if (!stateBtn) return;
  const currentState = getSessionState(session.id);
  showStateDropdown(stateBtn, session.id, currentState);
}

/** Handle gamepad buttons while the state dropdown is open. */
function handleStateDropdownButton(button: string, dropdown: HTMLElement): void {
  const options = dropdown.querySelectorAll('.session-state-option') as NodeListOf<HTMLElement>;
  if (options.length === 0) return;

  // Find currently focused option via .dropdown-focused class
  let focusIndex = Array.from(options).findIndex(o => o.classList.contains('dropdown-focused'));
  if (focusIndex < 0) focusIndex = Array.from(options).findIndex(o => o.classList.contains('active'));
  if (focusIndex < 0) focusIndex = 0;

  const dir = toDirection(button);

  if (dir === 'up') {
    focusIndex = Math.max(0, focusIndex - 1);
    setDropdownFocus(options, focusIndex);
    return;
  }
  if (dir === 'down') {
    focusIndex = Math.min(options.length - 1, focusIndex + 1);
    setDropdownFocus(options, focusIndex);
    return;
  }
  if (button === 'A') {
    options[focusIndex]?.click();
    return;
  }
  if (button === 'B') {
    const cleanupFn = (dropdown as any)._cleanup;
    if (cleanupFn) cleanupFn();
    else dropdown.remove();
    return;
  }
  // Other buttons: ignore while dropdown is open
}

function setDropdownFocus(options: NodeListOf<HTMLElement>, index: number): void {
  options.forEach(o => o.classList.remove('dropdown-focused'));
  if (options[index]) {
    options[index].classList.add('dropdown-focused');
    options[index].scrollIntoView({ block: 'nearest' });
  }
}

// ============================================================================
// Gamepad navigation — sessions zone button actions
// ============================================================================

function handleSessionsZoneButton(button: string): boolean {
  const navItem = sessionsState.navList[sessionsState.sessionsFocusIndex];
  if (!navItem) return false;

  if (button === 'A') {
    if (navItem.type === 'group-header') {
      if (sessionsState.cardColumn === 0) {
        toggleGroupCollapse(navItem.id);
        return true;
      }
      if (sessionsState.cardColumn === 1) {
        moveGroupUpAction(navItem.id);
        return true;
      }
      if (sessionsState.cardColumn === 2) {
        moveGroupDownAction(navItem.id);
        return true;
      }
      return true; // consumed
    }
    // session-card
    if (sessionsState.cardColumn === 1) {
      openStateDropdownForFocused();
      return true;
    }
    if (sessionsState.cardColumn === 2) {
      startRenameForFocused();
      return true;
    }
    if (sessionsState.cardColumn === 3) {
      confirmCloseSession();
      return true;
    }
    // col=0: fall through to config bindings
    return false;
  }
  if (button === 'B') {
    if (sessionsState.cardColumn > 0) {
      sessionsState.cardColumn = (sessionsState.cardColumn - 1) as 0 | 1 | 2 | 3;
      updateSessionsFocus();
      return true;
    }
    return false;
  }
  // X, Y, bumpers, triggers — fall through to config bindings
  return false;
}

// ============================================================================
// Focus update helpers
// ============================================================================

export function updateSessionsFocus(): void {
  const list = document.getElementById('sessionsList');
  if (!list) return;
  const children = Array.from(list.children) as HTMLElement[];
  children.forEach((el, i) => {
    const isFocused = i === sessionsState.sessionsFocusIndex && sessionsState.activeFocus === 'sessions';
    el.classList.toggle('focused', isFocused);

    if (el.classList.contains('session-card')) {
      const stateBtn = el.querySelector('.session-state-btn');
      const renameBtn = el.querySelector('.session-rename');
      const closeBtn = el.querySelector('.session-close');
      if (stateBtn) stateBtn.classList.toggle('card-col-focused', isFocused && sessionsState.cardColumn === 1);
      if (renameBtn) renameBtn.classList.toggle('card-col-focused', isFocused && sessionsState.cardColumn === 2);
      if (closeBtn) closeBtn.classList.toggle('card-col-focused', isFocused && sessionsState.cardColumn === 3);
    } else if (el.classList.contains('group-header')) {
      const moveUpBtn = el.querySelector('.group-move-up');
      const moveDownBtn = el.querySelector('.group-move-down');
      if (moveUpBtn) moveUpBtn.classList.toggle('card-col-focused', isFocused && sessionsState.cardColumn === 1);
      if (moveDownBtn) moveDownBtn.classList.toggle('card-col-focused', isFocused && sessionsState.cardColumn === 2);
    }
  });
  const focused = children[sessionsState.sessionsFocusIndex];
  focused?.scrollIntoView({ block: 'nearest' });
}

export function updateSpawnFocus(): void {
  const grid = document.getElementById('spawnGrid');
  if (!grid) return;
  grid.querySelectorAll('.spawn-btn').forEach((el, i) => {
    el.classList.toggle('focused', i === sessionsState.spawnFocusIndex && sessionsState.activeFocus === 'spawn');
  });
}

export function updateAllFocus(): void {
  updateSessionsFocus();
  updateSpawnFocus();
}

// ============================================================================
// Actions (dead code — kept for potential future use)
// ============================================================================

async function deleteSession(sessionId: string): Promise<void> {
  try {
    if (!window.gamepadCli) return;
    const result = await window.gamepadCli.sessionClose(sessionId);
    if (result.success) {
      logEvent(`Deleted: ${sessionId}`);
      state.sessions = await window.gamepadCli.sessionGetAll();
      sessionsState.sessionsFocusIndex = clamp(
        sessionsState.sessionsFocusIndex, 0, Math.max(0, state.sessions.length - 1),
      );
      renderSessions();
      updateStatusCounts();
      updateSessionsFocus();
    } else {
      logEvent(`Delete failed: ${result.error}`);
    }
  } catch (error) {
    console.error('[Sessions] Failed to delete session:', error);
  }
}

function refreshSessions(): void {
  loadSessions().catch(e => console.error('[Sessions] Refresh failed:', e));
  logEvent('Sessions refreshed');
}

// ============================================================================
// Keyboard fallback — arrow keys, Enter, Escape, Delete, F5
// ============================================================================

function onKeyDown(e: KeyboardEvent): void {
  if (state.currentScreen !== 'sessions') return;

  // Don't intercept keyboard when xterm.js or an editable element has DOM focus
  const active = document.activeElement;
  if (active && active.closest('.xterm')) return;
  const tag = active?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

  const keyMap: Record<string, string> = {
    ArrowUp: 'DPadUp', ArrowDown: 'DPadDown', ArrowLeft: 'DPadLeft', ArrowRight: 'DPadRight',
    Enter: 'A', Escape: 'B', Delete: 'X', F5: 'Y',
  };

  const mapped = keyMap[e.key];
  if (mapped) {
    e.preventDefault();
    e.stopPropagation();
    handleSessionsScreenButton(mapped);
  }
}

document.addEventListener('keydown', onKeyDown, true);
