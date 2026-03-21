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
      handleConnectionEvent({ connected: true, count: 1, timestamp: event.timestamp });
    } else if (event.button === '_disconnected') {
      handleConnectionEvent({ connected: false, count: 0, timestamp: event.timestamp });
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

  // Directory picker modal intercepts all input when visible
  if (state.dirPickerVisible) {
    handleDirPickerButton(event.button);
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
  const allTabs = ['global', ...state.cliTypes];
  const currentIndex = allTabs.indexOf(state.settingsTab);
  let nextIndex = currentIndex + direction;
  if (nextIndex < 0) nextIndex = allTabs.length - 1;
  if (nextIndex >= allTabs.length) nextIndex = 0;
  state.settingsTab = allTabs[nextIndex];
  loadSettingsScreen();
}

function activateSettingsFocused(): void {
  const active = document.activeElement as HTMLElement;
  if (active?.classList.contains('settings-tab')) {
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
  console.log('[Renderer] Debug log override active');
  console.log('[Renderer] navigator.gamepad API exists:', typeof navigator.getGamepads === 'function');

  // Setup gamepad navigation
  setupGamepadNavigation();
  console.log('[Renderer] Gamepad navigation setup complete');

  // Setup UI event handlers
  setupUIHandlers();

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
  try {
    if (window.gamepadCli) {
      await window.gamepadCli.configGetAll();
    }
  } catch (error) {
    console.warn('[Renderer] Failed to warm up config:', error);
  }

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

    if (state.settingsTab === 'global') {
      const bindings = state.globalBindings
        || (window.gamepadCli ? await window.gamepadCli.configGetGlobalBindings() : {});
      renderBindingsDisplay(bindings || {}, 'Global Bindings');
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
    { key: 'global', label: 'Global' },
    ...cliTypes.map(ct => ({ key: ct, label: getCliDisplayName(ct) })),
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
    return;
  }

  entries.forEach(([button, binding]) => {
    const card = document.createElement('div');
    card.className = 'binding-card';

    const actionType = binding.action || 'unknown';
    const details = formatBindingDetails(binding);

    card.innerHTML = `
      <div class="binding-card__header">
        <span class="binding-card__button">${button}</span>
        <span class="binding-card__action-badge">${actionType}</span>
      </div>
      <div class="binding-card__details">${details}</div>
    `;
    container.appendChild(card);
  });
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
    default:
      return JSON.stringify(binding);
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
