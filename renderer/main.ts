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

  // Handle button presses based on current screen
  switch (state.currentScreen) {
    case 'sessions':
      handleSessionsScreenButton(event.button);
      break;
    case 'settings':
      handleSettingsScreenButton(event.button);
      break;
    case 'status':
      handleStatusScreenButton(event.button);
      break;
  }
}

function handleSessionsScreenButton(button: string): void {
  switch (button) {
    case 'Up':
      navigateFocus(-1);
      break;
    case 'Down':
      navigateFocus(1);
      break;
    case 'A':
      activateFocusedItem();
      break;
    case 'X':
      showScreen('settings');
      break;
    case 'Y':
      showScreen('status');
      break;
  }
}

function handleSettingsScreenButton(button: string): void {
  switch (button) {
    case 'B':
      showScreen('sessions');
      break;
  }
}

function handleStatusScreenButton(button: string): void {
  switch (button) {
    case 'B':
      showScreen('sessions');
      break;
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

  // Spawn button
  document.getElementById('spawnBtn')?.addEventListener('click', spawnNewSession);

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

async function spawnNewSession(): Promise<void> {
  // Spawn the first available CLI type
  const cliType = state.availableSpawnTypes[0] || 'generic-terminal';

  try {
    logEvent(`Spawning ${cliType}...`);
    const result = await window.gamepadCli.spawnCli(cliType);
    if (result.success) {
      logEvent(`Spawned: PID ${result.pid}`);

      // Refresh sessions to pick up the new window
      setTimeout(async () => {
        const refreshResult = await window.gamepadCli.sessionRefresh();
        if (refreshResult.success) {
          await loadSessions();
        }
      }, 500); // Wait a bit for the window to open
    } else {
      logEvent(`Spawn failed: ${result.error || 'Unknown error'}`);
    }
  } catch (error) {
    console.error('Failed to spawn session:', error);
    logEvent('Spawn failed');
  }
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

  // Load bindings for settings display
  await loadBindings();

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

async function loadBindings(): Promise<void> {
  try {
    if (!window.gamepadCli) {
      console.warn('[Renderer] gamepadCli not available — cannot load bindings');
      return;
    }
    const globalBindings = await window.gamepadCli.configGetGlobalBindings();
    renderBindings(globalBindings, 'Global');
  } catch (error) {
    console.error('Failed to load bindings:', error);
  }
}

function renderBindings(bindings: Record<string, any>, typeName: string): void {
  const bindingsList = document.getElementById('bindingsList');
  if (!bindingsList) return;

  bindingsList.innerHTML = '';

  for (const [button, binding] of Object.entries(bindings)) {
    const item = document.createElement('div');
    item.className = 'binding-item';
    item.innerHTML = `
      <span class="binding-button">${button}</span>
      <span class="binding-action">${binding.action || 'unknown'}</span>
    `;
    bindingsList.appendChild(item);
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
