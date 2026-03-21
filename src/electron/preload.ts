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

  /**
   * Reload configuration from file
   */
  configReload: () => ipcRenderer.invoke('config:reload'),

  // ========================================================================
  // Window Management
  // ========================================================================

  /**
   * Focus a window by handle
   */
  focusWindow: (hwnd: string) => ipcRenderer.invoke('window:focus', hwnd),

  /**
   * Find terminal windows
   */
  findTerminalWindows: () => ipcRenderer.invoke('window:findTerminals'),

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
  toolsAddCliType: (key: string, name: string, command: string, args: string[]) => ipcRenderer.invoke('tools:addCliType', key, name, command, args),
  toolsUpdateCliType: (key: string, name: string, command: string, args: string[]) => ipcRenderer.invoke('tools:updateCliType', key, name, command, args),
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
   * Long press a key
   */
  keyboardLongPress: (key: string, duration: number) => ipcRenderer.invoke('keyboard:longPress', key, duration),

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
