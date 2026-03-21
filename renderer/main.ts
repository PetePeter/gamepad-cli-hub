/**
 * Renderer Process Main Entry
 *
 * Manages the UI, handles gamepad navigation, and communicates with main process via IPC.
 */

import { browserGamepad } from './gamepad.js';

// ============================================================================
// Types
// ============================================================================

interface Session {
  id: string;
  name: string;
  cliType: string;
  processId: number;
  windowHandle: string;
}

interface ButtonEvent {
  button: string;
  gamepadIndex: number;
  timestamp: number;
}

// ============================================================================
// Debug Logging
// ============================================================================

function debugLog(message: string, type: 'info' | 'warn' | 'error' | 'success' = 'info'): void {
  const debugLogContent = document.getElementById('debugLogContent');
  if (!debugLogContent) return;

  const line = document.createElement('div');
  line.className = `debug-log__line debug-log__line--${type}`;
  line.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  debugLogContent.appendChild(line);

  // Auto-scroll to bottom
  debugLogContent.scrollTop = debugLogContent.scrollHeight;

  // Keep only last 100 lines
  while (debugLogContent.children.length > 100) {
    debugLogContent.removeChild(debugLogContent.firstChild!);
  }
}

// Override console.log to also show in debug panel
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

console.log = (...args: any[]) => {
  originalLog.apply(console, args);
  debugLog(args.join(' '), 'info');
};

console.warn = (...args: any[]) => {
  originalWarn.apply(console, args);
  debugLog(args.join(' '), 'warn');
};

console.error = (...args: any[]) => {
  originalError.apply(console, args);
  debugLog(args.join(' '), 'error');
};

// ============================================================================
// State
// ============================================================================

const state = {
  currentScreen: 'sessions',
  sessions: [] as Session[],
  activeSessionId: null as string | null,
  gamepadCount: 0,
  focusedElement: null as HTMLElement | null,
  eventLog: [] as Array<{ time: string; event: string }>,
  cliTypes: [] as string[],
  availableSpawnTypes: [] as string[],
  globalBindings: null as Record<string, any> | null,
  cliBindingsCache: {} as Record<string, Record<string, any>>,
  settingsTab: 'global' as string,
  dirPickerVisible: false,
  dirPickerItems: [] as Array<{ name: string; path: string }>,
  dirPickerSelectedIndex: 0,
  dirPickerCliType: '' as string,
  bindingEditorVisible: false,
  editingBinding: null as { button: string; cliType: string | null; binding: any } | null,
  bindingEditorFocusIndex: 0,
  activeProfile: 'default' as string,
};

// ============================================================================
// Screen Management
// ============================================================================

function showScreen(screenName: string): void {
  // Hide all screens
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.remove('screen--active');
  });

  // Show target screen
  const targetScreen = document.getElementById(`screen-${screenName}`);
  if (targetScreen) {
    targetScreen.classList.add('screen--active');
    state.currentScreen = screenName;
    logEvent(`Screen: ${screenName}`);

    if (screenName === 'settings') {
      loadSettingsScreen();
    }
  }
}

// ============================================================================
// Session Management
// ============================================================================

async function loadSessions(): Promise<void> {
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

function createSessionItem(session: Session): HTMLElement {
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

function getCliIcon(cliType: string): string {
  const icons: Record<string, string> = {
    'claude-code': '🤖',
    'copilot-cli': '💬',
    'generic-terminal': '📟',
  };
  return icons[cliType] || '📟';
}

async function focusSession(sessionId: string): Promise<void> {
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

// ============================================================================
// Config Binding Dispatch
// ============================================================================

async function initConfigCache(): Promise<void> {
  try {
    if (!window.gamepadCli) return;

    state.globalBindings = await window.gamepadCli.configGetGlobalBindings();
    console.log('[Renderer] Cached global bindings:', Object.keys(state.globalBindings || {}));

    for (const cliType of state.cliTypes) {
      const bindings = await window.gamepadCli.configGetBindings(cliType);
      if (bindings) {
        state.cliBindingsCache[cliType] = bindings;
      }
    }
    console.log('[Renderer] Cached CLI bindings for:', Object.keys(state.cliBindingsCache));
  } catch (error) {
    console.error('[Renderer] Failed to init config cache:', error);
  }
}

/**
 * Process a button press against config bindings.
 * Global bindings always fire. Per-CLI bindings fire when an active session exists.
 */
function processConfigBinding(button: string): void {
  if (!window.gamepadCli) return;

  const globalBinding = state.globalBindings?.[button];
  if (globalBinding) {
    executeGlobalBinding(button, globalBinding);
  }

  if (!state.activeSessionId) return;
  const activeSession = state.sessions.find(s => s.id === state.activeSessionId);
  if (!activeSession) return;

  const cliBindings = state.cliBindingsCache[activeSession.cliType];
  const cliBinding = cliBindings?.[button];
  if (cliBinding) {
    executeCliBinding(button, cliBinding);
  }
}

async function executeGlobalBinding(button: string, binding: any): Promise<void> {
  try {
    switch (binding.action) {
      case 'session-switch': {
        const direction = binding.direction === 'next' ? 'next' : 'previous';
        if (direction === 'next') {
          await window.gamepadCli.sessionNext();
        } else {
          await window.gamepadCli.sessionPrevious();
        }
        logEvent(`Session: ${direction}`);
        await loadSessions();
        break;
      }
      case 'spawn': {
        await spawnNewSession(binding.cliType);
        break;
      }
      case 'list-sessions': {
        showScreen('sessions');
        logEvent('Action: list-sessions');
        break;
      }
      case 'profile-switch': {
        const profiles = await window.gamepadCli.profileList();
        const active = await window.gamepadCli.profileGetActive();
        const currentIdx = profiles.indexOf(active);
        let nextIdx: number;
        if (binding.direction === 'next') {
          nextIdx = (currentIdx + 1) % profiles.length;
        } else {
          nextIdx = (currentIdx - 1 + profiles.length) % profiles.length;
        }
        await window.gamepadCli.profileSwitch(profiles[nextIdx]);
        await initConfigCache();
        logEvent(`Profile: ${profiles[nextIdx]}`);
        updateProfileDisplay();
        renderFooterBindings();
        break;
      }
      default:
        console.warn(`[Renderer] Unknown global action: ${binding.action}`);
    }
  } catch (error) {
    console.error(`[Renderer] Global binding failed for ${button}:`, error);
  }
}

async function executeCliBinding(button: string, binding: any): Promise<void> {
  try {
    switch (binding.action) {
      case 'keyboard': {
        if (!binding.keys || !Array.isArray(binding.keys)) {
          console.warn(`[Renderer] Keyboard binding for ${button} missing keys`);
          break;
        }
        await window.gamepadCli.keyboardSendKeys(binding.keys);
        logEvent(`Keys: ${binding.keys.join('+')}`);
        break;
      }
      case 'voice': {
        const duration = binding.holdDuration || 3000;
        await window.gamepadCli.keyboardLongPress('space', duration);
        logEvent(`Voice: hold space ${duration}ms`);
        break;
      }
      case 'openwhisper': {
        logEvent('OpenWhisper: not yet implemented');
        console.warn('[Renderer] OpenWhisper action not yet implemented');
        break;
      }
      default:
        console.warn(`[Renderer] Unknown CLI action: ${binding.action}`);
    }
  } catch (error) {
    console.error(`[Renderer] CLI binding failed for ${button}:`, error);
  }
}

// ============================================================================
// Gamepad Navigation
// ============================================================================

let gamepadUnsubscribe: (() => void) | null = null;
let connectionUnsubscribe: (() => void) | null = null;
let browserGamepadUnsubscribe: (() => void) | null = null;

function setupGamepadNavigation(): void {
  console.log('[Renderer] setupGamepadNavigation: START');

  // PRIORITY: Start browser gamepad poller FIRST (works with BT controllers)
  // This must run before IPC setup so detection works even if preload is broken
  browserGamepad.start();
  console.log('[Renderer] Browser gamepad poller started');

  browserGamepadUnsubscribe = browserGamepad.onButton((event) => {
    console.log('[Renderer] Browser gamepad event received:', event);
    if (event.button === '_connected') {
      handleConnectionEvent({ connected: true, count: browserGamepad.getCount(), timestamp: event.timestamp });
    } else if (event.button === '_disconnected') {
      handleConnectionEvent({ connected: false, count: browserGamepad.getCount(), timestamp: event.timestamp });
    } else {
      handleGamepadEvent(event);
    }
  });
  console.log('[Renderer] Registered browser gamepad callback');

  // Subscribe to main process gamepad events (PowerShell XInput fallback)
  try {
    if (window.gamepadCli) {
      gamepadUnsubscribe = window.gamepadCli.onGamepadEvent(handleGamepadEvent);
      connectionUnsubscribe = window.gamepadCli.onGamepadConnection(handleConnectionEvent);
      console.log('[Renderer] Subscribed to main process IPC events');
    } else {
      console.warn('[Renderer] window.gamepadCli not available - preload may have failed');
    }
  } catch (error) {
    console.error('[Renderer] Failed to subscribe to IPC gamepad events:', error);
    console.warn('[Renderer] Falling back to browser-only gamepad detection');
  }

  // Update initial count from browser
  state.gamepadCount = browserGamepad.getCount();
  const countEl = document.getElementById('gamepadCount');
  const statusEl = document.getElementById('statusGamepadConnected');
  if (countEl) countEl.textContent = state.gamepadCount.toString();
  if (statusEl) statusEl.textContent = state.gamepadCount > 0 ? 'Yes' : 'No';
  console.log('[Renderer] setupGamepadNavigation: END, count:', state.gamepadCount);
}

function handleConnectionEvent(event: { connected: boolean; count: number; timestamp: number }): void {
  console.log('[Renderer] handleConnectionEvent:', event);
  state.gamepadCount = event.count;

  const countEl = document.getElementById('gamepadCount');
  const statusEl = document.getElementById('statusGamepadConnected');

  console.log('[Renderer] Updating UI - countEl:', countEl, 'statusEl:', statusEl);

  if (countEl) countEl.textContent = event.count.toString();
  if (statusEl) statusEl.textContent = event.connected ? 'Yes' : 'No';

  logEvent(`Gamepad ${event.connected ? 'connected' : 'disconnected'}`);
}

async function updateGamepadCount(): Promise<void> {
  try {
    if (!window.gamepadCli) {
      console.warn('[Renderer] gamepadCli not available for count update');
      return;
    }
    const count = await window.gamepadCli.getGamepadCount();
    state.gamepadCount = count;
    const countEl = document.getElementById('gamepadCount');
    const statusEl = document.getElementById('statusGamepadConnected');
    if (countEl) countEl.textContent = count.toString();
    if (statusEl) statusEl.textContent = count > 0 ? 'Yes' : 'No';
  } catch (error) {
    console.error('Failed to get gamepad count:', error);
  }
}

function handleGamepadEvent(event: ButtonEvent): void {
  logEvent(`Button: ${event.button}`);

  // Update status
  document.getElementById('statusLastButton')!.textContent = event.button;

  // If receiving button events, ensure gamepad count is updated
  if (state.gamepadCount === 0) {
    const count = browserGamepad.getCount();
    if (count > 0) {
      handleConnectionEvent({ connected: true, count, timestamp: event.timestamp });
    }
  }

  // Directory picker modal intercepts all input when visible
  if (state.dirPickerVisible) {
    handleDirPickerButton(event.button);
    return;
  }

  // Binding editor modal intercepts all input when visible
  if (state.bindingEditorVisible) {
    handleBindingEditorButton(event.button);
    return;
  }

  // UI navigation consumes the event first; config bindings only fire for unconsumed buttons
  let consumed = false;
  switch (state.currentScreen) {
    case 'sessions':
      consumed = handleSessionsScreenButton(event.button);
      break;
    case 'settings':
      consumed = handleSettingsScreenButton(event.button);
      break;
    case 'status':
      consumed = handleStatusScreenButton(event.button);
      break;
  }

  if (!consumed) {
    processConfigBinding(event.button);
  }
}

function handleSessionsScreenButton(button: string): boolean {
  switch (button) {
    case 'Up':
      navigateFocus(-1);
      return true;
    case 'Down':
      navigateFocus(1);
      return true;
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

function handleSettingsScreenButton(button: string): boolean {
  switch (button) {
    case 'B':
      showScreen('sessions');
      return true;
    case 'Left':
      navigateSettingsTab(-1);
      return true;
    case 'Right':
      navigateSettingsTab(1);
      return true;
    case 'Up':
      navigateFocus(-1);
      return true;
    case 'Down':
      navigateFocus(1);
      return true;
    case 'A':
      activateSettingsFocused();
      return true;
    default:
      return false;
  }
}

function navigateSettingsTab(direction: number): void {
  const allTabs = ['profiles', 'global', ...state.cliTypes, 'tools', 'directories'];
  const currentIndex = allTabs.indexOf(state.settingsTab);
  let nextIndex = currentIndex + direction;
  if (nextIndex < 0) nextIndex = allTabs.length - 1;
  if (nextIndex >= allTabs.length) nextIndex = 0;
  state.settingsTab = allTabs[nextIndex];
  loadSettingsScreen();
}

function activateSettingsFocused(): void {
  const active = document.activeElement as HTMLElement;
  if (active?.classList.contains('focusable')) {
    active.click();
  }
}

function handleStatusScreenButton(button: string): boolean {
  switch (button) {
    case 'B':
      showScreen('sessions');
      return true;
    default:
      return false;
  }
}

function navigateFocus(direction: number): void {
  const focusable = getFocusableElements();
  if (focusable.length === 0) return;

  const currentIndex = focusable.findIndex(el => el === document.activeElement);
  let nextIndex = currentIndex + direction;

  // Wrap around
  if (nextIndex < 0) nextIndex = focusable.length - 1;
  if (nextIndex >= focusable.length) nextIndex = 0;

  focusable[nextIndex].focus();
}

function activateFocusedItem(): void {
  const active = document.activeElement as HTMLElement;
  if (active && active.classList.contains('session-item')) {
    active.click();
  }
}

function getFocusableElements(): HTMLElement[] {
  return Array.from(document.querySelectorAll('.focusable:not([hidden])'));
}

// ============================================================================
// Event Logging
// ============================================================================

function logEvent(event: string): void {
  const now = new Date();
  const time = now.toLocaleTimeString('en-US', { hour12: false });
  state.eventLog.unshift({ time, event });

  // Keep only last 50 events
  if (state.eventLog.length > 50) {
    state.eventLog.pop();
  }

  renderEventLog();
}

function renderEventLog(): void {
  const logEl = document.getElementById('eventLog');
  if (!logEl) return;

  logEl.innerHTML = state.eventLog.slice(0, 20).map(e => `
    <div class="event-log-item">
      <span class="event-log-item--time">[${e.time}]</span> ${e.event}
    </div>
  `).join('');
}

// ============================================================================
// UI Event Handlers
// ============================================================================

function setupUIHandlers(): void {
  // Settings button
  document.getElementById('settingsBtn')?.addEventListener('click', () => {
    showScreen('settings');
  });

  // Settings back button
  document.getElementById('settingsBackBtn')?.addEventListener('click', () => {
    showScreen('sessions');
  });

  // Spawn buttons are rendered dynamically by renderSpawnButtons()

  // Detect gamepad button (requires user gesture)
  document.getElementById('detectGamepadBtn')?.addEventListener('click', () => {
    console.log('[Renderer] Manual gamepad detection triggered');
    browserGamepad.requestGamepadAccess();

    // Also check main process gamepad count
    try {
      if (window.gamepadCli) {
        updateGamepadCount();
      }
    } catch (error) {
      console.warn('[Renderer] Could not check main process gamepad count:', error);
    }

    logEvent('Gamepad detection triggered — press a button on your controller');
  });

  // Close debug log
  document.getElementById('closeDebugLog')?.addEventListener('click', () => {
    const debugLog = document.getElementById('debugLog');
    if (debugLog) {
      debugLog.style.display = 'none';
    }
  });

  // Directory picker cancel button
  document.getElementById('dirPickerCancelBtn')?.addEventListener('click', () => {
    hideDirPicker();
    logEvent('Spawn cancelled');
  });

  // Binding editor cancel button
  document.getElementById('bindingEditorCancelBtn')?.addEventListener('click', () => {
    closeBindingEditor();
    logEvent('Binding edit cancelled');
  });

  // Binding editor save button
  document.getElementById('bindingEditorSaveBtn')?.addEventListener('click', () => {
    saveBinding();
  });

  // Keyboard shortcut to toggle debug log (Ctrl+L)
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'l') {
      e.preventDefault();
      const debugLog = document.getElementById('debugLog');
      if (debugLog) {
        debugLog.style.display = debugLog.style.display === 'none' ? 'flex' : 'none';
      }
    }
  });
}

async function spawnNewSession(cliType?: string): Promise<void> {
  const resolvedType = cliType || state.availableSpawnTypes[0] || 'generic-terminal';

  try {
    if (!window.gamepadCli) {
      logEvent('Spawn failed: gamepadCli not available');
      return;
    }
    const dirs = await window.gamepadCli.configGetWorkingDirs();
    if (dirs && dirs.length > 0) {
      showDirPicker(resolvedType, dirs);
      return;
    }
    // No presets configured — spawn without cwd
    await doSpawn(resolvedType);
  } catch (error) {
    console.error('Spawn error:', error);
    logEvent(`Spawn error: ${error}`);
  }
}

async function doSpawn(cliType: string, workingDir?: string): Promise<void> {
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

function showDirPicker(cliType: string, dirs: Array<{ name: string; path: string }>): void {
  state.dirPickerVisible = true;
  state.dirPickerItems = dirs;
  state.dirPickerSelectedIndex = 0;
  state.dirPickerCliType = cliType;

  const modal = document.getElementById('dirPickerModal');
  if (!modal) return;

  const title = modal.querySelector('.modal-title');
  if (title) title.textContent = `Select directory for ${getCliDisplayName(cliType)}`;

  renderDirPickerList();
  modal.classList.add('modal--visible');
  modal.setAttribute('aria-hidden', 'false');
}

function renderDirPickerList(): void {
  const list = document.getElementById('dirPickerList');
  if (!list) return;

  list.innerHTML = '';

  state.dirPickerItems.forEach((dir, index) => {
    const item = document.createElement('div');
    item.className = 'dir-picker-item focusable';
    if (index === state.dirPickerSelectedIndex) {
      item.classList.add('dir-picker-item--selected');
    }
    item.tabIndex = 0;
    item.innerHTML = `
      <span class="dir-picker-item__name">${dir.name}</span>
      <span class="dir-picker-item__path">${dir.path}</span>
    `;
    item.addEventListener('click', () => selectDirAndSpawn(index));
    list.appendChild(item);
  });

  // Focus the selected item
  const selectedItem = list.children[state.dirPickerSelectedIndex] as HTMLElement;
  selectedItem?.focus();
}

function hideDirPicker(): void {
  state.dirPickerVisible = false;
  const modal = document.getElementById('dirPickerModal');
  if (modal) {
    modal.classList.remove('modal--visible');
    modal.setAttribute('aria-hidden', 'true');
  }
}

async function selectDirAndSpawn(index: number): Promise<void> {
  const dir = state.dirPickerItems[index];
  if (!dir) return;

  hideDirPicker();
  await doSpawn(state.dirPickerCliType, dir.path);
}

function handleDirPickerButton(button: string): void {
  switch (button) {
    case 'Up':
      state.dirPickerSelectedIndex = Math.max(0, state.dirPickerSelectedIndex - 1);
      renderDirPickerList();
      break;
    case 'Down':
      state.dirPickerSelectedIndex = Math.min(state.dirPickerItems.length - 1, state.dirPickerSelectedIndex + 1);
      renderDirPickerList();
      break;
    case 'A':
      selectDirAndSpawn(state.dirPickerSelectedIndex);
      break;
    case 'B':
      hideDirPicker();
      logEvent('Spawn cancelled');
      break;
  }
}

function getCliDisplayName(cliType: string): string {
  const names: Record<string, string> = {
    'claude-code': 'Claude',
    'copilot-cli': 'Copilot',
    'generic-terminal': 'Terminal',
  };
  return names[cliType] || cliType;
}

function renderSpawnButtons(): void {
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
// Initialization
// ============================================================================

async function init(): Promise<void> {
  console.log('[Renderer] Initializing');
  console.log('[Renderer] navigator.gamepad API exists:', typeof navigator.getGamepads === 'function');

  // Setup gamepad navigation
  setupGamepadNavigation();
  console.log('[Renderer] Gamepad navigation setup complete');

  // Setup UI event handlers
  setupUIHandlers();

  // Warm up config (must be first — triggers configLoader.load() on main process)
  try {
    if (window.gamepadCli) {
      await window.gamepadCli.configGetAll();
    }
  } catch (error) {
    console.warn('[Renderer] Failed to warm up config:', error);
  }

  // Load available CLI types for spawning
  try {
    if (window.gamepadCli) {
      state.cliTypes = await window.gamepadCli.configGetCliTypes();
      state.availableSpawnTypes = state.cliTypes;
      console.log('[Renderer] Available CLI types:', state.cliTypes);
    } else {
      console.warn('[Renderer] gamepadCli not available — skipping CLI type loading');
    }
  } catch (error) {
    console.error('Failed to load CLI types:', error);
  }

  // Render spawn buttons based on loaded CLI types
  renderSpawnButtons();

  // Cache config bindings for fast gamepad dispatch
  await initConfigCache();

  // Update profile display and footer bindings
  await updateProfileDisplay();
  renderFooterBindings();

  // Refresh sessions from existing terminals
  try {
    if (window.gamepadCli) {
      const refreshResult = await window.gamepadCli.sessionRefresh();
      if (refreshResult.success) {
        logEvent(`Found ${refreshResult.total} session(s)`);
      }
    }
  } catch (error) {
    console.error('Failed to refresh sessions:', error);
  }

  // Load initial data
  await loadSessions();

  // Log initialization
  logEvent('App ready');

  console.log('[Renderer] Ready');
}

async function loadSettingsScreen(): Promise<void> {
  try {
    const cliTypes = state.cliTypes.length > 0
      ? state.cliTypes
      : (window.gamepadCli ? await window.gamepadCli.configGetCliTypes() : []);

    renderSettingsTabs(cliTypes);

    if (state.settingsTab === 'profiles') {
      await renderProfilesPanel();
    } else if (state.settingsTab === 'global') {
      const bindings = state.globalBindings
        || (window.gamepadCli ? await window.gamepadCli.configGetGlobalBindings() : {});
      renderBindingsDisplay(bindings || {}, 'Global Bindings');
    } else if (state.settingsTab === 'tools') {
      await renderToolsPanel();
    } else if (state.settingsTab === 'directories') {
      await renderDirectoriesPanel();
    } else {
      const bindings = state.cliBindingsCache[state.settingsTab]
        || (window.gamepadCli ? await window.gamepadCli.configGetBindings(state.settingsTab) : null);
      renderBindingsDisplay(bindings || {}, `${getCliDisplayName(state.settingsTab)} Bindings`);
    }
  } catch (error) {
    console.error('Failed to load settings screen:', error);
  }
}

function renderSettingsTabs(cliTypes: string[]): void {
  const container = document.getElementById('settingsTabs');
  if (!container) return;

  container.innerHTML = '';

  const allTabs = [
    { key: 'profiles', label: '👤 Profiles' },
    { key: 'global', label: 'Global' },
    ...cliTypes.map(ct => ({ key: ct, label: getCliDisplayName(ct) })),
    { key: 'tools', label: '🔧 Tools' },
    { key: 'directories', label: '📁 Directories' },
  ];

  allTabs.forEach(tab => {
    const btn = document.createElement('button');
    btn.className = 'settings-tab focusable';
    if (tab.key === state.settingsTab) {
      btn.classList.add('settings-tab--active');
    }
    btn.tabIndex = 0;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', (tab.key === state.settingsTab).toString());
    btn.textContent = tab.label;
    btn.addEventListener('click', () => {
      state.settingsTab = tab.key;
      loadSettingsScreen();
    });
    container.appendChild(btn);
  });
}

function renderBindingsDisplay(bindings: Record<string, any>, label: string): void {
  const container = document.getElementById('bindingsDisplay');
  if (!container) return;

  container.innerHTML = '';

  const entries = Object.entries(bindings);
  if (entries.length === 0) {
    container.innerHTML = '<p style="color: var(--text-dim);">No bindings configured</p>';
  }

  entries.forEach(([button, binding]) => {
    const card = document.createElement('div');
    card.className = 'binding-card focusable';
    card.tabIndex = 0;

    const actionType = binding.action || 'unknown';
    const details = formatBindingDetails(binding);

    card.innerHTML = `
      <div class="binding-card__header">
        <span class="binding-card__button">${button}</span>
        <span class="binding-card__action-badge">${actionType}</span>
      </div>
      <div class="binding-card__details">${details}</div>
    `;

    // Click card to edit
    card.style.cursor = 'pointer';
    card.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.binding-card__delete')) return;
      const cliType = state.settingsTab === 'global' ? null : state.settingsTab;
      openBindingEditor(button, cliType, { ...binding });
    });

    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'binding-card__delete btn btn--danger btn--sm focusable';
    deleteBtn.tabIndex = 0;
    deleteBtn.textContent = '✕';
    deleteBtn.title = `Remove ${button} binding`;
    let confirmPending = false;
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirmPending) {
        deleteBtn.textContent = '?';
        deleteBtn.title = 'Click again to confirm deletion';
        confirmPending = true;
        setTimeout(() => { if (confirmPending) { deleteBtn.textContent = '✕'; deleteBtn.title = `Remove ${button} binding`; confirmPending = false; } }, 3000);
        return;
      }
      confirmPending = false;
      try {
        const cliType = state.settingsTab === 'global' ? null : state.settingsTab;
        const result = await window.gamepadCli.configRemoveBinding(button, cliType);
        if (result.success) {
          logEvent(`Removed binding: ${button}`);
          if (cliType === null && state.globalBindings) {
            delete state.globalBindings[button];
          } else if (cliType && state.cliBindingsCache[cliType]) {
            delete state.cliBindingsCache[cliType][button];
          }
          loadSettingsScreen();
        }
      } catch (error) {
        console.error('Remove binding failed:', error);
      }
    });
    card.querySelector('.binding-card__header')?.appendChild(deleteBtn);

    container.appendChild(card);
  });

  // "Add Binding" button
  const mappedButtons = Object.keys(bindings);
  const unmappedButtons = ALL_BUTTONS.filter(b => !mappedButtons.includes(b));

  if (unmappedButtons.length > 0) {
    const addRow = document.createElement('div');
    addRow.className = 'binding-add-row';

    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn--primary focusable';
    addBtn.tabIndex = 0;
    addBtn.textContent = '+ Add Binding';
    addBtn.addEventListener('click', () => {
      showAddBindingPicker(unmappedButtons);
    });

    addRow.appendChild(addBtn);
    container.appendChild(addRow);
  }
}

function showAddBindingPicker(unmappedButtons: string[]): void {
  const container = document.getElementById('bindingsDisplay');
  if (!container) return;

  // Remove any existing picker
  const existing = container.querySelector('.binding-picker');
  if (existing) { existing.remove(); return; }

  const picker = document.createElement('div');
  picker.className = 'binding-picker';

  const title = document.createElement('p');
  title.style.color = 'var(--text-secondary)';
  title.style.marginBottom = '8px';
  title.textContent = 'Select a button to bind:';
  picker.appendChild(title);

  const grid = document.createElement('div');
  grid.className = 'binding-picker__grid';

  unmappedButtons.forEach(button => {
    const btn = document.createElement('button');
    btn.className = 'btn btn--secondary btn--sm focusable';
    btn.tabIndex = 0;
    btn.textContent = button;
    btn.addEventListener('click', () => {
      const cliType = state.settingsTab === 'global' ? null : state.settingsTab;
      openBindingEditor(button, cliType, { action: 'keyboard', keys: [] });
    });
    grid.appendChild(btn);
  });

  picker.appendChild(grid);
  container.appendChild(picker);

  // Focus first button in picker
  const firstBtn = grid.querySelector('.focusable') as HTMLElement;
  if (firstBtn) firstBtn.focus();
}

function formatBindingDetails(binding: any): string {
  switch (binding.action) {
    case 'keyboard':
      return binding.keys ? binding.keys.join(' → ') : '—';
    case 'spawn':
      return binding.cliType ? `spawn: ${binding.cliType}` : '—';
    case 'session-switch':
      return binding.direction ? `direction: ${binding.direction}` : '—';
    case 'openwhisper':
      return binding.recordingDuration
        ? `openwhisper ${binding.recordingDuration}ms`
        : 'openwhisper';
    case 'voice':
      return binding.holdDuration
        ? `voice hold ${binding.holdDuration}ms`
        : 'voice';
    case 'list-sessions':
      return 'show sessions list';
    case 'profile-switch':
      return binding.direction ? `profile: ${binding.direction}` : 'profile switch';
    default:
      return JSON.stringify(binding);
  }
}

// ============================================================================
// Profile Display
// ============================================================================

async function updateProfileDisplay(): Promise<void> {
  try {
    if (!window.gamepadCli) return;
    const active = await window.gamepadCli.profileGetActive();
    state.activeProfile = active;
    const nameEl = document.getElementById('profileName');
    if (nameEl) nameEl.textContent = active;
  } catch (error) {
    console.error('[Renderer] Failed to update profile display:', error);
  }
}

/**
 * Render binding summary in the footer bar from global + active CLI bindings.
 * Shows button → short action label for quick reference.
 */
function renderFooterBindings(): void {
  const container = document.getElementById('footerBindings');
  if (!container) return;

  container.innerHTML = '';

  const bindings = state.globalBindings || {};
  const allBindings: Record<string, string> = {};

  // Global bindings
  for (const [button, binding] of Object.entries(bindings)) {
    allBindings[button] = getShortActionLabel(binding);
  }

  // Active CLI bindings (if a session is focused)
  if (state.activeSessionId) {
    const session = state.sessions.find(s => s.id === state.activeSessionId);
    if (session) {
      const cliBindings = state.cliBindingsCache[session.cliType] || {};
      for (const [button, binding] of Object.entries(cliBindings)) {
        if (!allBindings[button]) {
          allBindings[button] = getShortActionLabel(binding);
        }
      }
    }
  }

  // Render each as a hint
  for (const [button, label] of Object.entries(allBindings)) {
    const hint = document.createElement('span');
    hint.className = 'nav-hint';
    hint.innerHTML = `<kbd>${getButtonSymbol(button)}</kbd> ${label}`;
    container.appendChild(hint);
  }
}

function getShortActionLabel(binding: any): string {
  switch (binding.action) {
    case 'keyboard':
      return binding.keys?.length === 1 ? binding.keys[0] : (binding.keys?.join('+') || 'keys');
    case 'spawn':
      return `+${getCliDisplayName(binding.cliType || '')}`;
    case 'session-switch':
      return binding.direction === 'next' ? 'Next' : 'Prev';
    case 'profile-switch':
      return binding.direction === 'next' ? 'Prof→' : '←Prof';
    case 'openwhisper':
      return 'Voice';
    case 'voice':
      return 'Voice';
    case 'list-sessions':
      return 'Sessions';
    default:
      return binding.action || '?';
  }
}

function getButtonSymbol(button: string): string {
  const symbols: Record<string, string> = {
    'Up': '↑',
    'Down': '↓',
    'Left': '←',
    'Right': '→',
    'A': 'A',
    'B': 'B',
    'X': 'X',
    'Y': 'Y',
    'LeftTrigger': 'LT',
    'RightTrigger': 'RT',
    'LeftBumper': 'LB',
    'RightBumper': 'RB',
    'Back': '⊲',
    'Start': '⊳',
  };
  return symbols[button] || button;
}

// ============================================================================
// Profiles Panel
// ============================================================================

async function renderProfilesPanel(): Promise<void> {
  const container = document.getElementById('bindingsDisplay');
  if (!container || !window.gamepadCli) return;

  container.innerHTML = '';

  const profiles = await window.gamepadCli.profileList();
  const active = await window.gamepadCli.profileGetActive();

  const panel = document.createElement('div');
  panel.className = 'settings-panel';

  // Header
  const header = document.createElement('div');
  header.className = 'settings-panel__header';
  header.innerHTML = `<span class="settings-panel__title">Binding Profiles</span>`;

  const createBtn = document.createElement('button');
  createBtn.className = 'btn btn--primary btn--sm focusable';
  createBtn.tabIndex = 0;
  createBtn.textContent = '+ Create Profile';
  createBtn.addEventListener('click', () => showCreateProfilePrompt(profiles));
  header.appendChild(createBtn);
  panel.appendChild(header);

  // Profile list
  const list = document.createElement('div');
  list.className = 'settings-list';

  profiles.forEach(name => {
    const item = document.createElement('div');
    const isActive = name === active;
    item.className = `settings-list-item${isActive ? ' settings-list-item--active' : ''}`;

    item.innerHTML = `
      <div class="settings-list-item__info">
        <span class="settings-list-item__name">${name}${isActive ? '<span class="settings-list-item__badge">Active</span>' : ''}</span>
      </div>
    `;

    const actions = document.createElement('div');
    actions.className = 'settings-list-item__actions';

    if (!isActive) {
      const switchBtn = document.createElement('button');
      switchBtn.className = 'btn btn--primary btn--sm focusable';
      switchBtn.tabIndex = 0;
      switchBtn.textContent = 'Switch';
      switchBtn.addEventListener('click', async () => {
        await window.gamepadCli.profileSwitch(name);
        await initConfigCache();
        updateProfileDisplay();
        renderFooterBindings();
        logEvent(`Profile: ${name}`);
        loadSettingsScreen();
      });
      actions.appendChild(switchBtn);
    }

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn--danger btn--sm focusable';
    deleteBtn.tabIndex = 0;
    deleteBtn.textContent = 'Delete';
    deleteBtn.disabled = name === 'default';
    if (name !== 'default') {
      let confirmPending = false;
      deleteBtn.addEventListener('click', async () => {
        if (!confirmPending) {
          deleteBtn.textContent = 'Confirm?';
          confirmPending = true;
          setTimeout(() => { if (confirmPending) { deleteBtn.textContent = 'Delete'; confirmPending = false; } }, 3000);
          return;
        }
        confirmPending = false;
        try {
          const result = await window.gamepadCli.profileDelete(name);
          if (result.success) {
            logEvent(`Deleted profile: ${name}`);
            loadSettingsScreen();
          }
        } catch (error) {
          console.error('Delete profile failed:', error);
        }
      });
    }
    actions.appendChild(deleteBtn);

    item.appendChild(actions);
    list.appendChild(item);
  });

  panel.appendChild(list);
  container.appendChild(panel);
}

function showCreateProfilePrompt(existingProfiles: string[]): void {
  const name = prompt('New profile name:');
  if (!name || !name.trim()) return;

  const slug = name.trim();
  const copyFrom = prompt(`Copy bindings from existing profile? (${existingProfiles.join(', ')}) — leave blank for empty:`);

  (async () => {
    try {
      const result = await window.gamepadCli.profileCreate(slug, copyFrom?.trim() || undefined);
      if (result.success) {
        logEvent(`Created profile: ${slug}`);
        loadSettingsScreen();
      } else {
        logEvent('Profile creation failed');
      }
    } catch (error) {
      console.error('Failed to create profile:', error);
      logEvent(`Profile create error: ${error}`);
    }
  })();
}

// ============================================================================
// Tools Panel
// ============================================================================

async function renderToolsPanel(): Promise<void> {
  const container = document.getElementById('bindingsDisplay');
  if (!container || !window.gamepadCli) return;

  container.innerHTML = '';

  let toolsData: any;
  try {
    toolsData = await window.gamepadCli.toolsGetAll();
  } catch {
    container.innerHTML = '<p style="color: var(--text-dim);">Failed to load tools config</p>';
    return;
  }

  const panel = document.createElement('div');
  panel.className = 'settings-panel';

  // Header
  const header = document.createElement('div');
  header.className = 'settings-panel__header';
  header.innerHTML = `<span class="settings-panel__title">CLI Types</span>`;

  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn--primary btn--sm focusable';
  addBtn.tabIndex = 0;
  addBtn.textContent = '+ Add CLI Type';
  addBtn.addEventListener('click', () => showAddCliTypeForm(panel));
  header.appendChild(addBtn);
  panel.appendChild(header);

  // CLI Types list
  const cliTypes = toolsData?.cliTypes || {};
  const list = document.createElement('div');
  list.className = 'settings-list';
  list.id = 'toolsList';

  Object.entries(cliTypes).forEach(([key, value]: [string, any]) => {
    list.appendChild(createCliTypeItem(key, value));
  });

  if (Object.keys(cliTypes).length === 0) {
    list.innerHTML = '<p style="color: var(--text-dim); padding: var(--spacing-md);">No CLI types configured</p>';
  }

  panel.appendChild(list);

  // OpenWhisper read-only
  if (toolsData?.openwhisper) {
    const owCard = document.createElement('div');
    owCard.className = 'settings-readonly-card';
    owCard.innerHTML = `
      <div class="settings-readonly-card__title">OpenWhisper Config (read-only)</div>
      <div class="settings-readonly-card__content">${JSON.stringify(toolsData.openwhisper, null, 2)}</div>
    `;
    panel.appendChild(owCard);
  }

  container.appendChild(panel);
}

function createCliTypeItem(key: string, value: any): HTMLElement {
  const item = document.createElement('div');
  item.className = 'settings-list-item';
  item.dataset.cliKey = key;

  const spawn = value.spawn || {};
  const argsStr = Array.isArray(spawn.args) ? spawn.args.join(', ') : '';

  item.innerHTML = `
    <div class="settings-list-item__info">
      <span class="settings-list-item__name">${value.name || key}</span>
      <span class="settings-list-item__detail">${spawn.command || '—'}${argsStr ? ` ${argsStr}` : ''}</span>
    </div>
  `;

  const actions = document.createElement('div');
  actions.className = 'settings-list-item__actions';

  const editBtn = document.createElement('button');
  editBtn.className = 'btn btn--secondary btn--sm focusable';
  editBtn.tabIndex = 0;
  editBtn.textContent = 'Edit';
  editBtn.addEventListener('click', () => showEditCliTypeForm(key, value));
  actions.appendChild(editBtn);

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'btn btn--danger btn--sm focusable';
  deleteBtn.tabIndex = 0;
  deleteBtn.textContent = 'Delete';
  let deleteConfirmPending = false;
  deleteBtn.addEventListener('click', async () => {
    if (!deleteConfirmPending) {
      deleteBtn.textContent = 'Confirm?';
      deleteConfirmPending = true;
      setTimeout(() => {
        if (deleteConfirmPending) {
          deleteBtn.textContent = 'Delete';
          deleteConfirmPending = false;
        }
      }, 3000);
      return;
    }
    deleteConfirmPending = false;
    try {
      const result = await window.gamepadCli.toolsRemoveCliType(key);
      if (result.success) {
        logEvent(`Deleted CLI type: ${key}`);
        state.cliTypes = await window.gamepadCli.configGetCliTypes();
        state.availableSpawnTypes = state.cliTypes;
        renderSpawnButtons();
        loadSettingsScreen();
      } else {
        logEvent(`Failed to delete: ${result.error || 'unknown error'}`);
      }
    } catch (error) {
      console.error('Delete CLI type failed:', error);
    }
  });
  actions.appendChild(deleteBtn);

  item.appendChild(actions);
  return item;
}

function showAddCliTypeForm(panel: HTMLElement): void {
  // Remove existing add form if present
  panel.querySelector('#addCliTypeForm')?.remove();

  const form = document.createElement('div');
  form.className = 'settings-form';
  form.id = 'addCliTypeForm';
  form.innerHTML = `
    <span class="settings-form__title">Add CLI Type</span>
    <div class="settings-form__row">
      <div class="settings-form__field">
        <label>Key (slug)</label>
        <input type="text" id="newCliKey" placeholder="e.g. my-tool" class="focusable" tabindex="0" />
      </div>
      <div class="settings-form__field">
        <label>Name</label>
        <input type="text" id="newCliName" placeholder="e.g. My Tool" class="focusable" tabindex="0" />
      </div>
    </div>
    <div class="settings-form__row">
      <div class="settings-form__field">
        <label>Command</label>
        <input type="text" id="newCliCommand" placeholder="e.g. my-tool.exe" class="focusable" tabindex="0" />
      </div>
      <div class="settings-form__field">
        <label>Args (comma-separated)</label>
        <input type="text" id="newCliArgs" placeholder="e.g. --interactive, --color" class="focusable" tabindex="0" />
      </div>
    </div>
    <div class="settings-form__row">
      <button class="btn btn--primary btn--sm focusable" tabindex="0" id="saveNewCliBtn">Save</button>
      <button class="btn btn--secondary btn--sm focusable" tabindex="0" id="cancelNewCliBtn">Cancel</button>
    </div>
  `;

  // Insert after header
  const header = panel.querySelector('.settings-panel__header');
  if (header && header.nextSibling) {
    panel.insertBefore(form, header.nextSibling);
  } else {
    panel.appendChild(form);
  }

  document.getElementById('saveNewCliBtn')?.addEventListener('click', async () => {
    const key = (document.getElementById('newCliKey') as HTMLInputElement).value.trim();
    const name = (document.getElementById('newCliName') as HTMLInputElement).value.trim();
    const command = (document.getElementById('newCliCommand') as HTMLInputElement).value.trim();
    const argsStr = (document.getElementById('newCliArgs') as HTMLInputElement).value.trim();
    const args = argsStr ? argsStr.split(',').map(a => a.trim()).filter(Boolean) : [];

    if (!key || !name || !command) {
      logEvent('Add CLI type: key, name, command are required');
      return;
    }

    const result = await window.gamepadCli.toolsAddCliType(key, name, command, args);
    if (result.success) {
      logEvent(`Added CLI type: ${key}`);
      state.cliTypes = await window.gamepadCli.configGetCliTypes();
      state.availableSpawnTypes = state.cliTypes;
      renderSpawnButtons();
      loadSettingsScreen();
    } else {
      logEvent('Failed to add CLI type');
    }
  });

  document.getElementById('cancelNewCliBtn')?.addEventListener('click', () => {
    form.remove();
  });

  (document.getElementById('newCliKey') as HTMLInputElement)?.focus();
}

function showEditCliTypeForm(key: string, value: any): void {
  const spawn = value.spawn || {};
  const argsStr = Array.isArray(spawn.args) ? spawn.args.join(', ') : '';

  const name = prompt('Name:', value.name || key);
  if (name === null) return;
  const command = prompt('Command:', spawn.command || '');
  if (command === null) return;
  const argsInput = prompt('Args (comma-separated):', argsStr);
  if (argsInput === null) return;

  const args = argsInput ? argsInput.split(',').map(a => a.trim()).filter(Boolean) : [];

  (async () => {
    const result = await window.gamepadCli.toolsUpdateCliType(key, name.trim(), command.trim(), args);
    if (result.success) {
      logEvent(`Updated CLI type: ${key}`);
      state.cliTypes = await window.gamepadCli.configGetCliTypes();
      state.availableSpawnTypes = state.cliTypes;
      renderSpawnButtons();
      loadSettingsScreen();
    } else {
      logEvent('Failed to update CLI type');
    }
  })();
}

// ============================================================================
// Directories Panel
// ============================================================================

async function renderDirectoriesPanel(): Promise<void> {
  const container = document.getElementById('bindingsDisplay');
  if (!container || !window.gamepadCli) return;

  container.innerHTML = '';

  let dirs: Array<{ name: string; path: string }>;
  try {
    dirs = await window.gamepadCli.configGetWorkingDirs();
  } catch {
    container.innerHTML = '<p style="color: var(--text-dim);">Failed to load directories</p>';
    return;
  }

  const panel = document.createElement('div');
  panel.className = 'settings-panel';

  // Header
  const header = document.createElement('div');
  header.className = 'settings-panel__header';
  header.innerHTML = `<span class="settings-panel__title">Working Directories</span>`;

  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn--primary btn--sm focusable';
  addBtn.tabIndex = 0;
  addBtn.textContent = '+ Add Directory';
  addBtn.addEventListener('click', () => showAddDirectoryForm(panel));
  header.appendChild(addBtn);
  panel.appendChild(header);

  // Directories list
  const list = document.createElement('div');
  list.className = 'settings-list';
  list.id = 'directoriesList';

  if (dirs.length === 0) {
    list.innerHTML = '<p style="color: var(--text-dim); padding: var(--spacing-md);">No working directories configured</p>';
  } else {
    dirs.forEach((dir, index) => {
      list.appendChild(createDirectoryItem(dir, index));
    });
  }

  panel.appendChild(list);
  container.appendChild(panel);
}

function createDirectoryItem(dir: { name: string; path: string }, index: number): HTMLElement {
  const item = document.createElement('div');
  item.className = 'settings-list-item';

  item.innerHTML = `
    <div class="settings-list-item__info">
      <span class="settings-list-item__name">${dir.name}</span>
      <span class="settings-list-item__detail">${dir.path}</span>
    </div>
  `;

  const actions = document.createElement('div');
  actions.className = 'settings-list-item__actions';

  const editBtn = document.createElement('button');
  editBtn.className = 'btn btn--secondary btn--sm focusable';
  editBtn.tabIndex = 0;
  editBtn.textContent = 'Edit';
  editBtn.addEventListener('click', () => showEditDirectoryPrompt(dir, index));
  actions.appendChild(editBtn);

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'btn btn--danger btn--sm focusable';
  deleteBtn.tabIndex = 0;
  deleteBtn.textContent = 'Delete';
  let dirConfirmPending = false;
  deleteBtn.addEventListener('click', async () => {
    if (!dirConfirmPending) {
      deleteBtn.textContent = 'Confirm?';
      dirConfirmPending = true;
      setTimeout(() => { if (dirConfirmPending) { deleteBtn.textContent = 'Delete'; dirConfirmPending = false; } }, 3000);
      return;
    }
    dirConfirmPending = false;
    try {
      const result = await window.gamepadCli.configRemoveWorkingDir(index);
      if (result.success) {
        logEvent(`Deleted directory: ${dir.name}`);
        loadSettingsScreen();
      }
    } catch (error) {
      console.error('Delete directory failed:', error);
    }
  });
  actions.appendChild(deleteBtn);

  item.appendChild(actions);
  return item;
}

function showAddDirectoryForm(panel: HTMLElement): void {
  panel.querySelector('#addDirForm')?.remove();

  const form = document.createElement('div');
  form.className = 'settings-form';
  form.id = 'addDirForm';
  form.innerHTML = `
    <span class="settings-form__title">Add Directory</span>
    <div class="settings-form__row">
      <div class="settings-form__field">
        <label>Name</label>
        <input type="text" id="newDirName" placeholder="e.g. My Project" class="focusable" tabindex="0" />
      </div>
      <div class="settings-form__field">
        <label>Path</label>
        <input type="text" id="newDirPath" placeholder="e.g. C:\\projects\\my-project" class="focusable" tabindex="0" />
      </div>
    </div>
    <div class="settings-form__row">
      <button class="btn btn--primary btn--sm focusable" tabindex="0" id="saveNewDirBtn">Save</button>
      <button class="btn btn--secondary btn--sm focusable" tabindex="0" id="cancelNewDirBtn">Cancel</button>
    </div>
  `;

  const header = panel.querySelector('.settings-panel__header');
  if (header && header.nextSibling) {
    panel.insertBefore(form, header.nextSibling);
  } else {
    panel.appendChild(form);
  }

  document.getElementById('saveNewDirBtn')?.addEventListener('click', async () => {
    const name = (document.getElementById('newDirName') as HTMLInputElement).value.trim();
    const dirPath = (document.getElementById('newDirPath') as HTMLInputElement).value.trim();

    if (!name || !dirPath) {
      logEvent('Add directory: name and path are required');
      return;
    }

    const result = await window.gamepadCli.configAddWorkingDir(name, dirPath);
    if (result.success) {
      logEvent(`Added directory: ${name}`);
      loadSettingsScreen();
    } else {
      logEvent('Failed to add directory');
    }
  });

  document.getElementById('cancelNewDirBtn')?.addEventListener('click', () => {
    form.remove();
  });

  (document.getElementById('newDirName') as HTMLInputElement)?.focus();
}

function showEditDirectoryPrompt(dir: { name: string; path: string }, index: number): void {
  const name = prompt('Name:', dir.name);
  if (name === null) return;
  const dirPath = prompt('Path:', dir.path);
  if (dirPath === null) return;

  (async () => {
    const result = await window.gamepadCli.configUpdateWorkingDir(index, name.trim(), dirPath.trim());
    if (result.success) {
      logEvent(`Updated directory: ${name.trim()}`);
      loadSettingsScreen();
    } else {
      logEvent('Failed to update directory');
    }
  })();
}

// ============================================================================
// Binding Editor Modal
// ============================================================================

const ACTION_TYPES = ['keyboard', 'voice', 'openwhisper', 'session-switch', 'spawn', 'list-sessions', 'profile-switch'] as const;

const ALL_BUTTONS = ['A', 'B', 'X', 'Y', 'Up', 'Down', 'Left', 'Right', 'LeftBumper', 'RightBumper', 'LeftTrigger', 'RightTrigger', 'LeftStick', 'RightStick', 'Start', 'Back', 'Guide'] as const;

function openBindingEditor(button: string, cliType: string | null, binding: any): void {
  state.editingBinding = { button, cliType, binding: { ...binding } };
  state.bindingEditorVisible = true;
  state.bindingEditorFocusIndex = 0;

  const modal = document.getElementById('bindingEditorModal');
  if (!modal) return;

  const title = document.getElementById('bindingEditorTitle');
  if (title) {
    const context = cliType ? getCliDisplayName(cliType) : 'Global';
    title.textContent = `Edit Binding — ${button} (${context})`;
  }

  renderBindingEditorForm();
  modal.classList.add('modal--visible');
  modal.setAttribute('aria-hidden', 'false');
  logEvent(`Editing binding: ${button}`);
}

function renderBindingEditorForm(): void {
  const form = document.getElementById('bindingEditorForm');
  if (!form || !state.editingBinding) return;

  const { button, binding } = state.editingBinding;
  form.innerHTML = '';

  // Button name (read-only)
  form.appendChild(createEditorField('Button', `
    <input type="text" value="${button}" disabled />
  `, true));

  // Action type dropdown
  const actionOptions = ACTION_TYPES.map(t =>
    `<option value="${t}" ${t === binding.action ? 'selected' : ''}>${t}</option>`
  ).join('');
  form.appendChild(createEditorField('Action Type', `
    <select id="bindingEditorAction">${actionOptions}</select>
  `));

  // Dynamic params based on action type
  renderActionParams(form, binding);

  // Wire action type change to re-render params
  const actionSelect = document.getElementById('bindingEditorAction') as HTMLSelectElement;
  actionSelect?.addEventListener('change', () => {
    if (!state.editingBinding) return;
    const newAction = actionSelect.value;
    state.editingBinding.binding = buildDefaultBinding(newAction);
    renderBindingEditorForm();
  });

  focusBindingEditorField();
}

function renderActionParams(form: HTMLElement, binding: any): void {
  switch (binding.action) {
    case 'keyboard': {
      const keysValue = Array.isArray(binding.keys) ? binding.keys.join(',') : '';
      form.appendChild(createEditorField('Keys (comma-separated)', `
        <input type="text" id="bindingEditorKeys" value="${keysValue}" placeholder="e.g. Clear or Ctrl,c" />
      `));
      break;
    }
    case 'voice': {
      const holdDuration = binding.holdDuration || 3000;
      form.appendChild(createEditorField('Hold Duration (ms)', `
        <input type="number" id="bindingEditorHoldDuration" value="${holdDuration}" min="100" step="100" />
      `));
      break;
    }
    case 'openwhisper': {
      const recordingDuration = binding.recordingDuration || 5000;
      form.appendChild(createEditorField('Recording Duration (ms)', `
        <input type="number" id="bindingEditorRecordingDuration" value="${recordingDuration}" min="1000" step="500" />
      `));
      break;
    }
    case 'session-switch': {
      const dirOptions = ['previous', 'next'].map(d =>
        `<option value="${d}" ${d === binding.direction ? 'selected' : ''}>${d}</option>`
      ).join('');
      form.appendChild(createEditorField('Direction', `
        <select id="bindingEditorDirection">${dirOptions}</select>
      `));
      break;
    }
    case 'spawn': {
      const spawnOptions = state.cliTypes.map(ct =>
        `<option value="${ct}" ${ct === binding.cliType ? 'selected' : ''}>${getCliDisplayName(ct)} (${ct})</option>`
      ).join('');
      form.appendChild(createEditorField('CLI Type', `
        <select id="bindingEditorCliType">${spawnOptions}</select>
      `));
      break;
    }
    case 'list-sessions':
      // No additional parameters
      form.appendChild(createEditorField('Parameters', `
        <input type="text" value="No additional parameters" disabled />
      `, true));
      break;
    case 'profile-switch': {
      const profDirOptions = ['previous', 'next'].map(d =>
        `<option value="${d}" ${d === binding.direction ? 'selected' : ''}>${d}</option>`
      ).join('');
      form.appendChild(createEditorField('Direction', `
        <select id="bindingEditorDirection">${profDirOptions}</select>
      `));
      break;
    }
  }
}

function createEditorField(label: string, inputHtml: string, readonly = false): HTMLElement {
  const field = document.createElement('div');
  field.className = `binding-editor-field${readonly ? ' binding-editor-field--readonly' : ''}`;
  field.innerHTML = `<label>${label}</label>${inputHtml}`;
  return field;
}

function buildDefaultBinding(action: string): any {
  switch (action) {
    case 'keyboard':
      return { action: 'keyboard', keys: [] };
    case 'voice':
      return { action: 'voice', holdDuration: 3000 };
    case 'openwhisper':
      return { action: 'openwhisper', recordingDuration: 5000 };
    case 'session-switch':
      return { action: 'session-switch', direction: 'next' };
    case 'spawn':
      return { action: 'spawn', cliType: state.cliTypes[0] || 'generic-terminal' };
    case 'list-sessions':
      return { action: 'list-sessions' };
    case 'profile-switch':
      return { action: 'profile-switch', direction: 'next' };
    default:
      return { action };
  }
}

function collectBindingFromForm(): any | null {
  if (!state.editingBinding) return null;

  const actionSelect = document.getElementById('bindingEditorAction') as HTMLSelectElement;
  if (!actionSelect) return null;

  const action = actionSelect.value;

  switch (action) {
    case 'keyboard': {
      const keysInput = document.getElementById('bindingEditorKeys') as HTMLInputElement;
      const keysStr = keysInput?.value?.trim() || '';
      const keys = keysStr ? keysStr.split(',').map(k => k.trim()).filter(Boolean) : [];
      return { action: 'keyboard', keys };
    }
    case 'voice': {
      const durationInput = document.getElementById('bindingEditorHoldDuration') as HTMLInputElement;
      const holdDuration = parseInt(durationInput?.value || '3000', 10);
      return { action: 'voice', holdDuration };
    }
    case 'openwhisper': {
      const durationInput = document.getElementById('bindingEditorRecordingDuration') as HTMLInputElement;
      const recordingDuration = parseInt(durationInput?.value || '5000', 10);
      return { action: 'openwhisper', recordingDuration };
    }
    case 'session-switch': {
      const dirSelect = document.getElementById('bindingEditorDirection') as HTMLSelectElement;
      return { action: 'session-switch', direction: dirSelect?.value || 'next' };
    }
    case 'spawn': {
      const typeSelect = document.getElementById('bindingEditorCliType') as HTMLSelectElement;
      return { action: 'spawn', cliType: typeSelect?.value || 'generic-terminal' };
    }
    case 'list-sessions':
      return { action: 'list-sessions' };
    case 'profile-switch': {
      const profDirSelect = document.getElementById('bindingEditorDirection') as HTMLSelectElement;
      return { action: 'profile-switch', direction: profDirSelect?.value || 'next' };
    }
    default:
      return null;
  }
}

async function saveBinding(): Promise<void> {
  if (!state.editingBinding || !window.gamepadCli) return;

  const binding = collectBindingFromForm();
  if (!binding) {
    logEvent('Save failed: could not read form');
    return;
  }

  const { button, cliType } = state.editingBinding;

  try {
    const result = await window.gamepadCli.configSetBinding(button, cliType, binding);
    if (result.success) {
      logEvent(`Saved binding: ${button} → ${binding.action}`);

      // Update local caches so dispatch uses new bindings immediately
      if (cliType === null) {
        if (state.globalBindings) {
          state.globalBindings[button] = binding;
        }
      } else {
        if (state.cliBindingsCache[cliType]) {
          state.cliBindingsCache[cliType][button] = binding;
        }
      }

      closeBindingEditor();
      loadSettingsScreen();
    } else {
      logEvent(`Save failed: ${result.error || 'unknown error'}`);
    }
  } catch (error) {
    console.error('Failed to save binding:', error);
    logEvent(`Save error: ${error}`);
  }
}

function closeBindingEditor(): void {
  state.bindingEditorVisible = false;
  state.editingBinding = null;

  const modal = document.getElementById('bindingEditorModal');
  if (modal) {
    modal.classList.remove('modal--visible');
    modal.setAttribute('aria-hidden', 'true');
  }
}

function getBindingEditorFocusables(): HTMLElement[] {
  const form = document.getElementById('bindingEditorForm');
  if (!form) return [];
  return Array.from(form.querySelectorAll<HTMLElement>('select:not([disabled]), input:not([disabled])'));
}

function focusBindingEditorField(): void {
  const fields = getBindingEditorFocusables();
  if (fields.length === 0) return;
  if (state.bindingEditorFocusIndex >= fields.length) {
    state.bindingEditorFocusIndex = fields.length - 1;
  }
  fields[state.bindingEditorFocusIndex]?.focus();
}

function handleBindingEditorButton(button: string): void {
  switch (button) {
    case 'Up': {
      const fields = getBindingEditorFocusables();
      state.bindingEditorFocusIndex = Math.max(0, state.bindingEditorFocusIndex - 1);
      if (fields[state.bindingEditorFocusIndex]) {
        fields[state.bindingEditorFocusIndex].focus();
      }
      break;
    }
    case 'Down': {
      const fields = getBindingEditorFocusables();
      state.bindingEditorFocusIndex = Math.min(fields.length - 1, state.bindingEditorFocusIndex + 1);
      if (fields[state.bindingEditorFocusIndex]) {
        fields[state.bindingEditorFocusIndex].focus();
      }
      break;
    }
    case 'A':
      saveBinding();
      break;
    case 'B':
      closeBindingEditor();
      logEvent('Binding edit cancelled');
      break;
  }
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Handle cleanup
window.addEventListener('beforeunload', () => {
  gamepadUnsubscribe?.();
  connectionUnsubscribe?.();
  browserGamepadUnsubscribe?.();
  browserGamepad.stop();
});
