/**
 * Renderer Process Main Entry
 *
 * Thin orchestrator — imports modules and wires them together at startup.
 * All logic lives in the individual modules under renderer/.
 */

import { browserGamepad } from './gamepad.js';
import { state } from './state.js';
import { logEvent, showScreen, setLoadSettingsCallback, updateProfileDisplay } from './utils.js';
import { initConfigCache } from './bindings.js';
import { loadSessions, updateSessionHighlight, syncSessionHighlight, setDirPickerBridge, setTerminalManagerGetter, hideTerminalArea } from './screens/sessions.js';
import { loadSettingsScreen } from './screens/settings.js';
import {
  setupGamepadNavigation,
  updateGamepadCount,
  gamepadUnsubscribe,
  connectionUnsubscribe,
  browserGamepadUnsubscribe,
} from './navigation.js';
import { hideDirPicker, showDirPicker } from './modals/dir-picker.js';
import { closeBindingEditor, saveBinding } from './modals/binding-editor.js';
import { TerminalManager } from './terminal/terminal-manager.js';

// ============================================================================
// Terminal Manager
// ============================================================================

let terminalManager: TerminalManager | null = null;

export function getTerminalManager(): TerminalManager | null {
  return terminalManager;
}

// ============================================================================
// Cross-module wiring (breaks circular dependencies)
// ============================================================================

// Let showScreen trigger settings load without a circular import
setLoadSettingsCallback(() => loadSettingsScreen());

// Let sessions.spawnNewSession open the dir picker without importing the modal
setDirPickerBridge((cliType, dirs) => showDirPicker(cliType, dirs));

// Let sessions.doSpawn access the terminal manager without importing main.ts
setTerminalManagerGetter(() => terminalManager);

// ============================================================================
// UI Event Handlers
// ============================================================================

const PANEL_WIDTH_KEY = 'gamepad-hub:panel-width';

function setupUIHandlers(): void {
  // Settings button (in sidebar header)
  document.getElementById('settingsBtn')?.addEventListener('click', () => {
    showScreen('settings');
  });

  // Settings back button
  document.getElementById('settingsBackBtn')?.addEventListener('click', () => {
    showScreen('sessions');
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

  // Restore persisted panel width
  const panel = document.getElementById('panelLeft');
  const saved = localStorage.getItem(PANEL_WIDTH_KEY);
  if (panel && saved) {
    const w = parseInt(saved, 10);
    if (w >= 200 && w <= 600) panel.style.width = `${w}px`;
  }

  // Panel splitter drag
  setupPanelSplitter();

  // Click on sidebar → unfocus terminal, return keyboard to sidebar navigation
  document.getElementById('panelLeft')?.addEventListener('mousedown', () => {
    state.terminalFocused = false;
  });
}

function setupPanelSplitter(): void {
  const splitter = document.getElementById('panelSplitter');
  const panel = document.getElementById('panelLeft');
  if (!splitter || !panel) return;

  let dragging = false;
  let startX = 0;
  let startWidth = 0;

  splitter.addEventListener('mousedown', (e: MouseEvent) => {
    e.preventDefault();
    dragging = true;
    startX = e.clientX;
    startWidth = panel.getBoundingClientRect().width;
    splitter.classList.add('panel-splitter--dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e: MouseEvent) => {
    if (!dragging) return;
    const newWidth = Math.max(200, Math.min(600, startWidth + (e.clientX - startX)));
    panel.style.width = `${newWidth}px`;
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    splitter.classList.remove('panel-splitter--dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    // Persist width
    const w = Math.round(panel.getBoundingClientRect().width);
    localStorage.setItem(PANEL_WIDTH_KEY, String(w));
    // Refit active terminal
    terminalManager?.fitActive?.();
  });
}

// ============================================================================
// Initialization
// ============================================================================

async function init(): Promise<void> {
  console.log('[Renderer] Initializing');
  console.log('[Renderer] navigator.gamepad API exists:', typeof navigator.getGamepads === 'function');

  // Global Ctrl+Tab / Ctrl+Shift+Tab to switch terminal tabs (capture phase
  // so it fires before xterm.js can swallow the event)
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Tab' && e.ctrlKey) {
      e.preventDefault();
      e.stopPropagation();
      const tm = terminalManager;
      if (!tm) return;
      const ids = tm.getSessionIds();
      const activeId = tm.getActiveSessionId();
      if (ids.length <= 1 || !activeId) return;
      const currentIdx = ids.indexOf(activeId);
      const direction = e.shiftKey ? -1 : 1;
      const newIdx = (currentIdx + direction + ids.length) % ids.length;
      tm.switchTo(ids[newIdx]);
      state.terminalFocused = true;
    }
  }, true);

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
  // (Now handled by the sessions screen launcher panels)

  // Cache config bindings for fast gamepad dispatch
  try {
    await initConfigCache();
  } catch (error) {
    console.error('[Renderer] Failed to init config cache:', error);
  }

  // Initialize embedded terminal manager
  try {
    const terminalContainer = document.getElementById('terminalContainer');
    if (terminalContainer) {
      terminalManager = new TerminalManager(terminalContainer);
      terminalManager.setOnEmpty(() => {
        hideTerminalArea();
        state.terminalFocused = false;
      });
      terminalManager.setOnSwitch((sessionId) => {
        syncSessionHighlight(sessionId);
      });
      console.log('[Renderer] Terminal manager initialized');

      // Click on terminal area → focus terminal
      const terminalArea = document.getElementById('terminalArea');
      terminalArea?.addEventListener('mousedown', () => {
        if (terminalManager?.getActiveSessionId()) {
          state.terminalFocused = true;
          terminalManager.focusActive();
        }
      });
    } else {
      console.error('[Renderer] #terminalContainer not found in DOM');
    }
  } catch (error) {
    console.error('[Renderer] Failed to init terminal manager:', error);
  }

  // Update profile display
  await updateProfileDisplay();

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

  // Start foreground sync to track which terminal is actually focused
  if (window.gamepadCli?.sessionStartForegroundSync) {
    try {
      await window.gamepadCli.sessionStartForegroundSync();
      console.log('[Renderer] Foreground sync started');
    } catch (error) {
      console.warn('[Renderer] Failed to start foreground sync:', error);
    }
  }

  // Listen for foreground window changes
  if (window.gamepadCli?.onForegroundChanged) {
    window.gamepadCli.onForegroundChanged((event) => {
      if (event.sessionId && event.sessionId !== state.activeSessionId) {
        console.log(`[Renderer] Foreground changed to session: ${event.sessionId}`);
        state.activeSessionId = event.sessionId;
        // Update UI highlight without triggering focus change
        updateSessionHighlight();
      } else if (!event.sessionId && state.activeSessionId) {
        // Foreground is not a tracked session — keep current highlight but could dim
        console.log('[Renderer] Foreground window is not a tracked session');
      }
    });
  }

  // Log initialization
  logEvent('App ready');

  console.log('[Renderer] Ready');
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Handle cleanup
window.addEventListener('beforeunload', () => {
  terminalManager?.dispose();
  gamepadUnsubscribe?.();
  connectionUnsubscribe?.();
  browserGamepadUnsubscribe?.();
  browserGamepad.stop();
});
