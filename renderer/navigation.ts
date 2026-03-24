/**
 * Gamepad navigation — browser API poller + IPC event subscriptions.
 */

import { state, type ButtonEvent } from './state.js';
import { browserGamepad } from './gamepad.js';
import { logEvent } from './utils.js';
import { processConfigBinding } from './bindings.js';
import { handleSessionsScreenButton } from './screens/sessions.js';
import { handleSettingsScreenButton } from './screens/settings.js';
import { handleStatusScreenButton } from './screens/status.js';
import { handleDirPickerButton } from './modals/dir-picker.js';
import { dirPickerState } from './modals/dir-picker.js';
import { handleBindingEditorButton } from './modals/binding-editor.js';
import { bindingEditorState } from './modals/binding-editor.js';
import { isHudVisible, handleHudButton, toggleHud } from './modals/session-hud.js';

// ============================================================================
// Unsubscribe handles (exported so main.ts can clean up)
// ============================================================================

export let gamepadUnsubscribe: (() => void) | null = null;
export let connectionUnsubscribe: (() => void) | null = null;
export let browserGamepadUnsubscribe: (() => void) | null = null;

// ============================================================================
// Setup
// ============================================================================

export function setupGamepadNavigation(): void {
  console.log('[Renderer] setupGamepadNavigation: START');

  // PRIORITY: Start browser gamepad poller FIRST (works with BT controllers)
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

// ============================================================================
// Event Handlers
// ============================================================================

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

export function handleGamepadEvent(event: ButtonEvent): void {
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

  // Session HUD overlay intercepts all input when visible
  if (isHudVisible()) {
    handleHudButton(event.button);
    return;
  }

  // Sandwich button toggles the Session HUD from any screen
  if (event.button === 'Sandwich') {
    toggleHud();
    return;
  }

  // Directory picker modal intercepts all input when visible
  if (dirPickerState.visible) {
    handleDirPickerButton(event.button);
    return;
  }

  // Binding editor modal intercepts all input when visible
  if (bindingEditorState.visible) {
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

// ============================================================================
// Helpers
// ============================================================================

export async function updateGamepadCount(): Promise<void> {
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
