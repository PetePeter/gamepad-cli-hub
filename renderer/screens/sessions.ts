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

// ============================================================================
// State helpers
// ============================================================================

const STATE_LABELS: Record<string, string> = {
  implementing: '🔨 Implementing',
  waiting: '⏳ Waiting',
  planning: '🧠 Planning',
  idle: '💤 Idle',
};

const STATE_ORDER: Record<string, number> = {
  implementing: 0,
  waiting: 1,
  planning: 2,
  idle: 3,
};

function getStateLabel(sessionState: string): string {
  return STATE_LABELS[sessionState] || '💤 Idle';
}

const sessionStates = new Map<string, string>();

export function getSessionState(sessionId: string): string {
  return sessionStates.get(sessionId) || 'idle';
}

export function setSessionState(sessionId: string, newState: string): void {
  sessionStates.set(sessionId, newState);
  loadSessions();
}

export function removeSessionState(sessionId: string): void {
  sessionStates.delete(sessionId);
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
  renderSessions();
  renderSpawnGrid();
  updateStatusCounts();
}

export function handleSessionsScreenButton(button: string): boolean {
  const dir = toDirection(button);

  if (sessionsState.activeFocus === 'sessions') {
    handleSessionsZone(button, dir);
  } else {
    handleSpawnZone(button, dir);
  }
  return true;
}

export async function doSpawn(cliType: string, workingDir?: string): Promise<void> {
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
        state.terminalFocused = true;
        setTimeout(async () => {
          try {
            await loadSessions();
          } catch (e) { console.error('[Sessions] Post-spawn refresh failed:', e); }
        }, 300);
      } else {
        logEvent(`Spawn FAILED: PTY creation returned false for ${cliType}`);
        console.error(`[doSpawn] PTY creation failed — likely node-pty native module issue`);
      }
    } else {
      // Fallback: old external window spawning
      console.warn(`[doSpawn] ⚠️ NO TERMINAL MANAGER — falling back to EXTERNAL spawn`);
      const result = await window.gamepadCli.spawnCli(cliType, workingDir);
      if (result.success) {
        logEvent(`Spawned: PID ${result.pid}`);
        setTimeout(async () => {
          try {
            await window.gamepadCli?.sessionRefresh();
            await loadSessions();
          } catch (e) { console.error('[Sessions] Post-spawn refresh failed:', e); }
        }, 500);
      } else {
        logEvent(`Spawn failed: ${result.error || 'Unknown error'}`);
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
  state.terminalFocused = false;
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

export async function spawnNewSession(cliType?: string): Promise<void> {
  const resolvedType = cliType || state.availableSpawnTypes[0] || 'generic-terminal';

  try {
    if (!window.gamepadCli) {
      logEvent('Spawn failed: gamepadCli not available');
      return;
    }
    const dirs = await window.gamepadCli.configGetWorkingDirs();
    if (dirs && dirs.length > 0 && dirPickerBridge) {
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
      state.sessions.push({
        id,
        name: session?.cliType || 'Terminal',
        cliType: session?.cliType || 'unknown',
        processId: 0,
        windowHandle: '',
      } as Session);
    }
  }

  // Sort sessions by state priority
  state.sessions.sort((a, b) => {
    const stateA = STATE_ORDER[getSessionState(a.id)] ?? 3;
    const stateB = STATE_ORDER[getSessionState(b.id)] ?? 3;
    return stateA - stateB;
  });

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

  // State dot icon (replaces old CLI icon)
  const dot = document.createElement('span');
  const sessionState = getSessionState(session.id);
  dot.className = `tab-state-dot tab-state-dot--${sessionState}`;

  const info = document.createElement('div');
  info.className = 'session-info';

  // Heading: CLI display name + folder
  const name = document.createElement('span');
  name.className = 'session-name';
  const displayName = getCliDisplayName(session.cliType);
  const folder = getSessionCwd(session.id);
  name.textContent = folder ? `${displayName} — ${folder}` : displayName;

  // Meta: state dropdown button
  const stateBtn = document.createElement('button');
  stateBtn.className = 'session-state-btn';
  stateBtn.textContent = getStateLabel(sessionState);
  stateBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showStateDropdown(stateBtn, session.id, sessionState);
  });

  info.appendChild(name);
  info.appendChild(stateBtn);

  // Close button — double-click-to-confirm pattern (matches binding delete)
  const closeBtn = document.createElement('button');
  closeBtn.className = 'session-close';
  closeBtn.textContent = '×';
  closeBtn.title = `Close ${displayName}`;
  let closeConfirmPending = false;
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!closeConfirmPending) {
      closeBtn.textContent = '?';
      closeBtn.title = 'Click again to confirm';
      closeConfirmPending = true;
      setTimeout(() => { if (closeConfirmPending) { closeBtn.textContent = '×'; closeBtn.title = `Close ${displayName}`; closeConfirmPending = false; } }, 3000);
      return;
    }
    closeConfirmPending = false;
    const tm = terminalManagerGetter ? terminalManagerGetter() : null;
    if (tm) tm.destroyTerminal(session.id);
    removeSessionState(session.id);
    loadSessions();
  });

  card.appendChild(dot);
  card.appendChild(info);
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

  if (dir === 'up') {
    if (count === 0) return;
    sessionsState.sessionsFocusIndex = Math.max(0, sessionsState.sessionsFocusIndex - 1);
    updateSessionsFocus();
    return;
  }
  if (dir === 'down') {
    if (count === 0 || sessionsState.sessionsFocusIndex >= count - 1) {
      sessionsState.activeFocus = 'spawn';
      sessionsState.spawnFocusIndex = 0;
      updateAllFocus();
      return;
    }
    sessionsState.sessionsFocusIndex++;
    updateSessionsFocus();
    return;
  }

  switch (button) {
    case 'A': {
      const session = state.sessions[sessionsState.sessionsFocusIndex];
      if (session) switchToSession(session.id);
      return;
    }
    case 'X': {
      const session = state.sessions[sessionsState.sessionsFocusIndex];
      if (session) deleteSession(session.id);
      return;
    }
    case 'Y':
      refreshSessions();
      return;
  }
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

  switch (button) {
    case 'A': {
      const cliType = sessionsState.cliTypes[sessionsState.spawnFocusIndex];
      if (cliType) spawnNewSession(cliType);
      return;
    }
    case 'B':
      sessionsState.activeFocus = 'sessions';
      updateAllFocus();
      return;
    case 'Y':
      refreshSessions();
      return;
  }
}

// ============================================================================
// Focus update helpers
// ============================================================================

function updateSessionsFocus(): void {
  const list = document.getElementById('sessionsList');
  if (!list) return;
  list.querySelectorAll('.session-card').forEach((el, i) => {
    el.classList.toggle('focused', i === sessionsState.sessionsFocusIndex && sessionsState.activeFocus === 'sessions');
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

async function switchToSession(sessionId: string): Promise<void> {
  // Check if this is an embedded terminal
  const tm = terminalManagerGetter ? terminalManagerGetter() : null;
  if (tm && tm.hasTerminal(sessionId)) {
    tm.switchTo(sessionId);
    showTerminalArea();
    state.terminalFocused = true;
    return;
  }

  // Old external window path
  try {
    if (!window.gamepadCli) return;
    await window.gamepadCli.sessionSetActive(sessionId);
    state.activeSessionId = sessionId;
    logEvent(`Switch: ${sessionId}`);

    const session = state.sessions.find(s => s.id === sessionId);
    if (session?.windowHandle) {
      await window.gamepadCli.focusWindow(session.windowHandle);
    }

    await loadSessions();
  } catch (error) {
    console.error('[Sessions] Failed to switch session:', error);
  }
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
  // When terminal is focused, let xterm.js handle all keyboard input
  if (state.terminalFocused) return;

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
