/**
 * Sessions screen — sidebar state, navigation handlers, and public API.
 *
 * Vue renders the grouped session list. This module owns the navigation state,
 * keyboard/gamepad routing, and non-visual session services.
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
import {
  getOverviewSessions, handleOverviewInput, hideOverview, isOverviewVisible, refreshOverview,
} from './group-overview.js';
import { useNavigationStore } from '../stores/navigation.js';
import { isPlanScreenVisible, handlePlanScreenDpad, handlePlanScreenAction, hidePlanScreen, getCurrentPlanDirPath } from '../plans/plan-screen.js';
import { currentView } from '../main-view/main-view-manager.js';

// Sub-module imports — circular at module level, safe because all usages are in function bodies.
import {
  initSessionsSortControl, updateStatusCounts,
  startRename, commitRename, cancelRename,
  sessionsSortField, sessionsSortDirection,
} from './sessions-render.js';

import {
  doSpawn, showTerminalArea, hideTerminalArea,
  setDirPickerBridge, setTerminalManagerGetter, setPendingContextText,
  spawnNewSession, switchToSession,
  getSessionCwd, getTerminalManager,
  autoSelectFocusedSession, renderSpawnGrid,
  handleSessionsZone, handleSpawnZone, handleSpawnZoneButton,
  clamp,
} from './sessions-spawn.js';

import {
  handlePlansZone, handlePlansZoneButton, renderPlansGrid, updatePlansFocus, refreshPlanBadges,
} from './sessions-plans.js';
import { useChipBarStore } from '../stores/chip-bar.js';
import { openQuickSpawn } from '../stores/modal-bridge.js';

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

let removePlanChangedListener: (() => void) | null = null;

export function getSessionState(sessionId: string): string {
  return sessionStates.get(sessionId) || 'idle';
}

export async function setSessionState(sessionId: string, newState: string): Promise<void> {
  const previous = sessionStates.get(sessionId) ?? state.sessionStates.get(sessionId) ?? 'idle';
  if (previous === newState) return;

  try {
    if (!window.gamepadCli?.sessionSetState) return;
    const result = await window.gamepadCli.sessionSetState(sessionId, newState);
    if (result?.success === false) {
      logEvent(`State change failed: ${result.error}`);
      return;
    }

    sessionStates.set(sessionId, newState);
    state.sessionStates.set(sessionId, newState);

    const session = state.sessions.find(item => item.id === sessionId);
    if (session) {
      (session as any).state = newState;
    }

    if (sessionsSortField === 'state') {
      await loadSessionsData();
    }

    if (isOverviewVisible()) {
      refreshOverview();
    }

    updateSessionsFocus();
  } catch (error) {
    console.error('[Sessions] Failed to set session state:', error);
    logEvent('State change failed');
  }
}

export function removeSessionState(sessionId: string): void {
  sessionStates.delete(sessionId);
}

/** Get session activity level — reads from reactive state updated by useAppBootstrap. */
export function getSessionActivity(sessionId: string): string {
  return state.sessionActivityLevels.get(sessionId) ?? 'idle';
}

function cleanupRendererSession(sessionId: string): void {
  removeSessionState(sessionId);
  draftCounts.delete(sessionId);
  planDoingCounts.delete(sessionId);
  planStartableCounts.delete(sessionId);
  state.sessionActivityLevels.delete(sessionId);
  state.lastOutputTimes.delete(sessionId);
  state.workingPlanLabels.delete(sessionId);
  state.workingPlanTooltips.delete(sessionId);
  state.pendingSchedules.delete(sessionId);
  state.snappedOutSessions.delete(sessionId);
}

export async function doCloseSession(sessionId: string): Promise<void> {
  if (!window.gamepadCli) return;

  try {
    const result = await window.gamepadCli.sessionClose(sessionId);
    if (!result?.success && result?.error !== 'Session not found') {
      console.error(`[Sessions] Failed to close session ${sessionId}:`, result?.error ?? 'unknown error');
      return;
    }
  } catch (error) {
    console.error(`[Sessions] Failed to close session ${sessionId}:`, error);
    return;
  }

  cleanupRendererSession(sessionId);
  await loadSessions();
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
    await window.gamepadCli.configSetSessionGroupPrefs({
      order: [...sessionsState.groupPrefs.order],
      collapsed: [...sessionsState.groupPrefs.collapsed],
      overviewHidden: [...sessionsState.groupPrefs.overviewHidden],
    });
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
  confirmCloseSessionById(session.id);
}

function confirmCloseSessionById(sessionId: string): void {
  const session = state.sessions.find(s => s.id === sessionId);
  if (!session) return;
  const displayName = session.name !== session.cliType
    ? session.name
    : getCliDisplayName(session.cliType);

  showCloseConfirm(session.id, displayName, doCloseSession, getDraftCountCache(session.id));
}

function getFocusedRenderedSessionCard(): HTMLElement | null {
  const navItem = sessionsState.navList[sessionsState.sessionsFocusIndex];
  if (!navItem || navItem.type !== 'session-card') return null;
  return document.querySelector(`.session-card[data-session-id="${navItem.id}"]`) as HTMLElement | null;
}

function getEditingRenameInput(): HTMLInputElement | null {
  if (sessionsState.editingSessionId) {
    const editingCard = document.querySelector(
      `.session-card[data-session-id="${sessionsState.editingSessionId}"]`
    ) as HTMLElement | null;
    const editingInput = editingCard?.querySelector('.session-rename-input') as HTMLInputElement | null;
    if (editingInput) return editingInput;
  }
  return document.querySelector('.session-rename-input') as HTMLInputElement | null;
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

function getCurrentShortcutSessionId(): string | null {
  return state.activeSessionId ?? state.recentSessionId;
}

function resolveCurrentShortcutDirPath(): string | null {
  const preferredSessionId = getCurrentShortcutSessionId();
  return resolvePlanShortcutDirPath(preferredSessionId ?? undefined)
    ?? getCurrentPlanDirPath()
    ?? null;
}

async function openCurrentSessionPlanShortcut(): Promise<void> {
  const dirPath = resolveCurrentShortcutDirPath();
  if (!dirPath) return;
  await useNavigationStore().openPlan(dirPath);
}

async function toggleCurrentSessionOverviewShortcut(): Promise<void> {
  const preferredSessionId = getCurrentShortcutSessionId();
  const dirPath = resolveCurrentShortcutDirPath();
  if (!dirPath) return;

  if (currentView() === 'overview') {
    if (sessionsState.overviewIsGlobal) {
      await useNavigationStore().openOverview(dirPath, preferredSessionId ?? undefined);
      return;
    }
    if (sessionsState.overviewGroup === dirPath) {
      await useNavigationStore().openOverview(null, preferredSessionId ?? undefined);
      return;
    }
  }

  await useNavigationStore().openOverview(dirPath, preferredSessionId ?? undefined);
}

async function switchToLastSelectedSessionShortcut(): Promise<void> {
  const sessionId = getCurrentShortcutSessionId() ?? state.lastSelectedSessionId;
  if (!sessionId || !state.sessions.some(session => session.id === sessionId)) return;
  await useNavigationStore().navigateToSession(sessionId);
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
    void refreshPlanBadges();

    const activeSessionId = state.activeSessionId;
    if (!activeSessionId || getSessionCwd(activeSessionId) !== dirPath) return;
    void useChipBarStore().refresh(activeSessionId);
  });
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
    const input = getEditingRenameInput();
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

/** Open the state dropdown for the currently focused session card via Vue bridge. */
function openStateDropdownForFocused(): void {
  const session = getSessionAtFocus();
  if (!session) return;
  const card = getFocusedRenderedSessionCard()
    ?? document.querySelector(`.session-card[data-session-id="${session.id}"]`);
  if (!card) return;
  card.dispatchEvent(new CustomEvent('open-state-dropdown'));
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
    const card = dropdown.closest('.session-card');
    card?.dispatchEvent(new CustomEvent('close-state-dropdown'));
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
      void useNavigationStore().openOverview(null, state.activeSessionId ?? undefined);
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
  // Vue owns the visual focused/card-column classes; this helper only keeps the
  // currently focused rendered row visible as navigation state changes.
  if (sessionsState.activeFocus !== 'sessions') return;
  const focused = list.querySelector<HTMLElement>(
    `[data-nav-index="${sessionsState.sessionsFocusIndex}"]`,
  );
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

export function refreshSessions(): void {
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

  // Bridge/Vue modals own keyboard navigation while visible.
  if (document.querySelector('.modal-overlay.modal--visible')) return;

  if (e.shiftKey && (e.ctrlKey || e.metaKey)) {
    const key = e.key.toLowerCase();

    if (key === 'p') {
      e.preventDefault();
      e.stopPropagation();
      void openCurrentSessionPlanShortcut();
      return;
    }

    if (key === 'o') {
      e.preventDefault();
      e.stopPropagation();
      void toggleCurrentSessionOverviewShortcut();
      return;
    }

    if (key === 's') {
      e.preventDefault();
      e.stopPropagation();
      void switchToLastSelectedSessionShortcut();
      return;
    }
  }

  if (e.key.toLowerCase() === 'n' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
    const draftEditor = document.getElementById('draftEditor');
    if (draftEditor && draftEditor.style.display !== 'none') return;
    // Let the plan screen own Ctrl+N while it's focused (adds a node).
    if (view === 'plan') return;
    // When in terminal view, Ctrl+N opens the CLI picker then folder picker.
    if (view === 'terminal') {
      e.preventDefault();
      e.stopPropagation();
      openQuickSpawn((cliType) => {
        void spawnNewSession(cliType);
      });
      return;
    }
    // On overview, Ctrl+N creates a plan for the currently overviewed directory.
    if (view === 'overview') {
      e.preventDefault();
      e.stopPropagation();
      void triggerNewPlanShortcut();
      return;
    }
    // Default: create a plan for the focused directory group (sidebar focus).
    e.preventDefault();
    e.stopPropagation();
    void triggerNewPlanShortcut();
    return;
  }

  if (e.key.toLowerCase() === 'w' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
    // Close the active session when in terminal view.
    if (view === 'terminal' && state.activeSessionId) {
      e.preventDefault();
      e.stopPropagation();
      confirmCloseSessionById(state.activeSessionId);
      return;
    }
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
    if (!handleOverviewInput(mapped)) handleSessionsScreenButton(mapped);
    return;
  }

  e.preventDefault();
  e.stopPropagation();
  handleSessionsScreenButton(mapped);
}

document.addEventListener('keydown', onKeyDown, true);
