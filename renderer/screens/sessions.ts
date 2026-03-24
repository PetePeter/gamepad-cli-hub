/**
 * Sessions screen — list, focus, spawn, and navigate CLI sessions.
 */

import { state } from '../state.js';
import { logEvent, renderFooterBindings, showScreen, getCliIcon, getCliDisplayName } from '../utils.js';

// ============================================================================
// Load & Render
// ============================================================================

export async function loadSessions(): Promise<void> {
  try {
    if (!window.gamepadCli) {
      console.warn('[Renderer] gamepadCli not available — cannot load sessions');
      return;
    }
    const sessions = await window.gamepadCli.sessionGetAll();
    state.sessions = sessions;
    renderSessions();
  } catch (error) {
    console.error('Failed to load sessions:', error);
  }
}

function renderSessions(): void {
  const sessionList = document.getElementById('sessionList');
  const emptyState = document.getElementById('emptyState');

  if (!sessionList) return;

  // Clear existing items (except empty state)
  sessionList.querySelectorAll('.session-item').forEach(el => el.remove());

  if (state.sessions.length === 0) {
    emptyState?.classList.remove('hidden');
    return;
  }

  emptyState?.classList.add('hidden');

  // Get active session
  window.gamepadCli.sessionGetActive().then(active => {
    if (active) {
      state.activeSessionId = active.id;
    }
  });

  // Render sessions
  state.sessions.forEach(session => {
    const item = createSessionItem(session);
    sessionList.appendChild(item);
  });

  // Update status counts
  document.getElementById('statusTotalSessions')!.textContent = state.sessions.length.toString();
  document.getElementById('statusActiveSessions')!.textContent =
    state.sessions.some(s => s.id === state.activeSessionId) ? '1' : '0';
}

export function updateSessionHighlight(): void {
  // Update active session highlight without full re-render
  document.querySelectorAll('.session-item').forEach(el => {
    const sessionId = (el as HTMLElement).dataset.sessionId;
    if (sessionId === state.activeSessionId) {
      el.classList.add('session-item--active');
    } else {
      el.classList.remove('session-item--active');
    }
  });

  // Update status counts
  const statusActive = document.getElementById('statusActiveSessions');
  if (statusActive) {
    statusActive.textContent = state.activeSessionId ? '1' : '0';
  }
}

function createSessionItem(session: { id: string; name: string; cliType: string; processId: number }): HTMLElement {
  const div = document.createElement('div');
  div.className = 'session-item focusable';
  div.tabIndex = 0;
  div.setAttribute('role', 'option');
  div.dataset.sessionId = session.id;

  if (session.id === state.activeSessionId) {
    div.classList.add('session-item--active');
  }

  // Get icon based on CLI type
  const icon = getCliIcon(session.cliType);

  div.innerHTML = `
    <div class="session-icon">${icon}</div>
    <div class="session-info">
      <span class="session-name">${session.name}</span>
      <span class="session-type">${session.cliType}</span>
    </div>
    <span class="session-pid">PID:${session.processId}</span>
  `;

  // Click handler
  div.addEventListener('click', () => focusSession(session.id));

  return div;
}

// ============================================================================
// Focus & Spawn
// ============================================================================

export async function focusSession(sessionId: string): Promise<void> {
  try {
    await window.gamepadCli.sessionSetActive(sessionId);
    state.activeSessionId = sessionId;
    await loadSessions();
    renderFooterBindings();
    logEvent(`Focused: ${sessionId}`);
  } catch (error) {
    console.error('Failed to focus session:', error);
  }
}

export async function spawnNewSession(cliType?: string): Promise<void> {
  const resolvedType = cliType || state.availableSpawnTypes[0] || 'generic-terminal';

  try {
    if (!window.gamepadCli) {
      logEvent('Spawn failed: gamepadCli not available');
      return;
    }
    const dirs = await window.gamepadCli.configGetWorkingDirs();
    if (dirs && dirs.length > 0) {
      // Import dynamically avoided — use showDirPicker from dir-picker module
      // We call window-level helper set up during init
      showDirPickerForSpawn(resolvedType, dirs);
      return;
    }
    // No presets configured — spawn without cwd
    await doSpawn(resolvedType);
  } catch (error) {
    console.error('Spawn error:', error);
    logEvent(`Spawn error: ${error}`);
  }
}

export async function doSpawn(cliType: string, workingDir?: string): Promise<void> {
  try {
    logEvent(`Spawning ${cliType}${workingDir ? ` in ${workingDir}` : ''}...`);
    if (!window.gamepadCli) {
      logEvent('Spawn failed: gamepadCli not available');
      return;
    }
    const result = await window.gamepadCli.spawnCli(cliType, workingDir);
    if (result.success) {
      logEvent(`Spawned: PID ${result.pid}`);

      // Refresh sessions to pick up the new window
      setTimeout(async () => {
        try {
          const refreshResult = await window.gamepadCli?.sessionRefresh();
          if (refreshResult?.success) {
            await loadSessions();
          }
        } catch (error) {
          console.error('Failed to refresh after spawn:', error);
        }
      }, 500);
    } else {
      logEvent(`Spawn failed: ${result.error || 'Unknown error'}`);
    }
  } catch (error) {
    console.error('Failed to spawn session:', error);
    logEvent('Spawn failed');
  }
}

// ============================================================================
// Spawn Buttons
// ============================================================================

export function renderSpawnButtons(): void {
  const container = document.getElementById('spawnButtons');
  if (!container) return;

  container.innerHTML = '';

  const types = state.availableSpawnTypes.length > 0
    ? state.availableSpawnTypes
    : ['generic-terminal'];

  types.forEach(cliType => {
    const btn = document.createElement('button');
    btn.className = 'btn btn--primary btn--sm focusable';
    btn.tabIndex = 0;
    btn.textContent = `${getCliIcon(cliType)} ${getCliDisplayName(cliType)}`;
    btn.addEventListener('click', () => spawnNewSession(cliType));
    container.appendChild(btn);
  });
}

// ============================================================================
// Gamepad Button Handler
// ============================================================================

export function handleSessionsScreenButton(button: string): boolean {
  switch (button) {
    case 'A':
      activateFocusedItem();
      return true;
    case 'X':
      showScreen('settings');
      return true;
    case 'Y':
      showScreen('status');
      return true;
    default:
      return false;
  }
}

/** Navigate only between session items and auto-focus the selected session's window */
function navigateSessionItems(direction: number): void {
  const items = Array.from(document.querySelectorAll<HTMLElement>('.session-item'));
  if (items.length === 0) return;

  const currentIndex = items.findIndex(el => el === document.activeElement);
  let nextIndex = currentIndex + direction;

  if (nextIndex < 0) nextIndex = items.length - 1;
  if (nextIndex >= items.length) nextIndex = 0;

  items[nextIndex].focus();

  const sessionId = items[nextIndex].dataset?.sessionId;
  if (sessionId) {
    focusSession(sessionId);
  }
}

function activateFocusedItem(): void {
  const active = document.activeElement as HTMLElement;
  if (active && active.classList.contains('session-item')) {
    active.click();
  }
}

// ============================================================================
// Dir-picker bridge (set by main.ts during init to avoid circular imports)
// ============================================================================

let dirPickerBridge: ((cliType: string, dirs: Array<{ name: string; path: string }>) => void) | null = null;

export function setDirPickerBridge(fn: (cliType: string, dirs: Array<{ name: string; path: string }>) => void): void {
  dirPickerBridge = fn;
}

function showDirPickerForSpawn(cliType: string, dirs: Array<{ name: string; path: string }>): void {
  if (dirPickerBridge) {
    dirPickerBridge(cliType, dirs);
  }
}
