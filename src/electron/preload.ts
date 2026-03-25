/**
 * Electron Preload Script
 *
 * Bridges the main process and renderer using contextBridge.
 * Exposes safe IPC APIs to the renderer.
 */

import { contextBridge, ipcRenderer } from 'electron';

/**
 * API exposed to the renderer process
 */
const gamepadCliAPI = {
  // ========================================================================
  // Gamepad Events
  // ========================================================================

  /**
   * Subscribe to gamepad button press events
   * @param callback - Function to call when a button is pressed
   * @returns Unsubscribe function
   */
  onGamepadEvent: (callback: (event: { button: string; gamepadIndex: number; timestamp: number }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
    ipcRenderer.on('gamepad:event', listener);
    return () => ipcRenderer.removeListener('gamepad:event', listener);
  },

  /**
   * Subscribe to gamepad button release events
   * @param callback - Function to call when a button is released
   * @returns Unsubscribe function
   */
  onGamepadRelease: (callback: (event: { button: string; gamepadIndex: number; timestamp: number }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
    ipcRenderer.on('gamepad:release', listener);
    return () => ipcRenderer.removeListener('gamepad:release', listener);
  },

  /**
   * Subscribe to gamepad connection events
   * @param callback - Function to call when connection state changes
   * @returns Unsubscribe function
   */
  onGamepadConnection: (callback: (event: { connected: boolean; count: number; timestamp: number }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
    ipcRenderer.on('gamepad:connection', listener);
    return () => ipcRenderer.removeListener('gamepad:connection', listener);
  },

  /**
   * Get the number of connected gamepads
   */
  getGamepadCount: () => ipcRenderer.invoke('gamepad:getCount'),

  /**
   * Vibrate a connected gamepad
   * @param leftMotor - Left motor intensity (0–65535)
   * @param rightMotor - Right motor intensity (0–65535)
   * @param durationMs - Vibration duration in milliseconds
   */
  gamepadVibrate: (leftMotor: number, rightMotor: number, durationMs: number) =>
    ipcRenderer.invoke('gamepad:vibrate', leftMotor, rightMotor, durationMs),

  // ========================================================================
  // Session Management
  // ========================================================================

  /**
   * Refresh sessions from existing terminal windows
   */
  sessionRefresh: () => ipcRenderer.invoke('session:refresh'),

  /**
   * Get all sessions
   */
  sessionGetAll: () => ipcRenderer.invoke('session:getAll'),

  /**
   * Get a specific session by ID
   */
  sessionGet: (id: string) => ipcRenderer.invoke('session:get', id),

  /**
   * Set the active session
   */
  sessionSetActive: (id: string) => ipcRenderer.invoke('session:setActive', id),

  /**
   * Get the active session
   */
  sessionGetActive: () => ipcRenderer.invoke('session:getActive'),

  /**
   * Add a new session
   */
  sessionAdd: (session: { id: string; name: string; cliType: string; processId: number }) =>
    ipcRenderer.invoke('session:add', session),

  /**
   * Remove a session
   */
  sessionRemove: (id: string) => ipcRenderer.invoke('session:remove', id),

  /**
   * Close a session (kill process and remove)
   */
  sessionClose: (id: string) => ipcRenderer.invoke('session:close', id),

  /**
   * Move to next session
   */
  sessionNext: () => ipcRenderer.invoke('session:next'),

  /**
   * Move to previous session
   */
  sessionPrevious: () => ipcRenderer.invoke('session:previous'),

  // ========================================================================
  // Configuration
  // ========================================================================

  /**
   * Get all configuration data
   */
  configGetAll: () => ipcRenderer.invoke('config:getAll'),

  /**
   * Get global bindings
   */
  configGetGlobalBindings: () => ipcRenderer.invoke('config:getGlobalBindings'),

  /**
   * Get bindings for a specific CLI type
   */
  configGetBindings: (cliType: string) => ipcRenderer.invoke('config:getBindings', cliType),

  /**
   * Get available CLI types
   */
  configGetCliTypes: () => ipcRenderer.invoke('config:getCliTypes'),

  /**
   * Set a binding (for settings screen)
   */
  configSetBinding: (button: string, cliType: string | null, binding: any) =>
    ipcRenderer.invoke('config:setBinding', button, cliType, binding),

  configRemoveBinding: (button: string, cliType: string | null) =>
    ipcRenderer.invoke('config:removeBinding', button, cliType),

  /**
   * Reload configuration from file
   */
  configReload: () => ipcRenderer.invoke('config:reload'),

  /**
   * Get haptic feedback setting
   */
  configGetHapticFeedback: () => ipcRenderer.invoke('config:getHapticFeedback'),

  /**
   * Set haptic feedback setting
   */
  configSetHapticFeedback: (enabled: boolean) => ipcRenderer.invoke('config:setHapticFeedback', enabled),

  // ========================================================================
  // Window Management
  // ========================================================================

  /**
   * Focus a window by handle
   */
  focusWindow: (hwnd: string) => ipcRenderer.invoke('window:focus', hwnd),

  /**
   * Bring the hub app window to foreground
   */
  hubFocus: () => ipcRenderer.invoke('hub:focus'),

  /**
   * Find terminal windows
   */
  findTerminalWindows: () => ipcRenderer.invoke('window:findTerminals'),

  // ========================================================================
  // Sidebar Controls
  // ========================================================================

  /**
   * Toggle sidebar between left and right edges
   */
  sidebarToggleSide: () => ipcRenderer.invoke('window:toggleSide'),

  /**
   * Toggle always-on-top pin
   */
  sidebarTogglePin: () => ipcRenderer.invoke('window:togglePin'),

  /**
   * Get sidebar preferences (side, width)
   */
  sidebarGetPrefs: () => ipcRenderer.invoke('window:getSidebarPrefs'),

  /**
   * Update sidebar preferences
   */
  sidebarSetPrefs: (prefs: { side?: string; width?: number }) =>
    ipcRenderer.invoke('window:setSidebarPrefs', prefs),

  // ========================================================================
  // Process Spawning
  // ========================================================================

  /**
   * Spawn a new CLI instance
   */
  spawnCli: (cliType: string, workingDir?: string) => ipcRenderer.invoke('spawn:cli', cliType, workingDir),

  /**
   * Get working directory presets from config
   */
  configGetWorkingDirs: () => ipcRenderer.invoke('config:getWorkingDirs'),

  // ========================================================================
  // Working Directory CRUD
  // ========================================================================

  configAddWorkingDir: (name: string, dirPath: string) => ipcRenderer.invoke('config:addWorkingDir', name, dirPath),
  configUpdateWorkingDir: (index: number, name: string, dirPath: string) => ipcRenderer.invoke('config:updateWorkingDir', index, name, dirPath),
  configRemoveWorkingDir: (index: number) => ipcRenderer.invoke('config:removeWorkingDir', index),

  // ========================================================================
  // Profile Management
  // ========================================================================

  profileList: () => ipcRenderer.invoke('profile:list'),
  profileGetActive: () => ipcRenderer.invoke('profile:getActive'),
  profileSwitch: (name: string) => ipcRenderer.invoke('profile:switch', name),
  profileCreate: (name: string, copyFrom?: string) => ipcRenderer.invoke('profile:create', name, copyFrom),
  profileDelete: (name: string) => ipcRenderer.invoke('profile:delete', name),

  // ========================================================================
  // Tools CRUD
  // ========================================================================

  toolsGetAll: () => ipcRenderer.invoke('tools:getAll'),
  toolsAddCliType: (key: string, name: string, terminal: string, command: string) => ipcRenderer.invoke('tools:addCliType', key, name, terminal, command),
  toolsUpdateCliType: (key: string, name: string, terminal: string, command: string) => ipcRenderer.invoke('tools:updateCliType', key, name, terminal, command),
  toolsRemoveCliType: (key: string) => ipcRenderer.invoke('tools:removeCliType', key),

  // ========================================================================
  // Keyboard
  // ========================================================================

  /**
   * Send keystrokes
   */
  keyboardSendKeys: (keys: string[]) => ipcRenderer.invoke('keyboard:sendKeys', keys),

  /**
   * Type a string
   */
  keyboardTypeString: (text: string) => ipcRenderer.invoke('keyboard:typeString', text),

  /**
   * Hold keys down (for hold bindings)
   */
  keyboardComboDown: (keys: string[]) => ipcRenderer.invoke('keyboard:comboDown', keys),

  /**
   * Release held keys
   */
  keyboardComboUp: (keys: string[]) => ipcRenderer.invoke('keyboard:comboUp', keys),

  // ========================================================================
  // Foreground Sync
  // ========================================================================

  /**
   * Start polling for foreground window changes
   */
  sessionStartForegroundSync: () => ipcRenderer.invoke('session:startForegroundSync'),

  /**
   * Stop polling for foreground window changes
   */
  sessionStopForegroundSync: () => ipcRenderer.invoke('session:stopForegroundSync'),

  /**
   * Subscribe to foreground window change events
   * @param callback - Function to call when the foreground window changes
   * @returns Unsubscribe function
   */
  onForegroundChanged: (callback: (event: { sessionId: string | null; windowHandle: string; timestamp: number }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
    ipcRenderer.on('session:foreground-changed', listener);
    return () => ipcRenderer.removeListener('session:foreground-changed', listener);
  },

  // ========================================================================
  // System
  // ========================================================================

  systemGetGameBarEnabled: () => ipcRenderer.invoke('system:getGameBarEnabled'),
  systemSetGameBarEnabled: (enabled: boolean) => ipcRenderer.invoke('system:setGameBarEnabled', enabled),

  // ========================================================================
  // App Control
  // ========================================================================

  /**
   * Get app version
   */
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
};

/**
 * Expose the API to the renderer via contextBridge
 */
try {
  contextBridge.exposeInMainWorld('gamepadCli', gamepadCliAPI);
  console.log('[Preload] gamepadCli API exposed successfully');
} catch (error) {
  console.error('[Preload] Failed to expose gamepadCli API:', error);
}

/**
 * Type declarations for the exposed API
 */
declare global {
  interface Window {
    gamepadCli: typeof gamepadCliAPI;
  }
}

export type GamepadCliAPI = typeof gamepadCliAPI;
