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
   * Set the active session
   */
  sessionSetActive: (id: string) => ipcRenderer.invoke('session:setActive', id),

  /**
   * Get the active session
   */
  sessionGetActive: () => ipcRenderer.invoke('session:getActive'),

  /**
   * Remove a session
   */
  sessionRemove: (id: string) => ipcRenderer.invoke('session:remove', id),

  /**
   * Close a session (kill process and remove)
   */
  sessionClose: (id: string) => ipcRenderer.invoke('session:close', id),

  /**
   * Rename a session
   */
  sessionRename: (id: string, newName: string) => ipcRenderer.invoke('session:rename', id, newName),

  // ========================================================================
  // Configuration
  // ========================================================================

  /**
   * Get all configuration data
   */
  configGetAll: () => ipcRenderer.invoke('config:getAll'),

  /**
   * Get bindings for a specific CLI type
   */
  configGetBindings: (cliType: string) => ipcRenderer.invoke('config:getBindings', cliType),

  /**
   * Get available CLI types
   */
  configGetCliTypes: () => ipcRenderer.invoke('config:getCliTypes'),

  /**
   * Get named sequence groups for a CLI type
   */
  configGetSequences: (cliType: string) => ipcRenderer.invoke('config:getSequences', cliType),

/**
   * Get chipbar quick-action buttons for the current profile
   */
  configGetChipbarActions: () => ipcRenderer.invoke('config:getChipbarActions') as Promise<{
    actions: Array<{ label: string; sequence: string }>;
    inboxDir: string;
  }>,

  /**
   * Update chipbar quick-action buttons for the current profile
   */
  configSetChipbarActions: (actions: Array<{ label: string; sequence: string }>) =>
    ipcRenderer.invoke('config:setChipbarActions', actions),

  /**
   * Create or update a named sequence group for a CLI type
   */
  configSetSequenceGroup: (cliType: string, groupId: string, items: Array<{ label: string; sequence: string }>) =>
    ipcRenderer.invoke('config:setSequenceGroup', cliType, groupId, items),

  /**
   * Remove a named sequence group for a CLI type
   */
  configRemoveSequenceGroup: (cliType: string, groupId: string) =>
    ipcRenderer.invoke('config:removeSequenceGroup', cliType, groupId),

  /**
   * Set a binding (for settings screen)
   */
  configSetBinding: (button: string, cliType: string, binding: any) =>
    ipcRenderer.invoke('config:setBinding', button, cliType, binding),

  configRemoveBinding: (button: string, cliType: string) =>
    ipcRenderer.invoke('config:removeBinding', button, cliType),

  configCopyCliBindings: (sourceCli: string, targetCli: string) =>
    ipcRenderer.invoke('config:copyCliBindings', sourceCli, targetCli),

  /**
   * Get haptic feedback setting
   */
  configGetHapticFeedback: () => ipcRenderer.invoke('config:getHapticFeedback'),

  /**
   * Set haptic feedback setting
   */
  configSetHapticFeedback: (enabled: boolean) => ipcRenderer.invoke('config:setHapticFeedback', enabled),

  /**
   * Get notifications setting
   */
  configGetNotifications: () => ipcRenderer.invoke('config:getNotifications'),

  /**
   * Set notifications setting
   */
  configSetNotifications: (enabled: boolean) => ipcRenderer.invoke('config:setNotifications', enabled),

  /**
   * Get sort preferences for an area (sessions or bindings)
   */
  configGetSortPrefs: (area: string) => ipcRenderer.invoke('config:getSortPrefs', area),

  /**
   * Set sort preferences for an area (sessions or bindings)
   */
  configSetSortPrefs: (area: string, prefs: { field?: string; direction?: string }) =>
    ipcRenderer.invoke('config:setSortPrefs', area, prefs),

  configGetSessionGroupPrefs: () =>
    ipcRenderer.invoke('config:getSessionGroupPrefs') as Promise<{
      order: string[];
      collapsed: string[];
      bookmarked?: string[];
      overviewHidden?: string[];
    }>,

  configSetSessionGroupPrefs: (prefs: {
    order: string[];
    collapsed: string[];
    bookmarked?: string[];
    overviewHidden?: string[];
  }) =>
    ipcRenderer.invoke('config:setSessionGroupPrefs', prefs),

  editorGetHistory: (): Promise<string[]> => ipcRenderer.invoke('editor:getHistory'),
  editorSetHistory: (entries: string[]) => ipcRenderer.invoke('editor:setHistory', entries),

  configRemoveBookmarkedDir: (dirPath: string) =>
    ipcRenderer.invoke('config:removeBookmarkedDir', dirPath),

  /**
   * Get the raw spawn command for a CLI type (for embedded PTY — no terminal wrapper)
   */
  configGetSpawnCommand: (cliType: string) => ipcRenderer.invoke('config:getSpawnCommand', cliType),

  configGetDpadConfig: () => ipcRenderer.invoke('config:getDpadConfig'),

  configGetStickConfig: (stick: string) => ipcRenderer.invoke('config:getStickConfig', stick),

  configGetCollapsePrefs: () => ipcRenderer.invoke('config:getCollapsePrefs') as Promise<{ spawnCollapsed: boolean; plannerCollapsed: boolean }>,

  configSetCollapsePrefs: (prefs: { spawnCollapsed?: boolean; plannerCollapsed?: boolean }) =>
    ipcRenderer.invoke('config:setCollapsePrefs', prefs),

  // ========================================================================
  // PTY Terminal Management
  // ========================================================================

  /** Spawn a new embedded PTY terminal */
  ptySpawn: (sessionId: string, command: string, args: string[], cwd?: string, cliType?: string, contextText?: string, resumeSessionName?: string) =>
    ipcRenderer.invoke('pty:spawn', sessionId, command, args, cwd, cliType, contextText, resumeSessionName),

  /** Write data to a PTY terminal's stdin */
  ptyWrite: (sessionId: string, data: string) =>
    ipcRenderer.invoke('pty:write', sessionId, data),

  /** Write scroll keys to a PTY without triggering AIAGENT keyword detection */
  ptyScrollInput: (sessionId: string, data: string) =>
    ipcRenderer.invoke('pty:scrollInput', sessionId, data),

  /** Resize a PTY terminal */
  ptyResize: (sessionId: string, cols: number, rows: number) =>
    ipcRenderer.invoke('pty:resize', sessionId, cols, rows),

  /** Suppress activity promotion before terminal switch */
  ptyMarkSwitching: (sessionId: string) =>
    ipcRenderer.invoke('pty:markSwitching', sessionId),

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

  /** Subscribe to activity change events */
  onPtyActivityChange: (callback: (event: { sessionId: string; level: string; lastOutputAt?: number }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
    ipcRenderer.on('pty:activity-change', listener);
    return () => ipcRenderer.removeListener('pty:activity-change', listener);
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

  /** Subscribe to notification click events (focus + switch to session) */
  onNotificationClick: (callback: (event: { sessionId: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
    ipcRenderer.on('notification:click', listener);
    return () => ipcRenderer.removeListener('notification:click', listener);
  },

  /** Subscribe to externally-spawned session events (e.g. from Telegram) */
  onSessionSpawned: (callback: (session: { id: string; name: string; cliType: string; processId: number; workingDir?: string; cliSessionName?: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
    ipcRenderer.on('session:spawned-externally', listener);
    return () => ipcRenderer.removeListener('session:spawned-externally', listener);
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
  toolsAddCliType: (
    key: string, name: string, command: string,
    initialPrompt: Array<{label: string; sequence: string}>, initialPromptDelay: number,
    options?: { args?: string; handoffCommand?: string; renameCommand?: string; resumeCommand?: string; continueCommand?: string },
  ) => ipcRenderer.invoke('tools:addCliType', key, name, command, initialPrompt, initialPromptDelay, options),
  toolsUpdateCliType: (
    key: string, name: string, command: string,
    initialPrompt: Array<{label: string; sequence: string}>, initialPromptDelay: number,
    options?: { args?: string; handoffCommand?: string; renameCommand?: string; resumeCommand?: string; continueCommand?: string },
  ) => ipcRenderer.invoke('tools:updateCliType', key, name, command, initialPrompt, initialPromptDelay, options),
  toolsRemoveCliType: (key: string) => ipcRenderer.invoke('tools:removeCliType', key),
  toolsGetPatterns: (cliType: string) => ipcRenderer.invoke('tools:getPatterns', cliType),
  toolsAddPattern: (cliType: string, rule: object) => ipcRenderer.invoke('tools:addPattern', cliType, rule),
  toolsUpdatePattern: (cliType: string, index: number, rule: object) => ipcRenderer.invoke('tools:updatePattern', cliType, index, rule),
  toolsRemovePattern: (cliType: string, index: number) => ipcRenderer.invoke('tools:removePattern', cliType, index),
  patternCancelSchedule: (sessionId: string) => ipcRenderer.invoke('pattern:cancelSchedule', sessionId),

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

  /**
   * Type a string as OS-level keystrokes (per-CLI sendkeys paste mode)
   */
  keyboardTypeString: (text: string) => ipcRenderer.invoke('keyboard:typeString', text),

  // ========================================================================
  // System
  // ========================================================================

  systemOpenLogsFolder: () => ipcRenderer.invoke('system:openLogsFolder'),

  /** Get app version from package.json via Electron */
  appGetVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),

  /** Open external editor (Notepad) for prompt composition */
  editorOpenExternal: (): Promise<{ success: boolean; text?: string; error?: string }> =>
    ipcRenderer.invoke('editor:openExternal'),

  /** Write text to a temp file for draft/plan apply — returns file path on success */
  writeTempContent: (content: string): Promise<{ success: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke('temp:writeContent', content),

  /** Delete a temp file (best-effort cleanup after apply) */
  deleteTemp: (filePath: string): Promise<void> =>
    ipcRenderer.invoke('temp:deleteContent', filePath),

  // ========================================================================
  // Dialog
  // ========================================================================

  /** Open a native OS folder picker and return the selected path (or null if cancelled) */
  dialogOpenFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:openFolder'),

  // ========================================================================
  // Telegram Bot
  // ========================================================================

  /** Get telegram bot configuration */
  telegramGetConfig: () => ipcRenderer.invoke('telegram:getConfig'),

  /** Update telegram bot configuration (partial merge) */
  telegramSetConfig: (updates: Record<string, unknown>) => ipcRenderer.invoke('telegram:setConfig', updates),

  /** Start the telegram bot */
  telegramStart: () => ipcRenderer.invoke('telegram:start'),

  /** Stop the telegram bot */
  telegramStop: () => ipcRenderer.invoke('telegram:stop'),

  /** Check if telegram bot is running */
  telegramIsRunning: () => ipcRenderer.invoke('telegram:isRunning'),

  /** Test telegram bot connection (validates token) */
  telegramTestConnection: () => ipcRenderer.invoke('telegram:testConnection'),

  // ========================================================================
  // Draft Prompts
  // ========================================================================

  /** Create a new draft prompt for a session */
  draftCreate: (sessionId: string, label: string, text: string) =>
    ipcRenderer.invoke('draft:create', sessionId, label, text),

  /** Update an existing draft */
  draftUpdate: (draftId: string, updates: { label?: string; text?: string }) =>
    ipcRenderer.invoke('draft:update', draftId, updates),

  /** Delete a draft */
  draftDelete: (draftId: string) =>
    ipcRenderer.invoke('draft:delete', draftId),

  /** Get all drafts for a session */
  draftList: (sessionId: string) =>
    ipcRenderer.invoke('draft:list', sessionId),

  /** Get draft count for a session */
  draftCount: (sessionId: string) =>
    ipcRenderer.invoke('draft:count', sessionId),

  // ─── Directory Plans (NCN) ────────────────────────────

  /** Get all plan items for a directory */
  planList: (dirPath: string) =>
    ipcRenderer.invoke('plan:list', dirPath),

  /** Create a new plan item */
  planCreate: (dirPath: string, title: string, description: string) =>
    ipcRenderer.invoke('plan:create', dirPath, title, description),

  /** Update a plan item's title and/or description */
  planUpdate: (id: string, updates: { title?: string; description?: string }) =>
    ipcRenderer.invoke('plan:update', id, updates),

  /** Delete a plan item */
  planDelete: (id: string) =>
    ipcRenderer.invoke('plan:delete', id),

  /** Add a dependency edge (fromId must finish before toId can start) */
  planAddDep: (fromId: string, toId: string) =>
    ipcRenderer.invoke('plan:addDep', fromId, toId),

  /** Remove a dependency edge */
  planRemoveDep: (fromId: string, toId: string) =>
    ipcRenderer.invoke('plan:removeDep', fromId, toId),

  /** Apply a startable plan to a session (startable → doing) */
  planApply: (id: string, sessionId: string) =>
    ipcRenderer.invoke('plan:apply', id, sessionId),

  /** Mark a doing plan as complete (doing → done) */
  planComplete: (id: string) =>
    ipcRenderer.invoke('plan:complete', id),

  /** Manually set a plan state and optional context */
  planSetState: (
    id: string,
    status: 'pending' | 'startable' | 'doing' | 'wait-tests' | 'blocked' | 'question',
    stateInfo?: string,
    sessionId?: string,
  ) => ipcRenderer.invoke('plan:setState', id, status, stateInfo, sessionId),

  /** Get startable plans for a directory */
  planStartableForDir: (dirPath: string) =>
    ipcRenderer.invoke('plan:startableForDir', dirPath),

  /** Get plans currently being worked on by a session */
  planDoingForSession: (sessionId: string) =>
    ipcRenderer.invoke('plan:doingForSession', sessionId),

  /** Get all active plans for a directory across sessions */
  planGetAllDoingForDir: (dirPath: string) =>
    ipcRenderer.invoke('plan:getAllDoingForDir', dirPath),

  /** Get all dependencies for a directory */
  planDeps: (dirPath: string) =>
    ipcRenderer.invoke('plan:deps', dirPath),

  /** Get a single plan item by ID */
  planGetItem: (id: string) =>
    ipcRenderer.invoke('plan:getItem', id),

  /** List files in the incoming plans folder */
  planIncomingList: (): Promise<string[]> =>
    ipcRenderer.invoke('plan:incoming-list'),

  /** Delete a file from the incoming plans folder */
  planIncomingDelete: (filename: string): Promise<boolean> =>
    ipcRenderer.invoke('plan:incoming-delete', filename),

  /** Export a single plan item as JSON string */
  planExportItem: (planId: string): Promise<string | null> =>
    ipcRenderer.invoke('plan:export-item', planId),

  /** Export an entire directory's plans as JSON string */
  planExportDirectory: (dirPath: string): Promise<string | null> =>
    ipcRenderer.invoke('plan:export-directory', dirPath),

  /** Import a JSON string (single item or directory batch) into a target directory */
  planImportFile: (jsonString: string, targetDirPath: string): Promise<unknown> =>
    ipcRenderer.invoke('plan:import-file', jsonString, targetDirPath),

  /** Read a local file and return its content as a string */
  planReadFile: (filePath: string): Promise<string | null> =>
    ipcRenderer.invoke('plan:read-file', filePath),

  /** Write content to a local file (creates parent directories) */
  planWriteFile: (filePath: string, content: string): Promise<boolean> =>
    ipcRenderer.invoke('plan:write-file', filePath, content),

  /** Open a file picker dialog and return the chosen path */
  dialogShowOpenFile: (filters?: { name: string; extensions: string[] }[]): Promise<string | null> =>
    ipcRenderer.invoke('dialog:showOpenFile', filters),

  /** Open a save dialog and return the chosen path */
  dialogShowSaveFile: (defaultFilename?: string, filters?: { name: string; extensions: string[] }[]): Promise<string | null> =>
    ipcRenderer.invoke('dialog:showSaveFile', defaultFilename, filters),

  /** Subscribe to plan change events */
  onPlanChanged: (callback: (dirPath: string) => void) => {
    const listener = (_event: unknown, dirPath: string) => callback(dirPath);
    ipcRenderer.on('plan:changed', listener);
    return () => ipcRenderer.removeListener('plan:changed', listener);
  },

  /** Subscribe to successful incoming plan import notifications */
  onPlanIncomingImported: (callback: (event: { filename: string; title: string; dirPath: string }) => void) => {
    const listener = (_event: unknown, data: { filename: string; title: string; dirPath: string }) => callback(data);
    ipcRenderer.on('plan:incoming-imported', listener);
    return () => ipcRenderer.removeListener('plan:incoming-imported', listener);
  },

  /** Subscribe to incoming plan import error notifications */
  onPlanIncomingError: (callback: (event: { filename: string; error: string }) => void) => {
    const listener = (_event: unknown, data: { filename: string; error: string }) => callback(data);
    ipcRenderer.on('plan:incoming-error', listener);
    return () => ipcRenderer.removeListener('plan:incoming-error', listener);
  },

  onPatternScheduleCreated: (callback: (event: { sessionId: string; scheduledAt: string; ruleIndex: number }) => void) => {
    const listener = (_e: unknown, event: { sessionId: string; scheduledAt: string; ruleIndex: number }) => callback(event);
    ipcRenderer.on('pattern:schedule-created', listener);
    return () => ipcRenderer.removeListener('pattern:schedule-created', listener);
  },

  onPatternScheduleFired: (callback: (event: { sessionId: string }) => void) => {
    const listener = (_e: unknown, event: { sessionId: string }) => callback(event);
    ipcRenderer.on('pattern:schedule-fired', listener);
    return () => ipcRenderer.removeListener('pattern:schedule-fired', listener);
  },

  onPatternScheduleCancelled: (callback: (event: { sessionId: string }) => void) => {
    const listener = (_e: unknown, event: { sessionId: string }) => callback(event);
    ipcRenderer.on('pattern:schedule-cancelled', listener);
    return () => ipcRenderer.removeListener('pattern:schedule-cancelled', listener);
  },

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
