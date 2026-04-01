/**
 * Gamepad navigation — browser API poller only.
 *
 * XInput/IPC path removed — the Browser Gamepad API handles both USB and
 * Bluetooth controllers natively via Chromium.
 */

import { state, type ButtonEvent } from './state.js';
import { browserGamepad } from './gamepad.js';
import { logEvent, showScreen, toDirection } from './utils.js';
import { processConfigBinding, processConfigRelease } from './bindings.js';
import { handleSessionsScreenButton, switchToSession, showTerminalArea, hideTerminalArea, getSessionState } from './screens/sessions.js';
import { handleSettingsScreenButton } from './screens/settings.js';
import { handleDirPickerButton } from './modals/dir-picker.js';
import { dirPickerState } from './modals/dir-picker.js';
import { handleBindingEditorButton } from './modals/binding-editor.js';
import { bindingEditorState } from './modals/binding-editor.js';
import { contextMenuState, handleContextMenuButton } from './modals/context-menu.js';
import { sequencePickerState, handleSequencePickerButton } from './modals/sequence-picker.js';
import { closeConfirmState, handleCloseConfirmButton } from './modals/close-confirm.js';
import { quickSpawnState, handleQuickSpawnButton } from './modals/quick-spawn.js';
import { formModalVisible } from './utils.js';
import { getTerminalManager } from './main.js';
import { sessionsState } from './screens/sessions-state.js';
import { hideOverview, getOverviewSessions, updateOverviewFocus, setSelectCardCallback } from './screens/group-overview.js';
import { findNavIndexBySessionId } from './session-groups.js';
import { updateSessionsFocus } from './screens/sessions.js';

// ============================================================================
// Unsubscribe handles (exported so main.ts can clean up)
// ============================================================================

export let browserGamepadUnsubscribe: (() => void) | null = null;
export let releaseUnsubscribe: (() => void) | null = null;

// ============================================================================
// Setup
// ============================================================================

export function setupGamepadNavigation(): void {
  console.log('[Renderer] setupGamepadNavigation: START');

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

  releaseUnsubscribe = browserGamepad.onRelease((event) => {
    handleGamepadRelease(event);
  });

  // Update initial count from browser
  state.gamepadCount = browserGamepad.getCount();
  const countEl = document.getElementById('gamepadCount');
  const statusEl = document.getElementById('statusGamepadConnected');
  const dotEl = document.getElementById('gamepadDot');
  if (countEl) countEl.textContent = state.gamepadCount.toString();
  if (statusEl) statusEl.textContent = state.gamepadCount > 0 ? 'Yes' : 'No';
  if (dotEl) dotEl.classList.toggle('connected', state.gamepadCount > 0);
  console.log('[Renderer] setupGamepadNavigation: END, count:', state.gamepadCount);

  // Wire overview card click → session switch + sidebar sync
  setSelectCardCallback((sessionId) => {
    switchToSession(sessionId);
    const navIdx = findNavIndexBySessionId(sessionsState.navList, sessionId);
    if (navIdx >= 0) {
      sessionsState.sessionsFocusIndex = navIdx;
      sessionsState.cardColumn = 0;
      state.activeSessionId = sessionId;
      updateSessionsFocus();
    }
  });
}

// ============================================================================
// Event Handlers
// ============================================================================

function handleConnectionEvent(event: { connected: boolean; count: number; timestamp: number }): void {
  console.log('[Renderer] handleConnectionEvent:', event);
  state.gamepadCount = event.count;

  const countEl = document.getElementById('gamepadCount');
  const statusEl = document.getElementById('statusGamepadConnected');
  const dotEl = document.getElementById('gamepadDot');

  console.log('[Renderer] Updating UI - countEl:', countEl, 'statusEl:', statusEl);

  if (countEl) countEl.textContent = event.count.toString();
  if (statusEl) statusEl.textContent = event.connected ? 'Yes' : 'No';
  if (dotEl) dotEl.classList.toggle('connected', event.count > 0);

  logEvent(`Gamepad ${event.connected ? 'connected' : 'disconnected'}`);
}

export function handleGamepadEvent(event: ButtonEvent): void {
  logEvent(`⬇ ${event.button}`);

  // Update status
  const lastBtnEl = document.getElementById('statusLastButton');
  if (lastBtnEl) lastBtnEl.textContent = event.button;

  // If receiving button events, ensure gamepad count is updated
  if (state.gamepadCount === 0) {
    const count = browserGamepad.getCount();
    if (count > 0) {
      handleConnectionEvent({ connected: true, count, timestamp: event.timestamp });
    }
  }

  // Sandwich button shows sessions screen
  if (event.button === 'Sandwich') {
    if (state.currentScreen !== 'sessions') {
      showScreen('sessions');
    }
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

  // Form modal intercepts A/B when visible
  if (formModalVisible) {
    if (event.button === 'A') {
      document.getElementById('formModalSaveBtn')?.click();
    } else if (event.button === 'B') {
      document.getElementById('formModalCancelBtn')?.click();
    }
    // Swallow all other buttons while form modal is open
    return;
  }

  // Close confirmation modal intercepts all input when visible
  if (closeConfirmState.visible) {
    handleCloseConfirmButton(event.button);
    return;
  }

  // Quick-spawn CLI type picker intercepts all input when visible
  if (quickSpawnState.visible) {
    handleQuickSpawnButton(event.button);
    return;
  }

  // Context menu intercepts all input when visible
  if (contextMenuState.visible) {
    handleContextMenuButton(event.button);
    return;
  }

  // Sequence picker intercepts all input when visible
  if (sequencePickerState.visible) {
    handleSequencePickerButton(event.button);
    return;
  }

  // UI navigation consumes the event first; config bindings only fire for unconsumed buttons
  let consumed = false;
  switch (state.currentScreen) {
    case 'sessions': {
      // Check if overview is visible — route to overview handler
      if (sessionsState.overviewGroup) {
        consumed = handleOverviewButton(event.button);
      } else {
        consumed = handleSessionsScreenButton(event.button);
      }
      break;
    }
    case 'settings':
      consumed = handleSettingsScreenButton(event.button);
      break;
  }

  if (!consumed) {
    processConfigBinding(event.button);
  }
}

function handleGamepadRelease(event: ButtonEvent): void {
  logEvent(`⬆ ${event.button}`);
  processConfigRelease(event.button);
}

function handleOverviewButton(button: string): boolean {
  const dir = toDirection(button);
  const sessions = getOverviewSessions();
  const count = sessions.length;
  if (count === 0) return false;

  const cols = 2;
  const idx = sessionsState.overviewFocusIndex;
  const row = Math.floor(idx / cols);
  const col = idx % cols;
  const totalRows = Math.ceil(count / cols);

  if (dir === 'up') {
    if (row > 0) {
      sessionsState.overviewFocusIndex = (row - 1) * cols + col;
      updateOverviewFocus();
    }
    return true;
  }
  if (dir === 'down') {
    const newIdx = (row + 1) * cols + col;
    if (row + 1 < totalRows && newIdx < count) {
      sessionsState.overviewFocusIndex = newIdx;
      updateOverviewFocus();
    }
    return true;
  }
  if (dir === 'left') {
    if (col > 0) {
      sessionsState.overviewFocusIndex = idx - 1;
      updateOverviewFocus();
    } else {
      // Column 0, left → exit overview, return to session list
      hideOverview();
      // Restore terminal area for active session
      const tm = getTerminalManager();
      if (tm && tm.getActiveSessionId()) {
        showTerminalArea();
      } else {
        hideTerminalArea();
      }
    }
    return true;
  }
  if (dir === 'right') {
    if (col < cols - 1 && idx + 1 < count) {
      sessionsState.overviewFocusIndex = idx + 1;
      updateOverviewFocus();
    }
    return true;
  }

  if (button === 'A') {
    const session = sessions[sessionsState.overviewFocusIndex];
    if (session) {
      hideOverview();
      switchToSession(session.id);
      // Also select in sidebar
      const navIdx = findNavIndexBySessionId(sessionsState.navList, session.id);
      if (navIdx >= 0) {
        sessionsState.sessionsFocusIndex = navIdx;
        sessionsState.cardColumn = 0;
        state.activeSessionId = session.id;
        updateSessionsFocus();
      }
    }
    return true;
  }

  if (button === 'X') {
    // Close the focused session
    const session = sessions[sessionsState.overviewFocusIndex];
    if (session) {
      import('./modals/close-confirm.js').then(({ showCloseConfirm }) => {
        showCloseConfirm(session.id, session.name);
      });
    }
    return true;
  }

  // B consumed but no action
  if (button === 'B') return true;

  return false;
}


