/**
 * Sessions screen — vertical session list + quick spawn grid.
 *
 * Two navigation zones: session cards (top) and spawn buttons (bottom).
 * Replaces the old 3-panel launcher layout.
 */

import { state } from '../state.js';
import { sessionsState, type SessionsFocus } from './sessions-state.js';
import { logEvent, getCliIcon, getCliDisplayName, toDirection } from '../utils.js';

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
  } else if (sessionsState.activeFocus === 'spawn') {
    handleSpawnZone(button, dir);
  } else {
    handleWizardZone(button, dir);
  }
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

export function updateSessionHighlight(): void {
  renderSessions();
  updateSessionsFocus();
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

  const icon = document.createElement('span');
  icon.className = 'session-icon';
  icon.textContent = getCliIcon(session.cliType);

  const info = document.createElement('div');
  info.className = 'session-info';

  const name = document.createElement('span');
  name.className = 'session-name';
  name.textContent = session.name || `Session ${index + 1}`;

  const meta = document.createElement('span');
  meta.className = 'session-meta';
  meta.textContent = `${getCliDisplayName(session.cliType)} · PID ${session.processId}`;

  info.appendChild(name);
  info.appendChild(meta);

  card.appendChild(icon);
  card.appendChild(info);

  card.addEventListener('click', () => switchToSession(session.id));
  return card;
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
      if (cliType) enterWizard(cliType);
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
// Wizard — inline step wizard for spawning sessions
// ============================================================================

function enterWizard(cliType: string): void {
  sessionsState.wizardCliType = cliType;
  sessionsState.wizardDirIndex = 0;

  if (sessionsState.directories.length > 0) {
    sessionsState.wizardStep = 'directory';
  } else {
    sessionsState.wizardStep = 'confirm';
  }

  sessionsState.activeFocus = 'wizard';
  showWizard();
}

function exitWizard(): void {
  sessionsState.activeFocus = 'spawn';
  sessionsState.wizardCliType = null;
  hideWizard();
}

function showWizard(): void {
  const wizard = document.getElementById('spawnWizard');
  const list = document.getElementById('sessionsList');
  const empty = document.getElementById('sessionsEmpty');
  const spawn = document.querySelector('.spawn-section') as HTMLElement;

  if (wizard) wizard.style.display = '';
  if (list) list.style.display = 'none';
  if (empty) empty.style.display = 'none';
  if (spawn) spawn.style.display = 'none';

  renderWizard();
}

function hideWizard(): void {
  const wizard = document.getElementById('spawnWizard');
  const spawn = document.querySelector('.spawn-section') as HTMLElement;

  if (wizard) wizard.style.display = 'none';
  if (spawn) spawn.style.display = '';

  renderSessions();
  renderSpawnGrid();
}

function renderWizard(): void {
  const wizard = document.getElementById('spawnWizard');
  if (!wizard || !sessionsState.wizardCliType) return;

  const cliType = sessionsState.wizardCliType;
  const step = sessionsState.wizardStep;

  wizard.innerHTML = '';

  // Breadcrumb
  const breadcrumb = document.createElement('div');
  breadcrumb.className = 'wizard-breadcrumb';
  breadcrumb.innerHTML = `
    <span class="wizard-crumb wizard-crumb--done">✓ ${getCliDisplayName(cliType)}</span>
    <span class="wizard-crumb-sep">›</span>
    <span class="wizard-crumb${step === 'directory' ? ' wizard-crumb--active' : (step === 'confirm' && sessionsState.directories.length > 0 ? ' wizard-crumb--done' : '')}">Directory</span>
    <span class="wizard-crumb-sep">›</span>
    <span class="wizard-crumb${step === 'confirm' ? ' wizard-crumb--active' : ''}">Confirm</span>
  `;
  wizard.appendChild(breadcrumb);

  if (step === 'directory') {
    renderDirectoryStep(wizard);
  } else {
    renderConfirmStep(wizard);
  }
}

function renderDirectoryStep(container: HTMLElement): void {
  const section = document.createElement('div');
  section.className = 'wizard-step wizard-step--active';

  const header = document.createElement('div');
  header.className = 'wizard-step__header';
  header.innerHTML = '<span class="wizard-step__number">2</span> Select Directory';
  section.appendChild(header);

  const content = document.createElement('div');
  content.className = 'wizard-step__content';

  sessionsState.directories.forEach((dir, index) => {
    const item = document.createElement('div');
    item.className = 'wizard-dir-item';
    if (index === sessionsState.wizardDirIndex) item.classList.add('focused');
    item.innerHTML = `
      <span class="wizard-dir-name">${dir.name}</span>
      <span class="wizard-dir-path">${dir.path}</span>
    `;
    item.addEventListener('click', () => {
      sessionsState.wizardDirIndex = index;
      advanceToConfirm();
    });
    content.appendChild(item);
  });

  section.appendChild(content);
  container.appendChild(section);

  // Hint footer
  const hint = document.createElement('div');
  hint.className = 'wizard-hint';
  hint.innerHTML = '<kbd>A</kbd> Select  <kbd>B</kbd> Cancel';
  container.appendChild(hint);
}

function renderConfirmStep(container: HTMLElement): void {
  const cliType = sessionsState.wizardCliType!;
  const dir = sessionsState.directories[sessionsState.wizardDirIndex];
  const dirDisplay = dir ? dir.name : 'Default';

  const section = document.createElement('div');
  section.className = 'wizard-step wizard-step--active';

  const header = document.createElement('div');
  header.className = 'wizard-step__header';
  header.innerHTML = '<span class="wizard-step__number">✓</span> Ready to Spawn';
  section.appendChild(header);

  const content = document.createElement('div');
  content.className = 'wizard-step__content wizard-confirm';

  content.innerHTML = `
    <div class="wizard-confirm__row">
      <span class="wizard-confirm__label">CLI</span>
      <span class="wizard-confirm__value">${getCliIcon(cliType)} ${getCliDisplayName(cliType)}</span>
    </div>
    <div class="wizard-confirm__row">
      <span class="wizard-confirm__label">Directory</span>
      <span class="wizard-confirm__value">${dirDisplay}</span>
    </div>
  `;

  section.appendChild(content);
  container.appendChild(section);

  // Action hint
  const hint = document.createElement('div');
  hint.className = 'wizard-hint';
  hint.innerHTML = '<kbd>A</kbd> Spawn  <kbd>B</kbd> Back';
  container.appendChild(hint);
}

function advanceToConfirm(): void {
  sessionsState.wizardStep = 'confirm';
  renderWizard();
}

function handleWizardZone(button: string, dir: string | null): void {
  if (sessionsState.wizardStep === 'directory') {
    handleWizardDirectory(button, dir);
  } else {
    handleWizardConfirm(button);
  }
}

function handleWizardDirectory(button: string, dir: string | null): void {
  const count = sessionsState.directories.length;

  if (dir === 'up') {
    sessionsState.wizardDirIndex = Math.max(0, sessionsState.wizardDirIndex - 1);
    renderWizard();
    return;
  }
  if (dir === 'down') {
    sessionsState.wizardDirIndex = Math.min(count - 1, sessionsState.wizardDirIndex + 1);
    renderWizard();
    return;
  }

  switch (button) {
    case 'A':
      advanceToConfirm();
      return;
    case 'B':
      exitWizard();
      return;
  }
}

function handleWizardConfirm(button: string): void {
  switch (button) {
    case 'A': {
      const cliType = sessionsState.wizardCliType;
      if (!cliType) return;
      const dir = sessionsState.directories[sessionsState.wizardDirIndex];
      exitWizard();
      doSpawn(cliType, dir?.path);
      return;
    }
    case 'B': {
      if (sessionsState.directories.length > 0) {
        sessionsState.wizardStep = 'directory';
        renderWizard();
      } else {
        exitWizard();
      }
      return;
    }
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
