/**
 * Shared application state — single source of truth for the renderer.
 *
 * Every module imports `state` from here instead of holding local copies.
 * Wrapped in Vue's reactive() so Vue components automatically track changes.
 */

import { reactive } from 'vue';

export interface Session {
  id: string;
  name: string;
  cliType: string;
  processId: number;
  workingDir?: string;
  title?: string;
  cliSessionName?: string;
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
  /** Per-CLI tool config (paste mode, commands, etc.) — populated by initConfigCache. */
  cliToolsCache: Record<string, { pasteMode?: 'pty' | 'sendkeys'; [k: string]: any }>;
  settingsTab: string;
  activeProfile: string;
  /** Per-session AIAGENT state (idle, waiting, implementing, etc.) */
  sessionStates: Map<string, string>;
  /** Per-session activity level (active, inactive, idle) */
  sessionActivityLevels: Map<string, string>;
  /** Per-session last output timestamp (for elapsed timer) */
  lastOutputTimes: Map<string, number>;
  /** Per-session draft count cache */
  draftCounts: Map<string, number>;
  /** Per-session plan doing count cache */
  planDoingCounts: Map<string, number>;
  /** Per-session plan startable count cache */
  planStartableCounts: Map<string, number>;
  /** Per-directory plan startable count (for dirs without active sessions) */
  planDirStartableCounts: Map<string, number>;
}

export const state: AppState = reactive({
  currentScreen: 'sessions',
  sessions: [],
  activeSessionId: null,
  gamepadCount: 0,
  eventLog: [],
  cliTypes: [],
  availableSpawnTypes: [],
  cliBindingsCache: {},
  cliSequencesCache: {},
  cliToolsCache: {},
  settingsTab: 'profiles',
  activeProfile: 'default',
  sessionStates: new Map(),
  sessionActivityLevels: new Map(),
  lastOutputTimes: new Map(),
  draftCounts: new Map(),
  planDoingCounts: new Map(),
  planStartableCounts: new Map(),
  planDirStartableCounts: new Map(),
});
