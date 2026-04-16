/**
 * Sessions screen — spawn flow, PTY creation, and terminal area management.
 *
 * Extracted from sessions.ts. Depends on sessions.ts for orchestrator state and focus helpers.
 */

import { state } from '../state.js';
import { sessionsState } from './sessions-state.js';
import { logEvent, getCliIcon, getCliDisplayName } from '../utils.js';
import type { TerminalManager } from '../terminal/terminal-manager.js';
import { findNavIndexBySessionId } from '../session-groups.js';

// Circular import — safe: all usages are inside function bodies, not at module-evaluation time.
import {
  loadSessions, getSessionState, updateSessionsFocus, updateSpawnFocus, updateAllFocus,
} from './sessions.js';

import { hideOverview } from './group-overview.js';

// ============================================================================
// Bridge state (set by main.ts to avoid circular imports)
// ============================================================================

let dirPickerBridge: ((cliType: string, dirs: Array<{ name: string; path: string }>, preselectedPath?: string) => void) | null = null;

export function setDirPickerBridge(fn: (cliType: string, dirs: Array<{ name: string; path: string }>, preselectedPath?: string) => void): void {
  dirPickerBridge = fn;
}

let terminalManagerGetter: (() => TerminalManager | null) | null = null;

export function setTerminalManagerGetter(fn: () => TerminalManager | null): void {
  terminalManagerGetter = fn;
}

let pendingContextText: string | null = null;

export function setPendingContextText(text: string | null): void {
  pendingContextText = text;
}

/** Track last session switch time to debounce false activity from focus-induced PTY responses */
export let lastSwitchTime = 0;

// ============================================================================
// Helpers
// ============================================================================

/** Get the terminal manager instance (if available). */
export function getTerminalManager(): TerminalManager | null {
  return terminalManagerGetter ? terminalManagerGetter() : null;
}

export function getSessionCwd(sessionId: string): string {
  const tm = getTerminalManager();
  if (!tm) return '';
  const session = tm.getSession(sessionId);
  return session?.cwd || '';
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ============================================================================
// Spawn flow
// ============================================================================

export async function doSpawn(cliType: string, workingDir?: string, contextText?: string, resumeSessionName?: string): Promise<void> {
  // Resume spawns never use context text (it was one-time context for the original spawn)
  const resolvedContextText = resumeSessionName
    ? undefined
    : (contextText ?? pendingContextText ?? undefined);
  if (!resumeSessionName) pendingContextText = null;

  try {
    logEvent(`Spawning ${cliType}${workingDir ? ` in ${workingDir}` : ''}...`);
    if (!window.gamepadCli) {
      logEvent('Spawn failed: gamepadCli not available');
      return;
    }

    const tm = getTerminalManager();
    if (tm) {
      // Embedded terminal path — use PTY
      const spawnInfo = await window.gamepadCli.configGetSpawnCommand(cliType);
      if (!spawnInfo) {
        logEvent(`Spawn failed: no command configured for ${cliType}`);
        return;
      }

      const sessionId = `pty-${cliType}-${Date.now()}`;
      const success = await tm.createTerminal(
        sessionId,
        cliType,
        spawnInfo.command,
        spawnInfo.args || [],
        workingDir,
        resolvedContextText,
        resumeSessionName,
      );

      if (success) {
        logEvent(`Spawned embedded terminal: ${cliType}`);
        showTerminalArea();
        // Auto-select the new session
        tm.switchTo(sessionId);
        state.activeSessionId = sessionId;

        setTimeout(async () => {
          try {
            await loadSessions();
            // Focus the newly spawned session in the navList
            const newIndex = findNavIndexBySessionId(sessionsState.navList, sessionId);
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

// ============================================================================
// Terminal area visibility
// ============================================================================

export function showTerminalArea(): void {
  // Dismiss overview if it's showing — terminal takes priority
  hideOverview();

  const termContainer = document.getElementById('terminalContainer');
  if (termContainer) termContainer.style.display = '';
  const tm = getTerminalManager();
  if (tm) {
    requestAnimationFrame(() => {
      tm.focusActive();
      tm.fitActive();
    });
  }
}

export function hideTerminalArea(): void {
  const termContainer = document.getElementById('terminalContainer');
  if (termContainer) termContainer.style.display = 'none';
}

export async function spawnNewSession(cliType?: string, preselectedPath?: string): Promise<void> {
  const resolvedType = cliType || state.availableSpawnTypes[0] || 'generic-terminal';

  try {
    if (!window.gamepadCli) {
      logEvent('Spawn failed: gamepadCli not available');
      return;
    }
    const dirs = await window.gamepadCli.configGetWorkingDirs();
    if (dirs && dirs.length > 0 && dirPickerBridge) {
      // pendingContextText survives through dirPicker — doSpawn consumes it
      dirPickerBridge(resolvedType, dirs, preselectedPath);
      return;
    }
    await doSpawn(resolvedType);
  } catch (error) {
    console.error('Spawn error:', error);
    logEvent(`Spawn error: ${error}`);
  }
}

// ============================================================================
// Terminal session switching
// ============================================================================

export async function switchToSession(sessionId: string): Promise<void> {
  // Track switch time to debounce false activity from focus-induced PTY responses
  lastSwitchTime = Date.now();

  // Check if this is an embedded terminal
  const tm = getTerminalManager();
  if (tm && tm.hasTerminal(sessionId)) {
    tm.switchTo(sessionId);
    showTerminalArea();
    return;
  }

  // Non-embedded session — shouldn't happen
  logEvent(`Session ${sessionId} is not an embedded terminal`);
}

/** Auto-switch terminal based on what the D-pad just focused. */
export function autoSelectFocusedSession(): void {
  const navItem = sessionsState.navList[sessionsState.sessionsFocusIndex];
  if (!navItem) return;

  // Group headers are pass-through — D-pad skips over them, Right opens overview
  if (navItem.type === 'group-header') return;

  // Session card — switch terminal (showTerminalArea dismisses overview if open)
  const session = state.sessions.find(s => s.id === navItem.id);
  if (!session) return;
  const tm = getTerminalManager();
  if (tm && tm.hasTerminal(session.id)) {
    tm.switchTo(session.id);
    state.activeSessionId = session.id;
    showTerminalArea();
  }
}

// ============================================================================
// Render — spawn grid
// ============================================================================

export function renderSpawnGrid(): void {
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
// Gamepad navigation — sessions zone + spawn zone
// ============================================================================

export function handleSessionsZone(button: string, dir: string | null): void {
  const navList = sessionsState.navList;
  const count = navList.length;

  if (dir === 'right') {
    if (count === 0) return;
    const currentItem = navList[sessionsState.sessionsFocusIndex];
    // Right at col=0 on group header → open overview (drill in)
    if (currentItem?.type === 'group-header' && sessionsState.cardColumn === 0) {
      import('./group-overview.js').then(({ showOverview }) => {
        showOverview(currentItem.id, state.activeSessionId ?? undefined);
      });
      return;
    }
    const maxCol = currentItem?.type === 'group-header' ? 3 : 3;
    if (sessionsState.cardColumn < maxCol) {
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

export function handleSpawnZone(button: string, dir: string | null): void {
  const count = sessionsState.cliTypes.length;
  const cols = 2;

  if (dir === 'up') {
    const newIndex = sessionsState.spawnFocusIndex - cols;
    if (newIndex < 0) {
      sessionsState.activeFocus = 'sessions';
      sessionsState.sessionsFocusIndex = Math.max(0, sessionsState.navList.length - 1);
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

export function handleSpawnZoneButton(button: string): boolean {
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
