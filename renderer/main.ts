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
import { loadSessions, updateSessionHighlight, setDirPickerBridge } from './screens/sessions.js';
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
// Cross-module wiring (breaks circular dependencies)
// ============================================================================

// Let showScreen trigger settings load without a circular import
setLoadSettingsCallback(() => loadSettingsScreen());

// Let sessions.spawnNewSession open the dir picker without importing the modal
setDirPickerBridge((cliType, dirs) => showDirPicker(cliType, dirs));

// ============================================================================
// UI Event Handlers
// ============================================================================

function setupUIHandlers(): void {
  // Settings button (in sidebar header)
  document.getElementById('settingsBtn')?.addEventListener('click', () => {
    showScreen('settings');
  });

  // Settings back button
  document.getElementById('settingsBackBtn')?.addEventListener('click', () => {
    showScreen('sessions');
  });

  // Sidebar pin toggle
  document.getElementById('pinBtn')?.addEventListener('click', async () => {
    try {
      const result = await window.gamepadCli?.sidebarTogglePin();
      if (result?.success) {
        const btn = document.getElementById('pinBtn');
        if (btn) btn.textContent = result.pinned ? '📌' : '📍';
        logEvent(result.pinned ? 'Pinned on top' : 'Unpinned');
      }
    } catch (e) { console.error('[Renderer] Pin toggle failed:', e); }
  });

  // Sidebar side toggle (left ↔ right)
  document.getElementById('sideToggleBtn')?.addEventListener('click', async () => {
    try {
      const result = await window.gamepadCli?.sidebarToggleSide();
      if (result?.success) {
        logEvent(`Snapped ${result.side}`);
      }
    } catch (e) { console.error('[Renderer] Side toggle failed:', e); }
  });

  // Close debug log
  document.getElementById('closeDebugLog')?.addEventListener('click', () => {
    const debugLogEl = document.getElementById('debugLog');
    if (debugLogEl) {
      debugLogEl.style.display = 'none';
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
      const debugLogEl = document.getElementById('debugLog');
      if (debugLogEl) {
        debugLogEl.style.display = debugLogEl.style.display === 'none' ? 'flex' : 'none';
      }
    }
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
  // (Now handled by the sessions screen launcher panels)

  // Cache config bindings for fast gamepad dispatch
  await initConfigCache();

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
  gamepadUnsubscribe?.();
  connectionUnsubscribe?.();
  browserGamepadUnsubscribe?.();
  browserGamepad.stop();
});
