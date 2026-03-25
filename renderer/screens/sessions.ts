/**
 * Sessions screen — 3-panel launcher for session management and spawning.
 *
 * Panels: sessions (top), CLI types (bottom-left), directories (bottom-right),
 * plus a confirmation sub-dialog for spawning. Replaces the old HUD overlay.
 */

import { state } from '../state.js';
import { sessionsState, type SessionPanel } from './sessions-state.js';
import { logEvent, getCliIcon, getCliDisplayName, renderFooterBindings, toDirection } from '../utils.js';

// ============================================================================
// Public API
// ============================================================================

export async function loadSessions(): Promise<void> {
  await loadSessionsData();
  renderAllPanels();
}

export function handleSessionsScreenButton(button: string): boolean {
  routeToPanel(button);
  return true;
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
      setTimeout(async () => {
        try {
          await window.gamepadCli?.sessionRefresh();
          await loadSessions();
        } catch (e) { console.error('[Sessions] Post-spawn refresh failed:', e); }
      }, 500);
    } else {
      logEvent(`Spawn failed: ${result.error || 'Unknown error'}`);
    }
  } catch (error) {
    console.error('[Sessions] Failed to spawn session:', error);
    logEvent('Spawn failed');
  }
}

// ============================================================================
// Panel routing — dispatches button presses to the active panel handler
// ============================================================================

function routeToPanel(button: string): void {
  switch (sessionsState.activePanel) {
    case 'sessions':  handleSessionsPanel(button); break;
    case 'cli':       handleCliPanel(button); break;
    case 'directory':  handleDirPanel(button); break;
    case 'confirm':    handleConfirmPanel(button); break;
  }
}

// ============================================================================
// Sessions panel
// ============================================================================

function handleSessionsPanel(button: string): void {
  const count = state.sessions.length;
  const dir = toDirection(button);

  if (dir) {
    switch (dir) {
      case 'up':
        if (count === 0) return;
        sessionsState.sessionsFocusIndex = wrap(sessionsState.sessionsFocusIndex - 1, count);
        updateFocusInPanel('sessions');
        return;
      case 'down':
        if (count === 0) { setActivePanel('cli'); return; }
        if (sessionsState.sessionsFocusIndex === count - 1) { setActivePanel('cli'); return; }
        sessionsState.sessionsFocusIndex = wrap(sessionsState.sessionsFocusIndex + 1, count);
        updateFocusInPanel('sessions');
        return;
      case 'left':
      case 'right':
        setActivePanel('cli');
        return;
    }
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
      refreshAllPanels().catch(e => console.error('[Sessions] Refresh failed:', e));
      return;
    case 'B':
      // B on sessions panel has no parent to go back to
      return;
  }
}

// ============================================================================
// CLI panel
// ============================================================================

function handleCliPanel(button: string): void {
  const count = sessionsState.cliTypes.length;
  const dir = toDirection(button);

  if (dir) {
    switch (dir) {
      case 'up':
        if (count === 0 || sessionsState.cliFocusIndex === 0) { setActivePanel('sessions'); return; }
        sessionsState.cliFocusIndex = wrap(sessionsState.cliFocusIndex - 1, count);
        updateFocusInPanel('cli');
        return;
      case 'down':
        if (count === 0) return;
        sessionsState.cliFocusIndex = wrap(sessionsState.cliFocusIndex + 1, count);
        updateFocusInPanel('cli');
        return;
      case 'right':
        selectCliType();
        return;
      case 'left':
        setActivePanel('sessions');
        return;
    }
  }

  switch (button) {
    case 'A':
      selectCliType();
      return;
    case 'B':
      setActivePanel('sessions');
      return;
    case 'Y':
      refreshAllPanels().catch(e => console.error('[Sessions] Refresh failed:', e));
      return;
  }
}

function selectCliType(): void {
  const cliType = sessionsState.cliTypes[sessionsState.cliFocusIndex];
  if (!cliType) return;
  sessionsState.selectedCliType = cliType;

  if (sessionsState.directories.length === 0) {
    sessionsState.selectedDirectory = null;
    setActivePanel('confirm');
    renderConfirmDialog();
    return;
  }

  setActivePanel('directory');
}

// ============================================================================
// Directory panel
// ============================================================================

function handleDirPanel(button: string): void {
  const count = sessionsState.directories.length;
  const dir = toDirection(button);

  if (dir) {
    switch (dir) {
      case 'up':
        if (count === 0) return;
        sessionsState.dirFocusIndex = wrap(sessionsState.dirFocusIndex - 1, count);
        updateFocusInPanel('directory');
        return;
      case 'down':
        if (count === 0) return;
        sessionsState.dirFocusIndex = wrap(sessionsState.dirFocusIndex + 1, count);
        updateFocusInPanel('directory');
        return;
      case 'left':
        setActivePanel('cli');
        return;
    }
  }

  switch (button) {
    case 'A':
      selectDirectory();
      return;
    case 'B':
      setActivePanel('cli');
      return;
    case 'Y':
      refreshAllPanels().catch(e => console.error('[Sessions] Refresh failed:', e));
      return;
  }
}

function selectDirectory(): void {
  const dir = sessionsState.directories[sessionsState.dirFocusIndex];
  if (!dir) return;
  sessionsState.selectedDirectory = dir;
  setActivePanel('confirm');
  renderConfirmDialog();
}

// ============================================================================
// Confirm panel
// ============================================================================

function handleConfirmPanel(button: string): void {
  switch (button) {
    case 'A':
      spawnSession();
      return;
    case 'B':
      hideConfirmDialog();
      setActivePanel(sessionsState.directories.length > 0 ? 'directory' : 'cli');
      return;
  }
}

// ============================================================================
// Data loading
// ============================================================================

async function loadSessionsData(): Promise<void> {
  if (!window.gamepadCli) return;

  try {
    state.sessions = await window.gamepadCli.sessionGetAll();
  } catch (e) { console.error('[Sessions] Failed to load sessions:', e); }

  try {
    sessionsState.cliTypes = await window.gamepadCli.configGetCliTypes();
  } catch (e) { console.error('[Sessions] Failed to load CLI types:', e); }

  try {
    sessionsState.directories = (await window.gamepadCli.configGetWorkingDirs()) || [];
  } catch (e) { console.error('[Sessions] Failed to load directories:', e); }

  // Clamp focus indices after data reload
  const activeIdx = state.sessions.findIndex(s => s.id === state.activeSessionId);
  sessionsState.sessionsFocusIndex = activeIdx >= 0 ? activeIdx : 0;
  sessionsState.cliFocusIndex = clamp(sessionsState.cliFocusIndex, 0, Math.max(0, sessionsState.cliTypes.length - 1));
  sessionsState.dirFocusIndex = clamp(sessionsState.dirFocusIndex, 0, Math.max(0, sessionsState.directories.length - 1));
}

// ============================================================================
// Render — all panels
// ============================================================================

function renderAllPanels(): void {
  renderSessions();
  renderCliTypes();
  renderDirectories();
  setActivePanel(sessionsState.activePanel);

  // Update status counts
  const totalEl = document.getElementById('statusTotalSessions');
  const activeEl = document.getElementById('statusActiveSessions');
  if (totalEl) totalEl.textContent = state.sessions.length.toString();
  if (activeEl) activeEl.textContent = state.sessions.some(s => s.id === state.activeSessionId) ? '1' : '0';
}

// ============================================================================
// Render — sessions list
// ============================================================================

function renderSessions(): void {
  const list = document.getElementById('launcherSessionList');
  const empty = document.getElementById('launcherSessionsEmpty');
  if (!list) return;
  list.innerHTML = '';

  if (state.sessions.length === 0) {
    if (empty) empty.style.display = '';
    return;
  }

  if (empty) empty.style.display = 'none';

  state.sessions.forEach((session, index) => {
    const item = createLauncherItem({
      icon: getCliIcon(session.cliType),
      label: session.name || `Session ${index + 1}`,
      badge: `${getCliDisplayName(session.cliType)} · PID ${session.processId}`,
      isActive: session.id === state.activeSessionId,
      isFocused: index === sessionsState.sessionsFocusIndex,
    });
    item.dataset.sessionId = session.id;
    item.addEventListener('click', () => switchToSession(session.id));
    list.appendChild(item);
  });
}

// ============================================================================
// Render — CLI types list
// ============================================================================

function renderCliTypes(): void {
  const list = document.getElementById('launcherCliList');
  const empty = document.getElementById('launcherCliEmpty');
  if (!list) return;
  list.innerHTML = '';

  if (sessionsState.cliTypes.length === 0) {
    if (empty) empty.style.display = '';
    return;
  }

  if (empty) empty.style.display = 'none';

  sessionsState.cliTypes.forEach((cliType, index) => {
    const item = createLauncherItem({
      icon: getCliIcon(cliType),
      label: getCliDisplayName(cliType),
      isFocused: index === sessionsState.cliFocusIndex,
    });
    item.addEventListener('click', () => {
      sessionsState.cliFocusIndex = index;
      sessionsState.selectedCliType = cliType;
      setActivePanel('cli');
      updateFocusInPanel('cli');
      selectCliType();
    });
    list.appendChild(item);
  });
}

// ============================================================================
// Render — directories list
// ============================================================================

function renderDirectories(): void {
  const list = document.getElementById('launcherDirList');
  const empty = document.getElementById('launcherDirEmpty');
  if (!list) return;
  list.innerHTML = '';

  if (sessionsState.directories.length === 0) {
    if (empty) empty.style.display = '';
    return;
  }

  if (empty) empty.style.display = 'none';

  sessionsState.directories.forEach((dir, index) => {
    const item = createLauncherItem({
      icon: '📁',
      label: dir.name,
      isFocused: index === sessionsState.dirFocusIndex,
    });
    item.addEventListener('click', () => {
      sessionsState.dirFocusIndex = index;
      sessionsState.selectedDirectory = dir;
      setActivePanel('directory');
      updateFocusInPanel('directory');
      selectDirectory();
    });
    list.appendChild(item);
  });
}

// ============================================================================
// Render — confirm dialog
// ============================================================================

function renderConfirmDialog(): void {
  const el = document.getElementById('launcherConfirm');
  const textEl = document.getElementById('launcherConfirmText');
  if (!el || !textEl) return;

  const cliName = getCliDisplayName(sessionsState.selectedCliType || '');
  const dirName = sessionsState.selectedDirectory?.name || 'default directory';
  textEl.textContent = `Launch ${cliName} in ${dirName}?`;
  el.style.display = '';
}

function hideConfirmDialog(): void {
  const el = document.getElementById('launcherConfirm');
  if (el) el.style.display = 'none';
}

// ============================================================================
// Focus management
// ============================================================================

function setActivePanel(panel: SessionPanel): void {
  sessionsState.activePanel = panel;

  const sections = ['launcherSectionSessions', 'launcherSectionCli', 'launcherSectionDir'];
  sections.forEach(id => {
    document.getElementById(id)?.classList.remove('launcher-section--active');
  });

  const panelToSection: Record<string, string> = {
    sessions: 'launcherSectionSessions',
    cli: 'launcherSectionCli',
    directory: 'launcherSectionDir',
  };
  const sectionId = panelToSection[panel];
  if (sectionId) document.getElementById(sectionId)?.classList.add('launcher-section--active');

  updateFocusInPanel(panel);
}

function updateFocusInPanel(panel: string): void {
  const config = getPanelConfig(panel);
  if (!config) return;

  const list = document.getElementById(config.listId);
  if (!list) return;

  const items = list.querySelectorAll('.launcher-item');
  items.forEach(el => el.classList.remove('launcher-focused'));

  const focused = items[config.getIndex()];
  if (focused) {
    focused.classList.add('launcher-focused');
    focused.scrollIntoView({ block: 'nearest' });
  }
}

function getPanelConfig(panel: string) {
  switch (panel) {
    case 'sessions':  return { listId: 'launcherSessionList', getIndex: () => sessionsState.sessionsFocusIndex };
    case 'cli':       return { listId: 'launcherCliList',     getIndex: () => sessionsState.cliFocusIndex };
    case 'directory':  return { listId: 'launcherDirList',     getIndex: () => sessionsState.dirFocusIndex };
    default: return null;
  }
}

// ============================================================================
// Actions
// ============================================================================

async function switchToSession(sessionId: string): Promise<void> {
  try {
    if (!window.gamepadCli) return;
    await window.gamepadCli.sessionSetActive(sessionId);
    state.activeSessionId = sessionId;
    logEvent(`Switch: ${sessionId}`);

    // Focus the external CLI window
    const session = state.sessions.find(s => s.id === sessionId);
    if (session?.windowHandle) {
      await window.gamepadCli.focusWindow(session.windowHandle);
    }

    await loadSessions();
    renderFooterBindings();
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
      updateFocusInPanel('sessions');
    } else {
      logEvent(`Delete failed: ${result.error}`);
    }
  } catch (error) {
    console.error('[Sessions] Failed to delete session:', error);
  }
}

async function spawnSession(): Promise<void> {
  if (!sessionsState.selectedCliType || !window.gamepadCli) return;

  try {
    const result = await window.gamepadCli.spawnCli(
      sessionsState.selectedCliType,
      sessionsState.selectedDirectory?.path,
    );
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
  } catch (error) {
    console.error('[Sessions] Spawn failed:', error);
    logEvent('Spawn failed');
  }

  // Reset to sessions panel after spawn
  hideConfirmDialog();
  sessionsState.selectedCliType = null;
  sessionsState.selectedDirectory = null;
  setActivePanel('sessions');
}

async function refreshAllPanels(): Promise<void> {
  await loadSessions();
  logEvent('Sessions refreshed');
}

// ============================================================================
// DOM helpers
// ============================================================================

interface LauncherItemOptions {
  icon: string;
  label: string;
  badge?: string;
  isActive?: boolean;
  isFocused?: boolean;
}

function createLauncherItem(opts: LauncherItemOptions): HTMLElement {
  const item = document.createElement('div');
  item.className = 'launcher-item';
  item.setAttribute('role', 'option');

  if (opts.isActive) item.classList.add('launcher-active');
  if (opts.isFocused) item.classList.add('launcher-focused');

  const icon = document.createElement('span');
  icon.textContent = opts.icon;
  item.appendChild(icon);

  const label = document.createElement('span');
  label.textContent = opts.label;
  item.appendChild(label);

  if (opts.badge) {
    const badge = document.createElement('span');
    badge.className = 'launcher-item-badge';
    badge.textContent = opts.badge;
    item.appendChild(badge);
  }

  return item;
}

// ============================================================================
// Keyboard fallback — arrow keys, Enter, Escape, Delete, F5
// ============================================================================

function onKeyDown(e: KeyboardEvent): void {
  // Only handle when sessions screen is active
  if (state.currentScreen !== 'sessions') return;

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

// Set up keyboard listener once (always active, guarded by currentScreen check)
document.addEventListener('keydown', onKeyDown, true);

// ============================================================================
// Session highlight update (called by main.ts for foreground sync)
// ============================================================================

export function updateSessionHighlight(): void {
  renderSessions();
  updateFocusInPanel('sessions');
}

// ============================================================================
// Bridge for spawning via dir-picker (set by main.ts to avoid circular imports)
// ============================================================================

let dirPickerBridge: ((cliType: string, dirs: Array<{ name: string; path: string }>) => void) | null = null;

export function setDirPickerBridge(fn: (cliType: string, dirs: Array<{ name: string; path: string }>) => void): void {
  dirPickerBridge = fn;
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
// Utilities
// ============================================================================

function wrap(index: number, length: number): number {
  return ((index % length) + length) % length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
