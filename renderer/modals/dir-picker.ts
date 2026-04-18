/**
 * Directory picker modal — bridge to Vue DirPickerModal.vue.
 *
 * Legacy callers still use showDirPicker() / hideDirPicker().
 * These now set reactive bridge state that App.vue's DirPickerModal observes.
 */

import { logEvent } from '../utils.js';
import { dirPicker } from '../stores/modal-bridge.js';

export interface DirPickerState {
  visible: boolean;
  items: Array<{ name: string; path: string }>;
  selectedIndex: number;
  cliType: string;
}

export const dirPickerState: DirPickerState = {
  visible: false,
  items: [],
  selectedIndex: 0,
  cliType: '',
};

// ============================================================================
// Show / Hide — bridge to Vue
// ============================================================================

export function showDirPicker(cliType: string, dirs: Array<{ name: string; path: string }>, preselectedPath?: string): void {
  dirPickerState.visible = true;
  dirPickerState.items = dirs;
  dirPickerState.cliType = cliType;
  const matchIdx = preselectedPath ? dirs.findIndex(d => d.path === preselectedPath) : -1;
  dirPickerState.selectedIndex = matchIdx >= 0 ? matchIdx : 0;

  dirPicker.visible = true;
  dirPicker.cliType = cliType;
  dirPicker.items = [...dirs];
  dirPicker.preselectedPath = preselectedPath;

  logEvent('Dir picker opened');
}

export function hideDirPicker(): void {
  dirPickerState.visible = false;
  dirPicker.visible = false;
}

// ============================================================================
// Gamepad handler — kept for legacy callers (no-ops now, Vue handles)
// ============================================================================

export function handleDirPickerButton(_button: string): void {
  // Vue DirPickerModal handles gamepad via useModalStack
}
