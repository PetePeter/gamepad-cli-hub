/**
 * Sessions screen state — vertical session list + spawn grid navigation.
 */

export type SessionsFocus = 'sessions' | 'spawn';

export interface SessionsScreenState {
  activeFocus: SessionsFocus;
  sessionsFocusIndex: number;
  spawnFocusIndex: number;
  cardColumn: 0 | 1 | 2;
  cliTypes: string[];
  directories: Array<{ name: string; path: string }>;
  editingSessionId: string | null;
}

export const sessionsState: SessionsScreenState = {
  activeFocus: 'sessions',
  sessionsFocusIndex: 0,
  spawnFocusIndex: 0,
  cardColumn: 0,
  cliTypes: [],
  directories: [],
  editingSessionId: null,
};
