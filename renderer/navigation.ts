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
import { planDeleteConfirmState, handlePlanDeleteConfirmButton } from './modals/plan-delete-confirm.js';
import { quickSpawnState, handleQuickSpawnButton } from './modals/quick-spawn.js';
import { isDraftSubmenuVisible, handleDraftSubmenuButton, isDraftActionVisible, handleDraftActionButton } from './modals/draft-submenu.js';
import { isDraftEditorVisible, handleDraftEditorButton } from './drafts/draft-editor.js';
import { formModalVisible } from './utils.js';
import { getTerminalManager } from './main.js';
import { sessionsState } from './screens/sessions-state.js';
import { handleOverviewInput, isOverviewVisible, setSelectCardCallback } from './screens/group-overview.js';
import { findNavIndexBySessionId } from './session-groups.js';
import { updateSessionsFocus } from './screens/sessions.js';
import { isPlanScreenVisible, hidePlanScreen, handlePlanScreenDpad, handlePlanScreenAction } from './plans/plan-screen.js';
import { currentView } from './main-view/main-view-manager.js';

function handlePlanScreenButton(button: string): boolean {
  const dir = toDirection(button);
  if (dir) {
    return handlePlanScreenDpad(dir);
  }
  if (button === 'B') {
    hidePlanScreen();
    return true;
  }
  return handlePlanScreenAction(button);
}

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

  // Plan delete confirmation modal intercepts all input when visible
  if (planDeleteConfirmState.visible) {
    handlePlanDeleteConfirmButton(event.button);
    return;
  }

  // Quick-spawn CLI type picker intercepts all input when visible
  if (quickSpawnState.visible) {
    handleQuickSpawnButton(event.button);
    return;
  }

  // Draft editor captures gamepad for field navigation (D-pad/A/B)
  if (isDraftEditorVisible()) {
    handleDraftEditorButton(event.button);
    return;
  }

  // Draft action picker intercepts all input when visible
  if (isDraftActionVisible()) {
    handleDraftActionButton(event.button);
    return;
  }

  // Draft submenu intercepts all input when visible
  if (isDraftSubmenuVisible()) {
    handleDraftSubmenuButton(event.button);
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
      // Right-panel view determines input routing.
      const view = currentView();
      if (view === 'plan') {
        consumed = handlePlanScreenButton(event.button);
        break;
      }
      if (view === 'overview') {
        consumed = handleOverviewInput(event.button);
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
