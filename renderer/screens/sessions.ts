/**
 * Sessions screen — vertical session list + quick spawn grid.
 *
 * Two navigation zones: session cards (top) and spawn buttons (bottom).
 * Replaces the old 3-panel launcher layout.
 */

import { state } from '../state.js';
import { sessionsState, type SessionsFocus } from './sessions-state.js';
import { logEvent, getCliIcon, getCliDisplayName, toDirection } from '../utils.js';
import type { TerminalManager } from '../terminal/terminal-manager.js';
import type { Session } from '../state.js';
import { showCloseConfirm } from '../modals/close-confirm.js';
import { sortSessions, SESSION_SORT_LABELS, type SessionSortField, type SortDirection } from '../sort-logic.js';
import { createSortControl, type SortControlHandle } from '../components/sort-control.js';

// ============================================================================
// Constants
// ============================================================================

/** Delay before sending context text to a newly spawned PTY (ms) */
const CONTEXT_TEXT_DELAY_MS = 500;

// ============================================================================
// State helpers
// ============================================================================

const STATE_LABELS: Record<string, string> = {
  implementing: '🔨 Implementing',
  waiting: '⏳ Waiting',
  planning: '🧠 Planning',
  idle: '💤 Idle',
};

// STATE_ICONS removed — state shown via dropdown button only

const STATE_ORDER: Record<string, number> = {
  implementing: 0,
  waiting: 1,
  planning: 2,
  idle: 3,
};

let sessionsSortControl: SortControlHandle | null = null;
let sessionsSortField: SessionSortField = 'state';
let sessionsSortDirection: SortDirection = 'asc';

function getStateLabel(sessionState: string): string {
  return STATE_LABELS[sessionState] || '💤 Idle';
}

const sessionStates = new Map<string, string>();

/** Track session activity status (active = recent output, inactive = no output for timeout period) */
const sessionActivity = new Map<string, boolean>();

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

/** Get session activity status */
export function getSessionActivity(sessionId: string): boolean {
  return sessionActivity.get(sessionId) ?? false;
}

/** Set session activity status */
export function setSessionActivity(sessionId: string, isActive: boolean): void {
  const wasActive = sessionActivity.get(sessionId) ?? false;
  if (wasActive !== isActive) {
    sessionActivity.set(sessionId, isActive);
    loadSessions();
  }
}

function doCloseSession(sessionId: string): void {
  const tm = terminalManagerGetter ? terminalManagerGetter() : null;
  if (tm) tm.destroyTerminal(sessionId);
  removeSessionState(sessionId);
  loadSessions();
}

function confirmCloseSession(): void {
  const session = state.sessions[sessionsState.sessionsFocusIndex];
  if (!session) return;
  const displayName = session.name !== session.cliType
    ? session.name
    : getCliDisplayName(session.cliType);

  showCloseConfirm(session.id, displayName, doCloseSession);
}

function startRenameForFocused(): void {
  const session = state.sessions[sessionsState.sessionsFocusIndex];
  if (!session) return;
  startRename(session.id);
}

function getSessionCwd(sessionId: string): string {
  const tm = terminalManagerGetter ? terminalManagerGetter() : null;
  if (!tm) return '';
  const session = tm.getSession(sessionId);
  return session?.cwd || '';
}

// ============================================================================
// Public API
// ============================================================================

export async function loadSessions(): Promise<void> {
  await loadSessionsData();
  await initSessionsSortControl();
  renderSessions();
  renderSpawnGrid();
  updateStatusCounts();
}

async function initSessionsSortControl(): Promise<void> {
  const container = document.getElementById('sessionsSortBar');
  if (!container) return;

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
        );
        renderSessions();
        updateSessionsFocus();
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

/** Open the state dropdown for the currently focused session card. */
function openStateDropdownForFocused(): void {
  const session = state.sessions[sessionsState.sessionsFocusIndex];
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

export function handleSessionsScreenButton(button: string): boolean {
  // State dropdown intercepts all input when open
  const dropdown = document.querySelector('.session-state-dropdown');
  if (dropdown) {
    handleStateDropdownButton(button, dropdown as HTMLElement);
    return true; // consumed
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

export async function doSpawn(cliType: string, workingDir?: string, contextText?: string): Promise<void> {
  // Consume pendingContextText if no explicit contextText was provided
  const resolvedContextText = contextText ?? pendingContextText ?? undefined;
  pendingContextText = null;

  try {
    logEvent(`Spawning ${cliType}${workingDir ? ` in ${workingDir}` : ''}...`);
    console.warn(`[doSpawn] ENTRY — cliType=${cliType}, workingDir=${workingDir}`);
    if (!window.gamepadCli) {
      logEvent('Spawn failed: gamepadCli not available');
      return;
    }

    const hasGetter = !!terminalManagerGetter;
    const tm = terminalManagerGetter ? terminalManagerGetter() : null;
    console.warn(`[doSpawn] hasGetter=${hasGetter}, tm=${!!tm}, tmType=${tm?.constructor?.name}`);
    if (tm) {
      // Embedded terminal path — use PTY
      const spawnInfo = await window.gamepadCli.configGetSpawnCommand(cliType);
      console.warn(`[doSpawn] spawnInfo=`, JSON.stringify(spawnInfo));
      if (!spawnInfo) {
        logEvent(`Spawn failed: no command configured for ${cliType}`);
        return;
      }

      const sessionId = `pty-${cliType}-${Date.now()}`;
      console.warn(`[doSpawn] Creating PTY terminal: id=${sessionId}, cmd=${spawnInfo.command}, args=${JSON.stringify(spawnInfo.args)}, cwd=${workingDir}`);
      const success = await tm.createTerminal(
        sessionId,
        cliType,
        spawnInfo.command,
        spawnInfo.args || [],
        workingDir,
      );

      console.warn(`[doSpawn] createTerminal result: ${success}`);
      if (success) {
        logEvent(`Spawned embedded terminal: ${cliType}`);
        showTerminalArea();
        // Auto-select the new session
        tm.switchTo(sessionId);
        state.activeSessionId = sessionId;

        // Send context text to the PTY after a short delay
        if (resolvedContextText && resolvedContextText.trim()) {
          setTimeout(() => {
            window.gamepadCli?.ptyWrite(sessionId, resolvedContextText);
          }, CONTEXT_TEXT_DELAY_MS);
        }

        setTimeout(async () => {
          try {
            await loadSessions();
            // Focus the newly spawned session (last in the list)
            const newIndex = state.sessions.findIndex(s => s.id === sessionId);
            if (newIndex >= 0) {
              sessionsState.sessionsFocusIndex = newIndex;
              sessionsState.activeFocus = 'sessions';
              sessionsState.cardColumn = 0;
              updateSessionsFocus();
            }
          } catch (e) { console.error('[Sessions] Post-spawn refresh failed:', e); }
        }, 300);
      } else {
        logEvent(`Spawn FAILED: PTY creation returned false for ${cliType}`);
        console.error(`[doSpawn] PTY creation failed — likely node-pty native module issue`);
      }
    }
  } catch (error) {
    console.error('[Sessions] Failed to spawn session:', error);
    logEvent('Spawn failed');
  }
}

export function showTerminalArea(): void {
  const terminalArea = document.getElementById('terminalArea');
  const splitter = document.getElementById('panelSplitter');
  if (terminalArea) terminalArea.style.display = 'flex';
  if (splitter) splitter.style.display = 'block';
  const tm = terminalManagerGetter ? terminalManagerGetter() : null;
  if (tm) {
    requestAnimationFrame(() => {
      tm.focusActive();
      tm.fitActive();
    });
  }
}

export function hideTerminalArea(): void {
  const terminalArea = document.getElementById('terminalArea');
  const splitter = document.getElementById('panelSplitter');
  if (terminalArea) terminalArea.style.display = 'none';
  if (splitter) splitter.style.display = 'none';
}

export function updateSessionHighlight(): void {
  renderSessions();
  updateSessionsFocus();
}

/** Sync sidebar session highlight after a tab switch (e.g. Ctrl+Tab) */
export function syncSessionHighlight(sessionId: string): void {
  const idx = state.sessions.findIndex(s => s.id === sessionId);
  if (idx >= 0) {
    sessionsState.sessionsFocusIndex = idx;
    state.activeSessionId = sessionId;
    renderSessions();
    updateSessionsFocus();
  }
}

// ============================================================================
// Bridge for spawning via dir-picker (set by main.ts to avoid circular imports)
// ============================================================================

let dirPickerBridge: ((cliType: string, dirs: Array<{ name: string; path: string }>) => void) | null = null;

export function setDirPickerBridge(fn: (cliType: string, dirs: Array<{ name: string; path: string }>) => void): void {
  dirPickerBridge = fn;
}

// ============================================================================
// Bridge for terminal manager (set by main.ts to avoid circular imports)
// ============================================================================

let terminalManagerGetter: (() => TerminalManager | null) | null = null;

export function setTerminalManagerGetter(fn: () => TerminalManager | null): void {
  terminalManagerGetter = fn;
}

// ============================================================================
// Pending context text — set by context menu, consumed by spawnNewSession
// ============================================================================

let pendingContextText: string | null = null;

export function setPendingContextText(text: string | null): void {
  pendingContextText = text;
}

export async function spawnNewSession(cliType?: string): Promise<void> {
  const resolvedType = cliType || state.availableSpawnTypes[0] || 'generic-terminal';

  try {
    if (!window.gamepadCli) {
      logEvent('Spawn failed: gamepadCli not available');
      return;
    }
    const dirs = await window.gamepadCli.configGetWorkingDirs();
    if (dirs && dirs.length > 0 && dirPickerBridge) {
      // pendingContextText survives through dirPicker — doSpawn consumes it
      dirPickerBridge(resolvedType, dirs);
      return;
    }
    await doSpawn(resolvedType);
  } catch (error) {
    console.error('Spawn error:', error);
    logEvent(`Spawn error: ${error}`);
  }
}

// ============================================================================
// Data loading
// ============================================================================

async function loadSessionsData(): Promise<void> {
  if (!window.gamepadCli) return;

  // Only show embedded terminal sessions — no external window sessions
  state.sessions = [];
  const tm = terminalManagerGetter ? terminalManagerGetter() : null;
  if (tm) {
    for (const id of tm.getSessionIds()) {
      const session = tm.getSession(id);
      const cliType = session?.cliType || 'unknown';
      state.sessions.push({
        id,
        name: session?.name || cliType,
        cliType,
        processId: 0,
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
  );

  try {
    sessionsState.cliTypes = await window.gamepadCli.configGetCliTypes();
  } catch (e) { console.error('[Sessions] Failed to load CLI types:', e); }

  try {
    sessionsState.directories = (await window.gamepadCli.configGetWorkingDirs()) || [];
  } catch (e) { console.error('[Sessions] Failed to load directories:', e); }

  // Clamp focus indices after data reload
  const activeIdx = state.sessions.findIndex(s => s.id === state.activeSessionId);
  sessionsState.sessionsFocusIndex = activeIdx >= 0
    ? activeIdx
    : clamp(sessionsState.sessionsFocusIndex, 0, Math.max(0, state.sessions.length - 1));
  sessionsState.spawnFocusIndex = clamp(
    sessionsState.spawnFocusIndex, 0, Math.max(0, sessionsState.cliTypes.length - 1),
  );
}

// ============================================================================
// Render — sessions list
// ============================================================================

/** Start editing a session name */
function startRename(sessionId: string): void {
  sessionsState.editingSessionId = sessionId;
  renderSessions();
}

/** Cancel editing and restore display mode */
function cancelRename(): void {
  sessionsState.editingSessionId = null;
  renderSessions();
}

/** Commit the rename and update the session */
async function commitRename(sessionId: string, newName: string): void {
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
      const tm = terminalManagerGetter ? terminalManagerGetter() : null;
      if (tm) tm.renameSession(sessionId, trimmed);
      // Reload sessions to get updated data
      await loadSessionsData();
      renderSessions();
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

function renderSessions(): void {
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

  state.sessions.forEach((session, index) => {
    list.appendChild(createSessionCard(session, index));
  });
}

function createSessionCard(session: typeof state.sessions[0], index: number): HTMLElement {
  const card = document.createElement('div');
  card.className = 'session-card';
  if (session.id === state.activeSessionId) card.classList.add('active');
  if (index === sessionsState.sessionsFocusIndex && sessionsState.activeFocus === 'sessions') {
    card.classList.add('focused');
  }
  card.dataset.sessionId = session.id;

  const sessionState = getSessionState(session.id);
  const isActive = getSessionActivity(session.id);
  const displayName = session.name !== session.cliType ? session.name : getCliDisplayName(session.cliType);
  const folder = getSessionCwd(session.id);

  const isEditing = sessionsState.editingSessionId === session.id;
  const isFocusedCard = index === sessionsState.sessionsFocusIndex && sessionsState.activeFocus === 'sessions';

  // --- Left side: activity dot + name ---

  const activityDot = document.createElement('span');
  activityDot.className = `session-activity-dot${isActive ? ' session-activity-dot--active' : ' session-activity-dot--inactive'}`;

  const info = document.createElement('div');
  info.className = 'session-info';

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

    setTimeout(() => input.focus(), 0);

    nameLine.appendChild(input);
    nameLine.appendChild(saveBtn);
    nameLine.appendChild(cancelBtn);
  } else {
    const name = document.createElement('span');
    name.className = 'session-name';
    name.textContent = folder ? `${displayName} — ${folder}` : displayName;
    nameLine.appendChild(name);
  }

  info.appendChild(nameLine);

  // --- Right side: state → rename → close ---

  const stateBtn = document.createElement('button');
  stateBtn.className = 'session-state-btn';
  if (isFocusedCard && sessionsState.cardColumn === 1) stateBtn.classList.add('card-col-focused');
  stateBtn.textContent = getStateLabel(sessionState);
  stateBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showStateDropdown(stateBtn, session.id, sessionState);
  });

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
  }

  const closeBtn = document.createElement('button');
  closeBtn.className = 'session-close';
  if (isFocusedCard && sessionsState.cardColumn === 3) closeBtn.classList.add('card-col-focused');
  closeBtn.textContent = '✕';
  closeBtn.title = `Close ${displayName}`;
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showCloseConfirm(session.id, displayName, doCloseSession);
  });

  // Append in visual order: dot → name → state → rename → close
  card.appendChild(activityDot);
  card.appendChild(info);
  card.appendChild(stateBtn);
  if (renameBtn) card.appendChild(renameBtn);
  card.appendChild(closeBtn);

  card.addEventListener('click', () => switchToSession(session.id));
  return card;
}

function showStateDropdown(anchor: HTMLElement, sessionId: string, currentState: string): void {
  // Close any existing dropdown
  document.querySelectorAll('.session-state-dropdown').forEach(el => el.remove());

  const dropdown = document.createElement('div');
  dropdown.className = 'session-state-dropdown';

  const states = ['implementing', 'waiting', 'planning', 'idle'];
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
  const sidebar = document.getElementById('panelLeft') || anchor.parentElement!;
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

// ============================================================================
// Render — spawn grid
// ============================================================================

function renderSpawnGrid(): void {
  const grid = document.getElementById('spawnGrid');
  if (!grid) return;
  grid.innerHTML = '';

  sessionsState.cliTypes.forEach((cliType, index) => {
    grid.appendChild(createSpawnButton(cliType, index));
  });
}

function createSpawnButton(cliType: string, index: number): HTMLElement {
  const btn = document.createElement('button');
  btn.className = 'spawn-btn';
  if (index === sessionsState.spawnFocusIndex && sessionsState.activeFocus === 'spawn') {
    btn.classList.add('focused');
  }

  const icon = document.createElement('span');
  icon.className = 'spawn-icon';
  icon.textContent = getCliIcon(cliType);

  const label = document.createElement('span');
  label.className = 'spawn-label';
  label.textContent = getCliDisplayName(cliType);

  btn.appendChild(icon);
  btn.appendChild(label);

  btn.addEventListener('click', () => spawnNewSession(cliType));
  return btn;
}

// ============================================================================
// Status counts
// ============================================================================

function updateStatusCounts(): void {
  const totalEl = document.getElementById('statusTotalSessions');
  const activeEl = document.getElementById('statusActiveSessions');
  if (totalEl) totalEl.textContent = state.sessions.length.toString();
  if (activeEl) activeEl.textContent = state.sessions.some(s => s.id === state.activeSessionId) ? '1' : '0';
}

// ============================================================================
// Gamepad navigation — sessions zone
// ============================================================================

function handleSessionsZone(button: string, dir: string | null): void {
  const count = state.sessions.length;

  if (dir === 'right') {
    if (count === 0) return;
    if (sessionsState.cardColumn < 3) {
      sessionsState.cardColumn = (sessionsState.cardColumn + 1) as 0 | 1 | 2 | 3;
      updateSessionsFocus();
    }
    return;
  }
  if (dir === 'left') {
    if (sessionsState.cardColumn > 0) {
      sessionsState.cardColumn = (sessionsState.cardColumn - 1) as 0 | 1 | 2 | 3;
      updateSessionsFocus();
    }
    return;
  }

  if (dir === 'up') {
    if (count === 0) return;
    if (sessionsState.cardColumn > 0) return; // no-op when on action buttons
    sessionsState.sessionsFocusIndex = Math.max(0, sessionsState.sessionsFocusIndex - 1);
    sessionsState.cardColumn = 0;
    updateSessionsFocus();
    autoSelectFocusedSession();
    return;
  }
  if (dir === 'down') {
    if (sessionsState.cardColumn > 0) return; // no-op when on action buttons
    if (count === 0 || sessionsState.sessionsFocusIndex >= count - 1) {
      sessionsState.activeFocus = 'spawn';
      sessionsState.spawnFocusIndex = 0;
      sessionsState.cardColumn = 0;
      updateAllFocus();
      return;
    }
    sessionsState.sessionsFocusIndex++;
    sessionsState.cardColumn = 0;
    updateSessionsFocus();
    autoSelectFocusedSession();
    return;
  }
}

function handleSessionsZoneButton(button: string): boolean {
  if (button === 'A') {
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
// Gamepad navigation — spawn zone
// ============================================================================

function handleSpawnZone(button: string, dir: string | null): void {
  const count = sessionsState.cliTypes.length;
  const cols = 2;

  if (dir === 'up') {
    const newIndex = sessionsState.spawnFocusIndex - cols;
    if (newIndex < 0) {
      sessionsState.activeFocus = 'sessions';
      sessionsState.sessionsFocusIndex = Math.max(0, state.sessions.length - 1);
      sessionsState.cardColumn = 0;
      updateAllFocus();
      return;
    }
    sessionsState.spawnFocusIndex = newIndex;
    updateSpawnFocus();
    return;
  }
  if (dir === 'down') {
    const newIndex = sessionsState.spawnFocusIndex + cols;
    if (newIndex < count) {
      sessionsState.spawnFocusIndex = newIndex;
      updateSpawnFocus();
    }
    return;
  }
  if (dir === 'left') {
    if (sessionsState.spawnFocusIndex % cols > 0) {
      sessionsState.spawnFocusIndex--;
      updateSpawnFocus();
    }
    return;
  }
  if (dir === 'right') {
    if (sessionsState.spawnFocusIndex % cols < cols - 1 && sessionsState.spawnFocusIndex + 1 < count) {
      sessionsState.spawnFocusIndex++;
      updateSpawnFocus();
    }
    return;
  }
}

function handleSpawnZoneButton(button: string): boolean {
  switch (button) {
    case 'A': {
      const cliType = sessionsState.cliTypes[sessionsState.spawnFocusIndex];
      if (cliType) spawnNewSession(cliType);
      return true;
    }
    case 'B':
      sessionsState.activeFocus = 'sessions';
      updateAllFocus();
      return true;
    default:
      return false;
  }
}

// ============================================================================
// Focus update helpers
// ============================================================================

function updateSessionsFocus(): void {
  const list = document.getElementById('sessionsList');
  if (!list) return;
  list.querySelectorAll('.session-card').forEach((el, i) => {
    const isFocused = i === sessionsState.sessionsFocusIndex && sessionsState.activeFocus === 'sessions';
    el.classList.toggle('focused', isFocused);
    const stateBtn = el.querySelector('.session-state-btn');
    const renameBtn = el.querySelector('.session-rename');
    const closeBtn = el.querySelector('.session-close');
    if (stateBtn) stateBtn.classList.toggle('card-col-focused', isFocused && sessionsState.cardColumn === 1);
    if (renameBtn) renameBtn.classList.toggle('card-col-focused', isFocused && sessionsState.cardColumn === 2);
    if (closeBtn) closeBtn.classList.toggle('card-col-focused', isFocused && sessionsState.cardColumn === 3);
  });
  const focused = list.children[sessionsState.sessionsFocusIndex] as HTMLElement;
  focused?.scrollIntoView({ block: 'nearest' });
}

function updateSpawnFocus(): void {
  const grid = document.getElementById('spawnGrid');
  if (!grid) return;
  grid.querySelectorAll('.spawn-btn').forEach((el, i) => {
    el.classList.toggle('focused', i === sessionsState.spawnFocusIndex && sessionsState.activeFocus === 'spawn');
  });
}

function updateAllFocus(): void {
  updateSessionsFocus();
  updateSpawnFocus();
}

// ============================================================================
// Actions
// ============================================================================

/** Auto-switch the terminal to whichever session has D-pad focus. */
function autoSelectFocusedSession(): void {
  const session = state.sessions[sessionsState.sessionsFocusIndex];
  if (!session) return;
  const tm = terminalManagerGetter ? terminalManagerGetter() : null;
  if (tm && tm.hasTerminal(session.id)) {
    tm.switchTo(session.id);
    state.activeSessionId = session.id;
  }
}

async function switchToSession(sessionId: string): Promise<void> {
  // Check if this is an embedded terminal
  const tm = terminalManagerGetter ? terminalManagerGetter() : null;
  if (tm && tm.hasTerminal(sessionId)) {
    tm.switchTo(sessionId);
    showTerminalArea();
    return;
  }

  // Non-embedded session — shouldn't happen, log warning
  console.warn(`[Sessions] Session ${sessionId} is not an embedded terminal`);
}

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

  // Don't intercept keyboard when an embedded terminal is visible
  const terminalArea = document.getElementById('terminalArea');
  if (terminalArea && terminalArea.style.display !== 'none') return;

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

// ============================================================================
// Utilities
// ============================================================================

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
