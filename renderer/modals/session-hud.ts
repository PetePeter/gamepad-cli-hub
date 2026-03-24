/**
 * Session Launcher HUD — unified session switching + spawning overlay.
 *
 * Three-panel layout: existing sessions (top), CLI types (bottom-left),
 * directories (bottom-right), plus a confirmation sub-dialog for spawning.
 * Sandwich button toggles; all gamepad input is intercepted while visible.
 */

import { state } from '../state.js';
import { hudState, type HudPanel } from './hud-state.js';
import { logEvent, getCliIcon, getCliDisplayName, renderFooterBindings } from '../utils.js';
import { loadSessions } from '../screens/sessions.js';

// ============================================================================
// Public API
// ============================================================================

export function toggleHud(): void {
  hudState.visible ? closeHud() : openHud();
}

export function isHudVisible(): boolean {
  return hudState.visible;
}

export function handleHudButton(button: string): void {
  // Sandwich always closes regardless of panel
  if (button === 'Sandwich') { closeHud(); return; }

  routeToPanel(button);
}

// ============================================================================
// Open / Close
// ============================================================================

async function openHud(): Promise<void> {
  const overlay = document.getElementById('sessionHudOverlay');
  if (!overlay) return;

  hudState.visible = true;
  hudState.activePanel = 'sessions';
  hudState.selectedCliType = null;
  hudState.selectedDirectory = null;
  resetFocusIndices();

  overlay.classList.add('modal--visible');
  overlay.setAttribute('aria-hidden', 'false');
  hideConfirmDialog();
  setupKeyboardListener();

  await renderAllPanels();
}

function closeHud(): void {
  const overlay = document.getElementById('sessionHudOverlay');
  if (!overlay) return;

  hudState.visible = false;
  overlay.classList.remove('modal--visible');
  overlay.setAttribute('aria-hidden', 'true');
  teardownKeyboardListener();
}

function resetFocusIndices(): void {
  hudState.sessionsFocusIndex = 0;
  hudState.cliFocusIndex = 0;
  hudState.dirFocusIndex = 0;
}

// ============================================================================
// Panel routing — dispatches button presses to the active panel handler
// ============================================================================

function routeToPanel(button: string): void {
  switch (hudState.activePanel) {
    case 'sessions': handleSessionsPanel(button); break;
    case 'cli':      handleCliPanel(button); break;
    case 'directory': handleDirPanel(button); break;
    case 'confirm':   handleConfirmPanel(button); break;
  }
}

// ============================================================================
// Sessions panel
// ============================================================================

function handleSessionsPanel(button: string): void {
  const count = state.sessions.length;

  switch (button) {
    case 'Up':
      if (count === 0) return;
      hudState.sessionsFocusIndex = wrap(hudState.sessionsFocusIndex - 1, count);
      updateFocusInPanel('sessions');
      return;
    case 'Down':
      if (count === 0) { setActivePanel('cli'); return; }
      if (hudState.sessionsFocusIndex === count - 1) { setActivePanel('cli'); return; }
      hudState.sessionsFocusIndex = wrap(hudState.sessionsFocusIndex + 1, count);
      updateFocusInPanel('sessions');
      return;
    case 'Left':
    case 'Right':
      setActivePanel('cli');
      return;
    case 'A': {
      const session = state.sessions[hudState.sessionsFocusIndex];
      if (session) switchToSession(session.id);
      return;
    }
    case 'X': {
      const session = state.sessions[hudState.sessionsFocusIndex];
      if (session) deleteSession(session.id);
      return;
    }
    case 'Y':
      refreshAllPanels();
      return;
    case 'B':
      closeHud();
      return;
  }
}

// ============================================================================
// CLI panel
// ============================================================================

function handleCliPanel(button: string): void {
  const count = hudState.cliTypes.length;

  switch (button) {
    case 'Up':
      if (count === 0 || hudState.cliFocusIndex === 0) { setActivePanel('sessions'); return; }
      hudState.cliFocusIndex = wrap(hudState.cliFocusIndex - 1, count);
      updateFocusInPanel('cli');
      return;
    case 'Down':
      if (count === 0) return;
      hudState.cliFocusIndex = wrap(hudState.cliFocusIndex + 1, count);
      updateFocusInPanel('cli');
      return;
    case 'A':
    case 'Right':
      selectCliType();
      return;
    case 'Left':
      setActivePanel('sessions');
      return;
    case 'B':
      setActivePanel('sessions');
      return;
    case 'Y':
      refreshAllPanels();
      return;
  }
}

function selectCliType(): void {
  const cliType = hudState.cliTypes[hudState.cliFocusIndex];
  if (!cliType) return;
  hudState.selectedCliType = cliType;

  // If no directories configured, go straight to confirm
  if (hudState.directories.length === 0) {
    hudState.selectedDirectory = null;
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
  const count = hudState.directories.length;

  switch (button) {
    case 'Up':
      if (count === 0) return;
      hudState.dirFocusIndex = wrap(hudState.dirFocusIndex - 1, count);
      updateFocusInPanel('directory');
      return;
    case 'Down':
      if (count === 0) return;
      hudState.dirFocusIndex = wrap(hudState.dirFocusIndex + 1, count);
      updateFocusInPanel('directory');
      return;
    case 'A':
      selectDirectory();
      return;
    case 'Left':
    case 'B':
      setActivePanel('cli');
      return;
    case 'Y':
      refreshAllPanels();
      return;
  }
}

function selectDirectory(): void {
  const dir = hudState.directories[hudState.dirFocusIndex];
  if (!dir) return;
  hudState.selectedDirectory = dir;
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
      // Go back to directory if dirs exist, otherwise cli
      setActivePanel(hudState.directories.length > 0 ? 'directory' : 'cli');
      return;
  }
}

// ============================================================================
// Render — all panels
// ============================================================================

async function renderAllPanels(): Promise<void> {
  await loadHudData();
  renderHudSessions();
  renderHudCliTypes();
  renderHudDirectories();
  setActivePanel(hudState.activePanel);
}

async function loadHudData(): Promise<void> {
  if (!window.gamepadCli) return;

  try {
    state.sessions = await window.gamepadCli.sessionGetAll();
  } catch (e) { console.error('[HUD] Failed to load sessions:', e); }

  try {
    hudState.cliTypes = await window.gamepadCli.configGetCliTypes();
  } catch (e) { console.error('[HUD] Failed to load CLI types:', e); }

  try {
    hudState.directories = (await window.gamepadCli.configGetWorkingDirs()) || [];
  } catch (e) { console.error('[HUD] Failed to load directories:', e); }

  // Clamp all focus indices to valid range after data reload
  const activeIdx = state.sessions.findIndex(s => s.id === state.activeSessionId);
  hudState.sessionsFocusIndex = activeIdx >= 0 ? activeIdx : 0;
  hudState.cliFocusIndex = clamp(hudState.cliFocusIndex, 0, Math.max(0, hudState.cliTypes.length - 1));
  hudState.dirFocusIndex = clamp(hudState.dirFocusIndex, 0, Math.max(0, hudState.directories.length - 1));
}

// ============================================================================
// Render — sessions list
// ============================================================================

function renderHudSessions(): void {
  const list = document.getElementById('hudSessionList');
  if (!list) return;
  list.innerHTML = '';

  if (state.sessions.length === 0) {
    appendEmptyMessage(list, 'No active sessions');
    return;
  }

  state.sessions.forEach((session, index) => {
    const item = createHudItem({
      icon: getCliIcon(session.cliType),
      label: session.name || `Session ${index + 1}`,
      badge: `${getCliDisplayName(session.cliType)} · PID ${session.processId}`,
      isActive: session.id === state.activeSessionId,
      isFocused: index === hudState.sessionsFocusIndex,
    });
    item.dataset.sessionId = session.id;
    item.addEventListener('click', () => switchToSession(session.id));
    list.appendChild(item);
  });
}

// ============================================================================
// Render — CLI types list
// ============================================================================

function renderHudCliTypes(): void {
  const list = document.getElementById('hudCliList');
  if (!list) return;
  list.innerHTML = '';

  if (hudState.cliTypes.length === 0) {
    appendEmptyMessage(list, 'No CLI types');
    return;
  }

  hudState.cliTypes.forEach((cliType, index) => {
    const item = createHudItem({
      icon: getCliIcon(cliType),
      label: getCliDisplayName(cliType),
      isFocused: index === hudState.cliFocusIndex,
    });
    item.addEventListener('click', () => {
      hudState.cliFocusIndex = index;
      hudState.selectedCliType = cliType;
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

function renderHudDirectories(): void {
  const list = document.getElementById('hudDirList');
  if (!list) return;
  list.innerHTML = '';

  if (hudState.directories.length === 0) {
    appendEmptyMessage(list, 'No directories configured');
    return;
  }

  hudState.directories.forEach((dir, index) => {
    const item = createHudItem({
      icon: '📁',
      label: dir.name,
      isFocused: index === hudState.dirFocusIndex,
    });
    item.addEventListener('click', () => {
      hudState.dirFocusIndex = index;
      hudState.selectedDirectory = dir;
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
  const el = document.getElementById('hudConfirm');
  const textEl = document.getElementById('hudConfirmText');
  if (!el || !textEl) return;

  const cliName = getCliDisplayName(hudState.selectedCliType || '');
  const dirName = hudState.selectedDirectory?.name || 'default directory';
  textEl.textContent = `Launch ${cliName} in ${dirName}?`;
  el.style.display = '';
}

function hideConfirmDialog(): void {
  const el = document.getElementById('hudConfirm');
  if (el) el.style.display = 'none';
}

// ============================================================================
// Focus management
// ============================================================================

function setActivePanel(panel: HudPanel): void {
  hudState.activePanel = panel;

  // Update section highlight CSS
  const sections = ['hudSectionSessions', 'hudSectionCli', 'hudSectionDir'];
  sections.forEach(id => {
    document.getElementById(id)?.classList.remove('hud-section--active');
  });

  const panelToSection: Record<string, string> = {
    sessions: 'hudSectionSessions',
    cli: 'hudSectionCli',
    directory: 'hudSectionDir',
  };
  const sectionId = panelToSection[panel];
  if (sectionId) document.getElementById(sectionId)?.classList.add('hud-section--active');

  updateFocusInPanel(panel);
}

function updateFocusInPanel(panel: string): void {
  const config = getPanelConfig(panel);
  if (!config) return;

  const list = document.getElementById(config.listId);
  if (!list) return;

  const items = list.querySelectorAll('.hud-item');
  items.forEach(el => el.classList.remove('hud-focused'));

  const focused = items[config.getIndex()];
  if (focused) {
    focused.classList.add('hud-focused');
    focused.scrollIntoView({ block: 'nearest' });
  }
}

/** Maps panel name → list element ID and current focus index getter */
function getPanelConfig(panel: string) {
  switch (panel) {
    case 'sessions':  return { listId: 'hudSessionList', getIndex: () => hudState.sessionsFocusIndex };
    case 'cli':       return { listId: 'hudCliList',     getIndex: () => hudState.cliFocusIndex };
    case 'directory':  return { listId: 'hudDirList',     getIndex: () => hudState.dirFocusIndex };
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
    logEvent(`HUD switch: ${sessionId}`);
    await loadSessions();
    renderFooterBindings();
  } catch (error) {
    console.error('[HUD] Failed to switch session:', error);
  }
  closeHud();
}

async function deleteSession(sessionId: string): Promise<void> {
  try {
    if (!window.gamepadCli) return;
    const result = await window.gamepadCli.sessionClose(sessionId);
    if (result.success) {
      logEvent(`HUD deleted: ${sessionId}`);
      // Refresh after delete
      state.sessions = await window.gamepadCli.sessionGetAll();
      hudState.sessionsFocusIndex = clamp(hudState.sessionsFocusIndex, 0, Math.max(0, state.sessions.length - 1));
      renderHudSessions();
      updateFocusInPanel('sessions');
    } else {
      logEvent(`Delete failed: ${result.error}`);
    }
  } catch (error) {
    console.error('[HUD] Failed to delete session:', error);
  }
}

async function spawnSession(): Promise<void> {
  if (!hudState.selectedCliType || !window.gamepadCli) return;

  try {
    const result = await window.gamepadCli.spawnCli(
      hudState.selectedCliType,
      hudState.selectedDirectory?.path,
    );
    if (result.success) {
      logEvent(`Spawned: PID ${result.pid}`);
      // Refresh sessions after a short delay for window registration
      setTimeout(async () => {
        try {
          await window.gamepadCli?.sessionRefresh();
          await loadSessions();
        } catch (e) { console.error('[HUD] Post-spawn refresh failed:', e); }
      }, 500);
    } else {
      logEvent(`Spawn failed: ${result.error || 'Unknown error'}`);
    }
  } catch (error) {
    console.error('[HUD] Spawn failed:', error);
    logEvent('Spawn failed');
  }
  closeHud();
}

async function refreshAllPanels(): Promise<void> {
  await renderAllPanels();
  logEvent('HUD refreshed');
}

// ============================================================================
// DOM helpers
// ============================================================================

interface HudItemOptions {
  icon: string;
  label: string;
  badge?: string;
  isActive?: boolean;
  isFocused?: boolean;
}

function createHudItem(opts: HudItemOptions): HTMLElement {
  const item = document.createElement('div');
  item.className = 'hud-item';
  item.setAttribute('role', 'option');

  if (opts.isActive) item.classList.add('hud-active');
  if (opts.isFocused) item.classList.add('hud-focused');

  const icon = document.createElement('span');
  icon.textContent = opts.icon;
  item.appendChild(icon);

  const label = document.createElement('span');
  label.textContent = opts.label;
  item.appendChild(label);

  if (opts.badge) {
    const badge = document.createElement('span');
    badge.className = 'hud-item-badge';
    badge.textContent = opts.badge;
    item.appendChild(badge);
  }

  return item;
}

function appendEmptyMessage(container: HTMLElement, message: string): void {
  const el = document.createElement('div');
  el.className = 'hud-empty';
  el.textContent = message;
  container.appendChild(el);
}

// ============================================================================
// Keyboard fallback — allows mouse/keyboard users to navigate the HUD
// ============================================================================

function onKeyDown(e: KeyboardEvent): void {
  if (!hudState.visible) return;

  const keyMap: Record<string, string> = {
    ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
    Enter: 'A', Escape: 'B', Delete: 'X', F5: 'Y',
  };

  const mapped = keyMap[e.key];
  if (mapped) {
    e.preventDefault();
    e.stopPropagation();
    handleHudButton(mapped);
  }
}

function setupKeyboardListener(): void {
  document.addEventListener('keydown', onKeyDown, true);
}

function teardownKeyboardListener(): void {
  document.removeEventListener('keydown', onKeyDown, true);
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
