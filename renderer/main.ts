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
import { loadSessions, updateSessionHighlight, syncSessionHighlight, setDirPickerBridge, setTerminalManagerGetter, hideTerminalArea, setSessionActivity, setSessionState, getSessionState, getSessionActivity, getTabCycleSessionIds } from './screens/sessions.js';
import { loadSettingsScreen } from './screens/settings.js';
import {
  setupGamepadNavigation,
  browserGamepadUnsubscribe,
} from './navigation.js';
import { hideDirPicker, showDirPicker, handleDirPickerButton } from './modals/dir-picker.js';
import { closeBindingEditor, saveBinding } from './modals/binding-editor.js';
import { TerminalManager } from './terminal/terminal-manager.js';
import { setupKeyboardRelay } from './paste-handler.js';
import { initContextMenuClickHandlers } from './modals/context-menu.js';
import { initSequencePickerClickHandlers } from './modals/sequence-picker.js';
import { initCloseConfirmClickHandlers } from './modals/close-confirm.js';
import { initQuickSpawnClickHandlers, hideQuickSpawn } from './modals/quick-spawn.js';
import { resolveNextTerminalId } from './tab-cycling.js';
import { setOutputBuffer, setSessionStateGetter, setActivityLevelGetter, setTerminalManagerGetter as setOverviewTerminalManagerGetter, refreshOverview, isOverviewVisible } from './screens/group-overview.js';

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
setDirPickerBridge((cliType, dirs, preselectedPath) => showDirPicker(cliType, dirs, preselectedPath));

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

  // Open logs folder button (in sidebar header)
  document.getElementById('openLogsBtn')?.addEventListener('click', () => {
    window.gamepadCli?.systemOpenLogsFolder();
    logEvent('Opening logs folder');
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

  // Directory picker select button
  document.getElementById('dirPickerSelectBtn')?.addEventListener('click', () => {
    handleDirPickerButton('A');
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

  // Keyboard relay — routes typed text and paste to active PTY
  setupKeyboardRelay(() => terminalManager?.getActiveSessionId() ?? null);

  // Panel splitter drag
  setupPanelSplitter();
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
      // Skip when any modal overlay is visible — modal keyboard handler owns all keys
      if (document.querySelector('.modal-overlay.modal--visible')) return;
      e.preventDefault();
      e.stopPropagation();
      const tm = terminalManager;
      if (!tm) return;
      // Use navList-derived visual order so Ctrl+Tab matches what the user sees.
      const nextId = resolveNextTerminalId(
        getTabCycleSessionIds(),
        tm.getSessionIds(),
        tm.getActiveSessionId(),
        e.shiftKey ? -1 : 1,
      );
      if (nextId) tm.switchTo(nextId);
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

  // Load D-pad and stick repeat config into the gamepad poller
  try {
    if (window.gamepadCli?.configGetDpadConfig && window.gamepadCli?.configGetStickConfig) {
      const dpadConfig = await window.gamepadCli.configGetDpadConfig();
      const leftStick = await window.gamepadCli.configGetStickConfig('left');
      const rightStick = await window.gamepadCli.configGetStickConfig('right');

      browserGamepad.setRepeatConfig({
        dpad: {
          initialDelay: dpadConfig?.initialDelay ?? 400,
          repeatRate: dpadConfig?.repeatRate ?? 120,
        },
        sticks: {
          left: {
            deadzone: leftStick?.deadzone ?? 0.25,
            repeatRate: leftStick?.repeatRate ?? 100,
          },
          right: {
            deadzone: rightStick?.deadzone ?? 0.25,
            repeatRate: rightStick?.repeatRate ?? 150,
          },
        },
      });
    }
  } catch (error) {
    console.error('[Renderer] Failed to load repeat config:', error);
  }

  // Initialize embedded terminal manager
  try {
    const terminalContainer = document.getElementById('terminalContainer');
    if (terminalContainer) {
      terminalManager = new TerminalManager(terminalContainer);
      setOutputBuffer(terminalManager.getOutputBuffer());
      setSessionStateGetter(getSessionState);
      setActivityLevelGetter(getSessionActivity);
      setOverviewTerminalManagerGetter(() => terminalManager);
      terminalManager.setOnEmpty(() => {
        hideTerminalArea();
      });
      terminalManager.setOnSwitch((sessionId) => {
        if (sessionId) syncSessionHighlight(sessionId);
      });
      terminalManager.setOnTitleChange((sessionId, title) => {
        const session = state.sessions.find(s => s.id === sessionId);
        if (session) {
          session.title = title;
          import('./screens/sessions-render.js').then(m => m.renderSessions());
          if (isOverviewVisible()) refreshOverview();
        }
      });
      console.log('[Renderer] Terminal manager initialized');

      // Wire context menu click handlers
      initContextMenuClickHandlers();

      // Wire sequence picker click handlers
      initSequencePickerClickHandlers();

      // Wire close confirm modal click handlers
      initCloseConfirmClickHandlers();

      // Wire quick spawn modal click handlers
      initQuickSpawnClickHandlers();

      // Quick spawn cancel button
      document.getElementById('quickSpawnCancelBtn')?.addEventListener('click', () => {
        hideQuickSpawn();
      });

      // Click on terminal area → focus terminal
      const terminalArea = document.getElementById('terminalArea');
      terminalArea?.addEventListener('mousedown', () => {
        if (terminalManager?.getActiveSessionId()) {
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

  // Load initial data
  await loadSessions();

  // Auto-resume sessions restored from previous run
  try {
    const restoredSessions = await window.gamepadCli?.sessionGetAll();
    if (restoredSessions && restoredSessions.length > 0 && terminalManager) {
      const terminalIds = terminalManager.getSessionIds();
      const { doSpawn } = await import('./screens/sessions-spawn.js');
      for (const session of restoredSessions) {
        // Session in main process but no terminal = restored from disk, needs resume
        if (session.cliSessionName && !terminalIds.includes(session.id)) {
          try {
            console.log(`[AutoResume] Resuming session: ${session.id} (${session.cliType}) with name ${session.cliSessionName}`);
            // Spawn fresh terminal with CLI resume command first
            await doSpawn(session.cliType, session.workingDir, undefined, session.cliSessionName);
            // Restore custom display name if user had renamed the session
            const newId = terminalManager.getActiveSessionId();
            if (newId && session.name && session.name !== session.cliType) {
              await window.gamepadCli?.sessionRename(newId, session.name);
              terminalManager.renameSession(newId, session.name);
            }
            // Only remove stale session metadata after successful spawn
            await window.gamepadCli?.sessionRemove(session.id);
          } catch (err) {
            console.error(`[AutoResume] Failed to resume session ${session.id}:`, err);
          }
        }
      }
    }
  } catch (err) {
    console.error('[AutoResume] Failed to load sessions for resume:', err);
  }

  // Setup PTY state change listener
  if (window.gamepadCli) {
    window.gamepadCli.onPtyStateChange((transition) => {
      // Update local session state cache (also triggers re-render)
      setSessionState(transition.sessionId, transition.newState);

      // Update actual session data
      const sessionIndex = state.sessions.findIndex(s => s.id === transition.sessionId);
      if (sessionIndex !== -1) {
        state.sessions[sessionIndex].state = transition.newState as any;
      }

      // Auto-handoff is handled by the main process via pty:handoff event
    });

    // Setup PTY activity change listener
    window.gamepadCli.onPtyActivityChange((event) => {
      // Update local activity cache (also triggers re-render)
      setSessionActivity(event.sessionId, event.level);
    });

    // Setup notification click listener (focus + switch to session)
    window.gamepadCli.onNotificationClick((event) => {
      const session = state.sessions.find(s => s.id === event.sessionId);
      if (session) {
        state.activeSessionId = session.id;
        window.gamepadCli?.sessionSetActive(session.id);
        terminalManager.switchTo(session.id);
        updateSessionHighlight();
      }
    });

    // Adopt externally-spawned sessions (e.g. from Telegram bot)
    window.gamepadCli.onSessionSpawned(async (session) => {
      if (!terminalManager || terminalManager.has(session.id)) return;
      console.log(`[ExternalSpawn] Adopting session: ${session.id} (${session.cliType})`);
      terminalManager.adoptTerminal(session.id, session.cliType, session.workingDir);
      const { showTerminalArea } = await import('./screens/sessions-spawn.js');
      showTerminalArea();
      await loadSessions();
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
  browserGamepadUnsubscribe?.();
  browserGamepad.stop();
});
