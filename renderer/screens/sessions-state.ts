/**
 * Sessions screen state — vertical session list + spawn grid navigation.
 */

export type SessionsFocus = 'sessions' | 'spawn' | 'wizard';

export interface SessionsScreenState {
  activeFocus: SessionsFocus;
  sessionsFocusIndex: number;
  spawnFocusIndex: number;
  cliTypes: string[];
  directories: Array<{ name: string; path: string }>;
  // Wizard state
  wizardCliType: string | null;
  wizardDirIndex: number;
  wizardStep: 'directory' | 'confirm';
}

export const sessionsState: SessionsScreenState = {
  activeFocus: 'sessions',
  sessionsFocusIndex: 0,
  spawnFocusIndex: 0,
  cliTypes: [],
  directories: [],
  wizardCliType: null,
  wizardDirIndex: 0,
  wizardStep: 'directory',
};
