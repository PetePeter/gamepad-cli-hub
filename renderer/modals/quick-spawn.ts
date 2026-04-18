/**
 * Quick-spawn modal — bridge to Vue QuickSpawnModal.vue.
 *
 * Legacy callers still use showQuickSpawn() / hideQuickSpawn().
 * These now set reactive bridge state that App.vue's QuickSpawnModal observes.
 */

import { logEvent } from '../utils.js';
import {
  quickSpawn, setQuickSpawnCallback,
} from '../stores/modal-bridge.js';

// ============================================================================
// State — kept for legacy readers
// ============================================================================

export interface QuickSpawnState {
  visible: boolean;
  selectedIndex: number;
  cliTypes: string[];
  onSelect: ((cliType: string) => void) | null;
}

export const quickSpawnState: QuickSpawnState = {
  visible: false,
  selectedIndex: 0,
  cliTypes: [],
  onSelect: null,
};

// ============================================================================
// Show / Hide — bridge to Vue
// ============================================================================

export function showQuickSpawn(
  cliTypes: string[],
  onSelect: (cliType: string) => void,
  preselectedCliType?: string,
): void {
  if (cliTypes.length === 0) {
    logEvent('Quick spawn: no CLI types available');
    return;
  }

  quickSpawnState.visible = true;
  quickSpawnState.cliTypes = [...cliTypes];
  quickSpawnState.onSelect = onSelect;
  const matchIdx = preselectedCliType ? cliTypes.indexOf(preselectedCliType) : -1;
  quickSpawnState.selectedIndex = matchIdx >= 0 ? matchIdx : 0;

  quickSpawn.visible = true;
  quickSpawn.preselectedCliType = preselectedCliType;
  setQuickSpawnCallback(onSelect);

  logEvent('Quick spawn opened');
}

export function hideQuickSpawn(): void {
  quickSpawnState.visible = false;
  quickSpawn.visible = false;
  setQuickSpawnCallback(null);
}

// ============================================================================
// Gamepad handler — kept for legacy callers (no-ops now, Vue handles)
// ============================================================================

export function handleQuickSpawnButton(_button: string): void {
  // Vue QuickSpawnModal handles gamepad via useModalStack
}

export function renderQuickSpawn(): void {
  // No-op — Vue component renders
}

export function initQuickSpawnClickHandlers(): void {
  // No-op — Vue component handles click events
}
