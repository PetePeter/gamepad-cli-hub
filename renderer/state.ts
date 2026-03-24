/**
 * Shared application state — single source of truth for the renderer.
 *
 * Every module imports `state` from here instead of holding local copies.
 */

export interface Session {
  id: string;
  name: string;
  cliType: string;
  processId: number;
  windowHandle: string;
}

export interface ButtonEvent {
  button: string;
  gamepadIndex: number;
  timestamp: number;
}

export interface AppState {
  currentScreen: string;
  sessions: Session[];
  activeSessionId: string | null;
  gamepadCount: number;
  focusedElement: HTMLElement | null;
  eventLog: Array<{ time: string; event: string }>;
  cliTypes: string[];
  availableSpawnTypes: string[];
  globalBindings: Record<string, any> | null;
  cliBindingsCache: Record<string, Record<string, any>>;
  settingsTab: string;
  dirPickerVisible: boolean;
  dirPickerItems: Array<{ name: string; path: string }>;
  dirPickerSelectedIndex: number;
  dirPickerCliType: string;
  bindingEditorVisible: boolean;
  editingBinding: { button: string; cliType: string | null; binding: any } | null;
  bindingEditorFocusIndex: number;
  activeProfile: string;
  hudVisible: boolean;
  hudSessionsFocusIndex: number;
  hudActivePanel: 'sessions' | 'cli' | 'directory' | 'confirm';
  hudCliFocusIndex: number;
  hudDirFocusIndex: number;
  hudSelectedCliType: string | null;
  hudSelectedDirectory: { name: string; path: string } | null;
  hudCliTypes: string[];
  hudDirectories: Array<{ name: string; path: string }>;
}

export const state: AppState = {
  currentScreen: 'sessions',
  sessions: [],
  activeSessionId: null,
  gamepadCount: 0,
  focusedElement: null,
  eventLog: [],
  cliTypes: [],
  availableSpawnTypes: [],
  globalBindings: null,
  cliBindingsCache: {},
  settingsTab: 'global',
  dirPickerVisible: false,
  dirPickerItems: [],
  dirPickerSelectedIndex: 0,
  dirPickerCliType: '',
  bindingEditorVisible: false,
  editingBinding: null,
  bindingEditorFocusIndex: 0,
  activeProfile: 'default',
  hudVisible: false,
  hudSessionsFocusIndex: 0,
  hudActivePanel: 'sessions',
  hudCliFocusIndex: 0,
  hudDirFocusIndex: 0,
  hudSelectedCliType: null,
  hudSelectedDirectory: null,
  hudCliTypes: [],
  hudDirectories: [],
};
