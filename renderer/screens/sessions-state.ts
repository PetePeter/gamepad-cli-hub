/**
 * Sessions screen state — vertical session list + spawn grid navigation.
 */

export type SessionsFocus = 'sessions' | 'spawn';

export interface SessionsScreenState {
  activeFocus: SessionsFocus;
  sessionsFocusIndex: number;
  spawnFocusIndex: number;
  cliTypes: string[];
  directories: Array<{ name: string; path: string }>;
}

export const sessionsState: SessionsScreenState = {
  activeFocus: 'sessions',
  sessionsFocusIndex: 0,
  spawnFocusIndex: 0,
  cliTypes: [],
  directories: [],
};
