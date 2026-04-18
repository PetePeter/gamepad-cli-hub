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
  toggleCollapse,
  findNavIndexBySessionId, getSessionOverviewAliases, getSessionOverviewKey,
} from '../session-groups.js';
import { getActivityColor } from '../state-colors.js';
import {
  getOverviewSessions, handleOverviewInput, hideOverview, isOverviewVisible, refreshOverview, showOverview,
} from './group-overview.js';
import { isPlanScreenVisible, handlePlanScreenDpad, handlePlanScreenAction, hidePlanScreen, getCurrentPlanDirPath } from '../plans/plan-screen.js';
import { currentView } from '../main-view/main-view-manager.js';

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

import {
  handlePlansZone, handlePlansZoneButton, renderPlansGrid, updatePlansFocus, refreshPlanBadges,
} from './sessions-plans.js';

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

/** Track last output timestamp per session (for timer display) */
const lastOutputTimes = new Map<string, number>();

// Draft count cache — updated on session load and draft changes
const draftCounts = new Map<string, number>();

export function getDraftCountCache(sessionId: string): number {
  return draftCounts.get(sessionId) ?? 0;
}

export function setDraftCountCache(sessionId: string, count: number): void {
  draftCounts.set(sessionId, count);
}

// Plan count caches — updated when plan chips refresh
const planDoingCounts = new Map<string, number>();
const planStartableCounts = new Map<string, number>();

export function getPlanDoingCountCache(sessionId: string): number {
  return planDoingCounts.get(sessionId) ?? 0;
}

export function setPlanDoingCountCache(sessionId: string, count: number): void {
  planDoingCounts.set(sessionId, count);
}

export function getPlanStartableCountCache(sessionId: string): number {
  return planStartableCounts.get(sessionId) ?? 0;
}

export function setPlanStartableCountCache(sessionId: string, count: number): void {
  planStartableCounts.set(sessionId, count);
}

/** Get the last output timestamp for a session */
export function getLastOutputTime(sessionId: string): number {
  return lastOutputTimes.get(sessionId) ?? 0;
}

/** Set the last output timestamp for a session */
export function setLastOutputTime(sessionId: string, timestamp: number): void {
  lastOutputTimes.set(sessionId, timestamp);
}

const ACTIVITY_DEBOUNCE_MS = 300;
let removePlanChangedListener: (() => void) | null = null;

export function getSessionState(sessionId: string): string {
  return sessionStates.get(sessionId) || 'idle';
}

export function setSessionState(sessionId: string, newState: string): void {
  const previous = sessionStates.get(sessionId);
  if (previous === newState) return;
  sessionStates.set(sessionId, newState);
  loadSessions();
}

export function removeSessionState(sessionId: string): void {
  sessionStates.delete(sessionId);
  sessionActivity.delete(sessionId);
  lastOutputTimes.delete(sessionId);
}

/** Get session activity level */
export function getSessionActivity(sessionId: string): string {
  return sessionActivity.get(sessionId) ?? 'idle';
}

/** Set session activity level */
export function setSessionActivity(sessionId: string, level: string, lastOutputAt?: number): void {
  // Ignore active events right after a session switch (likely focus-induced PTY noise)
  if (level === 'active' && Date.now() - lastSwitchTime < ACTIVITY_DEBOUNCE_MS) {
    return;
  }
  if (lastOutputAt !== undefined) {
    lastOutputTimes.set(sessionId, lastOutputAt);
  }
  const previous = sessionActivity.get(sessionId) ?? 'idle';
  if (previous !== level) {
    sessionActivity.set(sessionId, level);
    // In-place DOM update: just update the dot color — avoids destroying the rename input
    updateActivityDotInPlace(sessionId, level);
  }
  // Always update the timer display (timestamp changes even if level is unchanged)
  updateTimerInPlace(sessionId);
}

/** Update just the activity dot color for a session card without re-rendering. */
function updateActivityDotInPlace(sessionId: string, level: string): void {
  const color = getActivityColor(level);
  // Session card dot
  const card = document.querySelector(`.session-card[data-session-id="${sessionId}"]`);
  const dot = card?.querySelector('.session-activity-dot') as HTMLElement | null;
  if (dot) {
    dot.style.background = color;
  }
  // Overview card dot (if overview is visible)
  const overviewCard = document.querySelector(`.overview-card[data-session-id="${sessionId}"]`);
  const overviewDot = overviewCard?.querySelector('.overview-state-dot') as HTMLElement | null;
  if (overviewDot) {
    overviewDot.style.background = color;
  }
}

/** Update the elapsed-time timer text on a session card. */
function updateTimerInPlace(sessionId: string): void {
  const card = document.querySelector(`.session-card[data-session-id="${sessionId}"]`);
  const timer = card?.querySelector('.session-timer') as HTMLElement | null;
  if (!timer) return;
  const ts = lastOutputTimes.get(sessionId);
  timer.textContent = ts ? formatElapsed(Date.now() - ts) : '';
}

/** Format milliseconds to human-readable elapsed time. */
export function formatElapsed(ms: number): string {
  if (ms < 0) return '';
  const sec = Math.floor(ms / 1000);
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const days = Math.floor(hr / 24);
  return `${days}d`;
}

/** Refresh all visible timer spans. Called by setInterval. */
export function refreshAllTimers(): void {
  const timers = document.querySelectorAll('.session-timer') as NodeListOf<HTMLElement>;
  for (const timer of timers) {
    const card = timer.closest('.session-card') as HTMLElement | null;
    if (!card?.dataset.sessionId) continue;
    const ts = lastOutputTimes.get(card.dataset.sessionId);
    timer.textContent = ts ? formatElapsed(Date.now() - ts) : '';
  }
}

// Live timer refresh — update every 10 seconds
let timerInterval: ReturnType<typeof setInterval> | null = null;

export function startTimerRefresh(): void {
  if (timerInterval) return;
  timerInterval = setInterval(refreshAllTimers, 10_000);
}

export function stopTimerRefresh(): void {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
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
      sessionsState.groupPrefs = normalizeGroupPrefs(prefs);
    }
  } catch (e) {
    console.error('[Sessions] Failed to load group prefs:', e);
  }
  groupPrefsLoaded = true;
}

function normalizeGroupPrefs(prefs: Partial<typeof sessionsState.groupPrefs>): typeof sessionsState.groupPrefs {
  return {
    order: prefs.order ?? [],
    collapsed: prefs.collapsed ?? [],
    bookmarked: prefs.bookmarked ?? [],
    overviewHidden: prefs.overviewHidden ?? [],
  };
}

/** Ensure order array contains all current dir paths (appends missing ones). */
async function saveGroupPrefs(): Promise<void> {
  try {
    if (!window.gamepadCli) return;
    await window.gamepadCli.configSetSessionGroupPrefs(sessionsState.groupPrefs);
  } catch (e) {
    console.error('[Sessions] Failed to save group prefs:', e);
  }
}

export async function toggleSessionOverviewVisibility(sessionId: string): Promise<void> {
  const session = state.sessions.find(item => item.id === sessionId);
  if (!session) return;

  const hidden = new Set(sessionsState.groupPrefs.overviewHidden ?? []);
  const aliases = getSessionOverviewAliases(session);
  const hiddenFromOverview = aliases.some(key => hidden.has(key));

  aliases.forEach(key => hidden.delete(key));
  if (!hiddenFromOverview) {
    hidden.add(getSessionOverviewKey(session));
  }

  sessionsState.groupPrefs = {
    ...sessionsState.groupPrefs,
    overviewHidden: [...hidden],
  };
  await saveGroupPrefs();
  renderSessions();
  if (isOverviewVisible()) {
    const count = getOverviewSessions().length;
    if (count === 0) {
      hideOverview();
    } else {
      sessionsState.overviewFocusIndex = clamp(sessionsState.overviewFocusIndex, 0, count - 1);
      refreshOverview();
    }
  }
  updateSessionsFocus();
}

export async function toggleGroupCollapse(dirPath: string): Promise<void> {
  sessionsState.groupPrefs = {
    ...sessionsState.groupPrefs,
    collapsed: toggleCollapse(sessionsState.groupPrefs.collapsed, dirPath),
  };
  await saveGroupPrefs();
  await loadSessions();
}

/** Remove a directory bookmark — empty group header disappears. */
export async function removeBookmark(dirPath: string): Promise<void> {
  try {
    if (window.gamepadCli) await window.gamepadCli.configRemoveBookmarkedDir(dirPath);
    const bookmarked = sessionsState.groupPrefs.bookmarked ?? [];
    sessionsState.groupPrefs = {
      ...sessionsState.groupPrefs,
      bookmarked: bookmarked.filter(d => d !== dirPath),
    };
    await loadSessions();
  } catch (e) {
    console.error('[Sessions] Failed to remove bookmark:', e);
  }
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

function getDirPathForSession(sessionId: string): string | null {
  const cwd = getSessionCwd(sessionId);
  if (cwd) return cwd;
  return state.sessions.find(session => session.id === sessionId)?.workingDir ?? null;
}

function getFocusedGroupDirPath(): string | null {
  const navItem = sessionsState.navList[sessionsState.sessionsFocusIndex];
  if (navItem?.type === 'group-header') return navItem.id;
  if (navItem?.type === 'session-card') {
    return getDirPathForSession(navItem.id) ?? sessionsState.groups[navItem.groupIndex]?.dirPath ?? null;
  }
  if (sessionsState.activeFocus === 'plans') {
    return sessionsState.directories[sessionsState.plansFocusIndex]?.path ?? null;
  }
  return null;
}

function resolvePlanShortcutDirPath(preferredSessionId?: string): string | null {
  if (preferredSessionId) return getDirPathForSession(preferredSessionId);
  // When an overview is open, Ctrl+N targets that overview's directory.
  if (sessionsState.overviewGroup) return sessionsState.overviewGroup;
  return getFocusedGroupDirPath()
    ?? (state.activeSessionId ? getDirPathForSession(state.activeSessionId) : null)
    ?? sessionsState.groups[0]?.dirPath
    ?? sessionsState.directories[0]?.path
    ?? null;
}

export async function triggerNewPlanShortcut(preferredSessionId?: string): Promise<void> {
  const dirPath = resolvePlanShortcutDirPath(preferredSessionId);
  if (!dirPath || !window.gamepadCli?.planCreate) return;
  try {
    await window.gamepadCli.planCreate(dirPath, 'New Plan', '');
    await loadSessions();
    void refreshPlanBadges();
  } catch (err) {
    console.error('[Sessions] Ctrl+N plan create failed:', err);
  }
}

// ============================================================================
// Public API
// ============================================================================

export async function loadSessions(): Promise<void> {
  ensurePlanChangedListener();
  await initSessionGroupPrefs();
  await loadSessionsData();
  await initSessionsSortControl();
  renderSessions();
  renderSpawnGrid();
  renderPlansGrid();
  updateStatusCounts();
}

function ensurePlanChangedListener(): void {
  if (removePlanChangedListener) {
    removePlanChangedListener();
    removePlanChangedListener = null;
  }
  if (!window.gamepadCli?.onPlanChanged) return;
  removePlanChangedListener = window.gamepadCli.onPlanChanged((dirPath: string) => {
    renderSessions();
    void refreshPlanBadges();

    const activeSessionId = state.activeSessionId;
    if (!activeSessionId || getSessionCwd(activeSessionId) !== dirPath) return;

    import('../plans/plan-chips.js')
      .then(({ renderPlanChips }) => renderPlanChips(activeSessionId))
      .catch(err => console.error('[Sessions] Failed to refresh plan chips:', err));
  });
}

export function handleSessionsScreenButton(button: string): boolean {
  if (isOverviewVisible()) {
    return handleOverviewInput(button);
  }

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
    } else if (sessionsState.activeFocus === 'plans') {
      handlePlansZone(button, dir);
    } else {
      handleSpawnZone(button, dir);
    }
    return true;
  }

  // Non-directional buttons: check specific handlers
  if (sessionsState.activeFocus === 'sessions') {
    return handleSessionsZoneButton(button);
  } else if (sessionsState.activeFocus === 'plans') {
    return handlePlansZoneButton(button);
  } else {
    return handleSpawnZoneButton(button);
  }
}

export function updateSessionHighlight(): void {
  sessionsState.cardColumn = 0;
  renderSessions();
  updateSessionsFocus();
}

/** Sync sidebar session highlight after a tab switch (e.g. Ctrl+Tab) */
export function syncSessionHighlight(sessionId: string): void {
  const idx = findNavIndexBySessionId(sessionsState.navList, sessionId);
  if (idx >= 0) {
    sessionsState.sessionsFocusIndex = idx;
    sessionsState.cardColumn = 0;
    state.activeSessionId = sessionId;
    // Selecting a session is mutually exclusive with the planner screen.
    if (isPlanScreenVisible()) hidePlanScreen();
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

  // Build the list in a local array and assign atomically at the end.
  // Previously we did `state.sessions = []` up-front and pushed after awaits,
  // which caused a race: concurrent callers (e.g. rapid PTY state changes
  // each firing loadSessions via setSessionState) would all reset to [] then
  // push N entries each, yielding N×callers duplicates on the session list.
  const nextSessions: Session[] = [];
  let persistedSessions: Array<{ id: string; cliSessionName?: string }> = [];
  try {
    persistedSessions = (await window.gamepadCli.sessionGetAll()) || [];
  } catch (e) {
    console.error('[Sessions] Failed to load persisted sessions:', e);
  }
  const persistedById = new Map(persistedSessions.map(session => [session.id, session]));
  const tm = getTerminalManager();
  if (tm) {
    for (const id of tm.getSessionIds()) {
      const session = tm.getSession(id);
      const persisted = persistedById.get(id);
      const cliType = session?.cliType || 'unknown';
      nextSessions.push({
        id,
        name: session?.name || cliType,
        cliType,
        processId: 0,
        workingDir: session?.cwd || '',
        title: session?.title,
        cliSessionName: persisted?.cliSessionName,
      } as Session);
    }
  }

  // Sort sessions by user preference
  state.sessions = sortSessions(
    nextSessions,
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
    if (navItem.type === 'overview-button') {
      showOverview(null, state.activeSessionId ?? undefined);
      return true;
    }
    if (navItem.type === 'group-header') {
      if (sessionsState.cardColumn === 0) {
        toggleGroupCollapse(navItem.id);
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
      toggleSessionOverviewVisibility(navItem.id);
      return true;
    }
    if (sessionsState.cardColumn === 4) {
      confirmCloseSession();
      return true;
    }
    // col=0: fall through to config bindings
    return false;
  }
  if (button === 'B') {
    if (sessionsState.cardColumn > 0) {
      sessionsState.cardColumn = (sessionsState.cardColumn - 1) as 0 | 1 | 2 | 3 | 4;
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
  // DOM walks navList order: a mix of .group-header and .session-card, each
  // carrying its nav index via dataset.navIndex. Focus styling applies
  // uniformly across both kinds.
  const items = Array.from(list.children) as HTMLElement[];
  items.forEach(el => {
    if (!el.classList.contains('session-card') && !el.classList.contains('group-header')) {
      el.classList.remove('focused');
      return;
    }
    const idxStr = el.dataset.navIndex;
    const idx = idxStr !== undefined ? Number(idxStr) : -1;
    const isFocused = idx === sessionsState.sessionsFocusIndex && sessionsState.activeFocus === 'sessions';
    el.classList.toggle('focused', isFocused);

    if (el.classList.contains('session-card')) {
      const stateBtn = el.querySelector('.session-state-btn');
      const renameBtn = el.querySelector('.session-rename');
      const eyeBtn = el.querySelector('.session-overview-toggle');
      const closeBtn = el.querySelector('.session-close');
      if (stateBtn) stateBtn.classList.toggle('card-col-focused', isFocused && sessionsState.cardColumn === 1);
      if (renameBtn) renameBtn.classList.toggle('card-col-focused', isFocused && sessionsState.cardColumn === 2);
      if (eyeBtn) eyeBtn.classList.toggle('card-col-focused', isFocused && sessionsState.cardColumn === 3);
      if (closeBtn) closeBtn.classList.toggle('card-col-focused', isFocused && sessionsState.cardColumn === 4);
    } else if (el.classList.contains('group-header')) {
      // No sub-buttons on group headers
    }
  });
  const focused = items.find(el => el.classList.contains('focused'));
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
  updatePlansFocus();
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

  const active = document.activeElement;
  const view = currentView();

  if (e.key === 'n' && (e.ctrlKey || e.metaKey)) {
    if (document.querySelector('.modal-overlay.modal--visible')) return;
    const draftEditor = document.getElementById('draftEditor');
    if (draftEditor && draftEditor.style.display !== 'none') return;
    // Let the plan screen own Ctrl+N while it's focused (adds a node).
    if (view === 'plan') return;
    // On overview, Ctrl+N creates a plan for the currently overviewed directory.
    e.preventDefault();
    e.stopPropagation();
    void triggerNewPlanShortcut();
    return;
  }

  // Don't intercept keyboard when xterm.js or an editable element has DOM focus
  if (active && active.closest('.xterm')) return;
  const tag = active?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

  const keyMap: Record<string, string> = {
    ArrowUp: 'DPadUp', ArrowDown: 'DPadDown', ArrowLeft: 'DPadLeft', ArrowRight: 'DPadRight',
    Enter: 'A', Escape: 'B', Delete: 'X', F5: 'Y',
  };

  const mapped = keyMap[e.key];
  if (!mapped) return;

  // Route through the active main-view so plan/overview handlers run instead
  // of being bypassed by this capture-phase listener.
  if (view === 'plan') {
    // Plan screen has its own bubble-phase key handler for Delete/Escape;
    // arrow keys + Enter need to be forwarded because nothing else handles them.
    const dir = toDirection(mapped);
    if (dir) {
      e.preventDefault();
      e.stopPropagation();
      handlePlanScreenDpad(dir);
      return;
    }
    if (mapped === 'A') {
      e.preventDefault();
      e.stopPropagation();
      handlePlanScreenAction('A');
      return;
    }
    // B/X/Y/Escape/Delete — let the plan-screen's own bubble handler process them.
    return;
  }

  if (view === 'overview') {
    e.preventDefault();
    e.stopPropagation();
    handleOverviewInput(mapped);
    return;
  }

  e.preventDefault();
  e.stopPropagation();
  handleSessionsScreenButton(mapped);
}

document.addEventListener('keydown', onKeyDown, true);
