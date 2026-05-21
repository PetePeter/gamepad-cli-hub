/**
 * Shared renderer state types.
 *
 * Runtime state is owned by the Pinia app store. The `state` export is a
 * compatibility alias for non-Vue modules still being migrated.
 */

export interface Session {
  id: string;
  name: string;
  cliType: string;
  processId: number;
  workingDir?: string;
  projectId?: string;
  projectPath?: string;
  title?: string;
  cliSessionName?: string;
  currentPlanId?: string;
  lastOutputAt?: number;
  windowId?: number;
  state?: string;
  aiagentState?: 'planning' | 'implementing' | 'completed' | 'idle';
}

export interface ProjectSummary {
  id: string;
  name: string;
  canonicalPath: string;
  alternatePaths: string[];
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
  /** Most recent non-null selected session, even if an overlay temporarily deselects terminals. */
  recentSessionId: string | null;
  /** Previously selected session before the current/recent one. */
  lastSelectedSessionId: string | null;
  gamepadCount: number;
  eventLog: Array<{ time: string; event: string }>;
  cliTypes: string[];
  availableSpawnTypes: string[];
  cliBindingsCache: Record<string, Record<string, any>>;
  cliSequencesCache: Record<string, Record<string, Array<{ label: string; sequence: string }>>>;
  /** Per-CLI tool config (paste mode, commands, etc.) — populated by initConfigCache. */
  cliToolsCache: Record<string, { pasteMode?: 'pty' | 'ptyindividual' | 'sendkeys' | 'sendkeysindividual' | 'clippaste'; submitSuffix?: string; [k: string]: any }>;
  /** Project registry shared by sidebar, settings, and planner surfaces. */
  projects: ProjectSummary[];
  settingsTab: string;
  /** Per-session AIAGENT state (idle, waiting, implementing, etc.) */
  sessionStates: Map<string, string>;
  /** Per-session activity level (active, inactive, idle) */
  sessionActivityLevels: Map<string, string>;
  /** Per-session last output timestamp (for elapsed timer) */
  lastOutputTimes: Map<string, number>;
  /** Per-session draft count cache */
  draftCounts: Map<string, number>;
  /** Per-session plan coding count cache */
  planCodingCounts: Map<string, number>;
  /** Per-session plan startable count cache */
  planStartableCounts: Map<string, number>;
  /** Per-directory plan startable count (for dirs without active sessions) */
  planDirStartableCounts: Map<string, number>;
  /** Per-directory plan coding count */
  planDirCodingCounts: Map<string, number>;
  /** Per-directory plan blocked count */
  planDirBlockedCounts: Map<string, number>;
  /** Per-directory plan review count */
  planDirReviewCounts: Map<string, number>;
  /** Per-directory plan planning count */
  planDirPlanningCounts: Map<string, number>;
  /** Per-session working plan label (e.g. "🗺️ Auth refactor") */
  workingPlanLabels: Map<string, string>;
  /** Per-session working plan tooltip */
  workingPlanTooltips: Map<string, string>;
  /** Per-session pending pattern schedule time string (e.g. "9:00 PM") */
  pendingSchedules: Map<string, string>;
  /** Set of session IDs that are currently snapped out to child windows */
  snappedOutSessions: Set<string>;
}

export { appState as state } from './stores/app.js';
