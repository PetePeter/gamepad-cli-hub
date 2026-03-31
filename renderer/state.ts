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
  workingDir?: string;
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
  eventLog: Array<{ time: string; event: string }>;
  cliTypes: string[];
  availableSpawnTypes: string[];
  cliBindingsCache: Record<string, Record<string, any>>;
  cliSequencesCache: Record<string, Record<string, Array<{ label: string; sequence: string }>>>;
  settingsTab: string;
  activeProfile: string;
}

export const state: AppState = {
  currentScreen: 'sessions',
  sessions: [],
  activeSessionId: null,
  gamepadCount: 0,
  eventLog: [],
  cliTypes: [],
  availableSpawnTypes: [],
  cliBindingsCache: {},
  cliSequencesCache: {},
  settingsTab: 'profiles',
  activeProfile: 'default',
};
