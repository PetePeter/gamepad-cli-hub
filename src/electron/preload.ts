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
  // Session Management
  // ========================================================================

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

  configCopyCliBindings: (sourceCli: string, targetCli: string) =>
    ipcRenderer.invoke('config:copyCliBindings', sourceCli, targetCli),

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

  /**
   * Get sort preferences for an area (sessions or bindings)
   */
  configGetSortPrefs: (area: string) => ipcRenderer.invoke('config:getSortPrefs', area),

  /**
   * Set sort preferences for an area (sessions or bindings)
   */
  configSetSortPrefs: (area: string, prefs: { field?: string; direction?: string }) =>
    ipcRenderer.invoke('config:setSortPrefs', area, prefs),

  /**
   * Get the raw spawn command for a CLI type (for embedded PTY — no terminal wrapper)
   */
  configGetSpawnCommand: (cliType: string) => ipcRenderer.invoke('config:getSpawnCommand', cliType),

  configGetDpadConfig: () => ipcRenderer.invoke('config:getDpadConfig'),

  configGetStickConfig: (stick: string) => ipcRenderer.invoke('config:getStickConfig', stick),

  /**
   * Bring the hub app window to foreground
   */
  hubFocus: () => ipcRenderer.invoke('hub:focus'),

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
  // PTY Terminal Management
  // ========================================================================

  /** Spawn a new embedded PTY terminal */
  ptySpawn: (sessionId: string, command: string, args: string[], cwd?: string, cliType?: string) =>
    ipcRenderer.invoke('pty:spawn', sessionId, command, args, cwd, cliType),

  /** Write data to a PTY terminal's stdin */
  ptyWrite: (sessionId: string, data: string) => {
    console.log(`[Preload] ptyWrite → pty:write session=${sessionId} len=${data.length}`);
    return ipcRenderer.invoke('pty:write', sessionId, data);
  },

  /** Resize a PTY terminal */
  ptyResize: (sessionId: string, cols: number, rows: number) =>
    ipcRenderer.invoke('pty:resize', sessionId, cols, rows),

  /** Kill a PTY terminal */
  ptyKill: (sessionId: string) =>
    ipcRenderer.invoke('pty:kill', sessionId),

  /** Subscribe to PTY output data */
  onPtyData: (callback: (sessionId: string, data: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, sessionId: string, data: string) => callback(sessionId, data);
    ipcRenderer.on('pty:data', listener);
    return () => ipcRenderer.removeListener('pty:data', listener);
  },

  /** Subscribe to PTY exit events */
  onPtyExit: (callback: (sessionId: string, exitCode: number) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, sessionId: string, exitCode: number) => callback(sessionId, exitCode);
    ipcRenderer.on('pty:exit', listener);
    return () => ipcRenderer.removeListener('pty:exit', listener);
  },

  /** Subscribe to session state change events */
  onPtyStateChange: (callback: (transition: { sessionId: string; previousState: string; newState: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
    ipcRenderer.on('pty:state-change', listener);
    return () => ipcRenderer.removeListener('pty:state-change', listener);
  },

  /** Subscribe to question detected events */
  onPtyQuestionDetected: (callback: (event: { sessionId: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
    ipcRenderer.on('pty:question-detected', listener);
    return () => ipcRenderer.removeListener('pty:question-detected', listener);
  },

  /** Subscribe to question cleared events */
  onPtyQuestionCleared: (callback: (event: { sessionId: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
    ipcRenderer.on('pty:question-cleared', listener);
    return () => ipcRenderer.removeListener('pty:question-cleared', listener);
  },

  // ========================================================================
  // Pipeline Queue
  // ========================================================================

  /** Enqueue a session for auto-implementation */
  pipelineEnqueue: (sessionId: string) => ipcRenderer.invoke('pipeline:enqueue', sessionId),

  /** Remove a session from the waiting queue */
  pipelineDequeue: (sessionId: string) => ipcRenderer.invoke('pipeline:dequeue', sessionId),

  /** Get all sessions in the waiting queue */
  pipelineGetQueue: () => ipcRenderer.invoke('pipeline:getQueue'),

  /** Get a session's position in the queue (1-based, 0 if not queued) */
  pipelineGetPosition: (sessionId: string) => ipcRenderer.invoke('pipeline:getPosition', sessionId),

  /** Manually set a session's pipeline state */
  sessionSetState: (sessionId: string, state: string) => ipcRenderer.invoke('session:setState', sessionId, state),

  /** Subscribe to auto-handoff events */
  onPtyHandoff: (callback: (event: { fromSessionId: string; toSessionId: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
    ipcRenderer.on('pty:handoff', listener);
    return () => ipcRenderer.removeListener('pty:handoff', listener);
  },

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
  toolsAddCliType: (key: string, name: string, command: string, initialPrompt: string, initialPromptDelay: number) => ipcRenderer.invoke('tools:addCliType', key, name, command, initialPrompt, initialPromptDelay),
  toolsUpdateCliType: (key: string, name: string, command: string, initialPrompt: string, initialPromptDelay: number) => ipcRenderer.invoke('tools:updateCliType', key, name, command, initialPrompt, initialPromptDelay),
  toolsRemoveCliType: (key: string) => ipcRenderer.invoke('tools:removeCliType', key),

  // ========================================================================
  // Voice Keyboard (OS-level key events for voice bindings)
  // ========================================================================

  /**
   * Tap a single key (voice binding tap mode)
   */
  keyboardKeyTap: (key: string) => ipcRenderer.invoke('keyboard:keyTap', key),

  /**
   * Tap a key combo (voice binding tap mode with modifiers)
   */
  keyboardSendKeyCombo: (keys: string[]) => ipcRenderer.invoke('keyboard:sendKeyCombo', keys),

  /**
   * Hold keys down (for hold bindings)
   */
  keyboardComboDown: (keys: string[]) => ipcRenderer.invoke('keyboard:comboDown', keys),

  /**
   * Release held keys
   */
  keyboardComboUp: (keys: string[]) => ipcRenderer.invoke('keyboard:comboUp', keys),

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
