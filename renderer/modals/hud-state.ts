/**
 * HUD-specific state — isolated from the shared AppState.
 * Only session-hud.ts should read/write these properties.
 */

export type HudPanel = 'sessions' | 'cli' | 'directory' | 'confirm';

export interface HudState {
  visible: boolean;
  activePanel: HudPanel;
  sessionsFocusIndex: number;
  cliFocusIndex: number;
  dirFocusIndex: number;
  selectedCliType: string | null;
  selectedDirectory: { name: string; path: string } | null;
  cliTypes: string[];
  directories: Array<{ name: string; path: string }>;
}

export const hudState: HudState = {
  visible: false,
  activePanel: 'sessions',
  sessionsFocusIndex: 0,
  cliFocusIndex: 0,
  dirFocusIndex: 0,
  selectedCliType: null,
  selectedDirectory: null,
  cliTypes: [],
  directories: [],
};
