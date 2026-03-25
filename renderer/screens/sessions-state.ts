/**
 * Sessions screen state — panel navigation for the 3-panel launcher.
 * Only sessions.ts should read/write these properties.
 */

export type SessionPanel = 'sessions' | 'cli' | 'directory' | 'confirm';

export interface SessionsScreenState {
  activePanel: SessionPanel;
  sessionsFocusIndex: number;
  cliFocusIndex: number;
  dirFocusIndex: number;
  selectedCliType: string | null;
  selectedDirectory: { name: string; path: string } | null;
  cliTypes: string[];
  directories: Array<{ name: string; path: string }>;
}

export const sessionsState: SessionsScreenState = {
  activePanel: 'sessions',
  sessionsFocusIndex: 0,
  cliFocusIndex: 0,
  dirFocusIndex: 0,
  selectedCliType: null,
  selectedDirectory: null,
  cliTypes: [],
  directories: [],
};
