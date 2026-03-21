/**
 * IPC Handlers
 *
 * Handles all IPC communication between main and renderer processes.
 */

import { ipcMain, app, BrowserWindow } from 'electron';
import { gamepadInput } from '../../input/gamepad.js';
import { SessionManager } from '../../session/manager.js';
import { configLoader } from '../../config/loader.js';
import { windowManager } from '../../output/windows.js';
import { keyboard } from '../../output/keyboard.js';
import { processSpawner } from '../../session/spawner.js';

// ============================================================================
// Helpers
// ============================================================================

function detectCliTypeFromTitle(title: string): string {
  const lowerTitle = title.toLowerCase();

  if (lowerTitle.includes('claude') || lowerTitle.includes('cc')) {
    return 'claude-code';
  }
  if (lowerTitle.includes('copilot') || lowerTitle.includes('gh copilot')) {
    return 'copilot-cli';
  }

  return 'generic-terminal';
}

// ============================================================================
// Session Management (shared state)
// ============================================================================

const sessionManager = new SessionManager();

// ============================================================================
// Gamepad Events
// ============================================================================

function setupGamepadHandlers(): void {
  // Forward gamepad events to renderer
  gamepadInput.on('button-press', (event) => {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('gamepad:event', {
        button: event.button,
        gamepadIndex: event.gamepadIndex,
        timestamp: event.timestamp,
      });
    }
  });

  // Forward connection events to renderer
  gamepadInput.on('connection-change', (event) => {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('gamepad:connection', {
        connected: event.connected,
        count: event.count,
        timestamp: event.timestamp,
      });
    }
  });

  // Get connected gamepad count
  ipcMain.handle('gamepad:getCount', () => {
    return gamepadInput.getConnectedGamepadCount();
  });
}

// ============================================================================
// Session Handlers
// ============================================================================

function setupSessionHandlers(): void {
  // Refresh sessions from existing terminal windows
  ipcMain.handle('session:refresh', async () => {
    try {
      const terminals = await windowManager.findTerminalWindows();
      let addedCount = 0;

      for (const terminal of terminals) {
        const sessionId = `session-${terminal.processId}`;
        if (!sessionManager.getSession(sessionId)) {
          // Detect CLI type from window title
          const cliType = detectCliTypeFromTitle(terminal.title);
          const name = `${cliType} (${terminal.processId})`;

          sessionManager.addSession({
            id: sessionId,
            name,
            cliType,
            processId: terminal.processId,
            windowHandle: terminal.hwnd,
          });
          addedCount++;
        }
      }

      return { success: true, count: addedCount, total: sessionManager.getSessionCount() };
    } catch (error) {
      console.error('Failed to refresh sessions:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('session:getAll', () => {
    return sessionManager.getAllSessions();
  });

  ipcMain.handle('session:get', (_event, id: string) => {
    return sessionManager.getSession(id);
  });

  ipcMain.handle('session:setActive', (_event, id: string) => {
    sessionManager.setActiveSession(id);
    return sessionManager.getActiveSession();
  });

  ipcMain.handle('session:getActive', () => {
    return sessionManager.getActiveSession();
  });

  ipcMain.handle('session:add', (_event, session: { id: string; name: string; cliType: string; processId: number }) => {
    sessionManager.addSession({
      id: session.id,
      name: session.name,
      cliType: session.cliType,
      processId: session.processId,
      windowHandle: '', // Will be set when window is found
    });
    return { success: true };
  });

  ipcMain.handle('session:remove', (_event, id: string) => {
    sessionManager.removeSession(id);
    return { success: true };
  });

  ipcMain.handle('session:next', () => {
    sessionManager.nextSession();
    return sessionManager.getActiveSession();
  });

  ipcMain.handle('session:previous', () => {
    sessionManager.previousSession();
    return sessionManager.getActiveSession();
  });
}

// ============================================================================
// Configuration Handlers
// ============================================================================

function setupConfigHandlers(): void {
  ipcMain.handle('config:getAll', () => {
    try {
      configLoader.load();
      return {
        cliTypes: configLoader.getCliTypes(),
        globalBindings: configLoader.getGlobalBindings(),
        openwhisper: configLoader.getOpenWhisperConfig(),
      };
    } catch (error) {
      console.error('[IPC] Failed to get all config:', error);
      return { cliTypes: [], globalBindings: {}, openwhisper: null };
    }
  });

  ipcMain.handle('config:getGlobalBindings', () => {
    try {
      return configLoader.getGlobalBindings();
    } catch (error) {
      console.error('[IPC] Failed to get global bindings:', error);
      return {};
    }
  });

  ipcMain.handle('config:getBindings', (_event, cliType: string) => {
    try {
      return configLoader.getBindings(cliType);
    } catch (error) {
      console.error(`[IPC] Failed to get bindings for ${cliType}:`, error);
      return null;
    }
  });

  ipcMain.handle('config:getCliTypes', () => {
    try {
      return configLoader.getCliTypes();
    } catch (error) {
      console.error('[IPC] Failed to get CLI types:', error);
      return [];
    }
  });

  ipcMain.handle('config:setBinding', (_event, button: string, cliType: string | null, binding: any) => {
    try {
      configLoader.setBinding(button, cliType, binding);
      console.log(`[IPC] Set binding: ${button} for ${cliType || 'global'}`, binding);
      return { success: true };
    } catch (error) {
      console.error(`[IPC] Failed to set binding: ${button}`, error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('config:reload', () => {
    try {
      configLoader.load();
      console.log('[IPC] Config reloaded');
      return { success: true };
    } catch (error) {
      console.error('[IPC] Failed to reload config:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('config:getWorkingDirs', () => {
    try {
      return configLoader.getWorkingDirectories();
    } catch (error) {
      console.error('[IPC] Failed to get working dirs:', error);
      return [];
    }
  });

  // Working directory CRUD
  ipcMain.handle('config:addWorkingDir', (_event, name: string, dirPath: string) => {
    try {
      configLoader.addWorkingDirectory(name, dirPath);
      return { success: true };
    } catch (error) {
      console.error('[IPC] Failed to add working dir:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('config:updateWorkingDir', (_event, index: number, name: string, dirPath: string) => {
    try {
      configLoader.updateWorkingDirectory(index, name, dirPath);
      return { success: true };
    } catch (error) {
      console.error('[IPC] Failed to update working dir:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('config:removeWorkingDir', (_event, index: number) => {
    try {
      configLoader.removeWorkingDirectory(index);
      return { success: true };
    } catch (error) {
      console.error('[IPC] Failed to remove working dir:', error);
      return { success: false, error: String(error) };
    }
  });
}

// ============================================================================
// Profile Handlers
// ============================================================================

function setupProfileHandlers(): void {
  ipcMain.handle('profile:list', () => {
    try {
      return configLoader.listProfiles();
    } catch (error) {
      console.error('[IPC] Failed to list profiles:', error);
      return [];
    }
  });

  ipcMain.handle('profile:getActive', () => {
    try {
      return configLoader.getActiveProfile();
    } catch (error) {
      console.error('[IPC] Failed to get active profile:', error);
      return 'default';
    }
  });

  ipcMain.handle('profile:switch', (_event, name: string) => {
    try {
      configLoader.switchProfile(name);
      return { success: true };
    } catch (error) {
      console.error('[IPC] Failed to switch profile:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('profile:create', (_event, name: string, copyFrom?: string) => {
    try {
      configLoader.createProfile(name, copyFrom);
      return { success: true };
    } catch (error) {
      console.error('[IPC] Failed to create profile:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('profile:delete', (_event, name: string) => {
    try {
      configLoader.deleteProfile(name);
      return { success: true };
    } catch (error) {
      console.error('[IPC] Failed to delete profile:', error);
      return { success: false, error: String(error) };
    }
  });
}

// ============================================================================
// Tools Handlers
// ============================================================================

function setupToolsHandlers(): void {
  ipcMain.handle('tools:getAll', () => {
    try {
      return {
        cliTypes: Object.fromEntries(
          configLoader.getCliTypes().map(key => [key, {
            name: configLoader.getCliTypeName(key),
            spawn: configLoader.getSpawnConfig(key),
          }])
        ),
        openwhisper: configLoader.getOpenWhisperConfig(),
      };
    } catch (error) {
      console.error('[IPC] Failed to get tools:', error);
      return { cliTypes: {}, openwhisper: null };
    }
  });

  ipcMain.handle('tools:addCliType', (_event, key: string, name: string, command: string, args: string[]) => {
    try {
      configLoader.addCliType(key, name, command, args);
      return { success: true };
    } catch (error) {
      console.error('[IPC] Failed to add CLI type:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('tools:updateCliType', (_event, key: string, name: string, command: string, args: string[]) => {
    try {
      configLoader.updateCliType(key, name, command, args);
      return { success: true };
    } catch (error) {
      console.error('[IPC] Failed to update CLI type:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('tools:removeCliType', (_event, key: string) => {
    try {
      configLoader.removeCliType(key);
      return { success: true };
    } catch (error) {
      console.error('[IPC] Failed to remove CLI type:', error);
      return { success: false, error: String(error) };
    }
  });
}

// ============================================================================
// Window Handlers
// ============================================================================

function setupWindowHandlers(): void {
  ipcMain.handle('window:focus', async (_event, hwnd: string) => {
    return await windowManager.focusWindow(hwnd);
  });

  ipcMain.handle('window:findTerminals', async () => {
    return await windowManager.findTerminalWindows();
  });
}

// ============================================================================
// Process Spawning Handlers
// ============================================================================

function setupSpawnHandlers(): void {
  ipcMain.handle('spawn:cli', (_event, cliType: string, workingDir?: string) => {
    const result = processSpawner.spawn(cliType, workingDir);
    if (result) {
      // Add to session manager
      sessionManager.addSession({
        id: `session-${result.pid}`,
        name: cliType,
        cliType,
        processId: result.pid,
        windowHandle: '',
      });
      return { success: true, pid: result.pid };
    }
    return { success: false, error: 'Failed to spawn' };
  });
}

// ============================================================================
// Keyboard Handlers
// ============================================================================

function setupKeyboardHandlers(): void {
  ipcMain.handle('keyboard:sendKeys', (_event, keys: string[]) => {
    keyboard.sendKeys(keys);
    return { success: true };
  });

  ipcMain.handle('keyboard:typeString', (_event, text: string) => {
    keyboard.typeString(text);
    return { success: true };
  });

  ipcMain.handle('keyboard:longPress', (_event, key: string, duration: number) => {
    keyboard.longPress(key, duration);
    return { success: true };
  });
}

// ============================================================================
// App Handlers
// ============================================================================

function setupAppHandlers(): void {
  ipcMain.handle('app:getVersion', () => {
    return app.getVersion();
  });
}

// ============================================================================
// Registration
// ============================================================================

/**
 * Register all IPC handlers
 */
export function registerIPCHandlers(): void {
  console.log('[IPC] Registering handlers');

  // Load config eagerly so individual handlers don't need to call load()
  try {
    configLoader.load();
    console.log('[IPC] Config loaded:', configLoader.getCliTypes());
  } catch (error) {
    console.error('[IPC] Failed to load config:', error);
  }

  setupGamepadHandlers();
  setupSessionHandlers();
  setupConfigHandlers();
  setupProfileHandlers();
  setupToolsHandlers();
  setupWindowHandlers();
  setupSpawnHandlers();
  setupKeyboardHandlers();
  setupAppHandlers();

  console.log('[IPC] All handlers registered');
}
