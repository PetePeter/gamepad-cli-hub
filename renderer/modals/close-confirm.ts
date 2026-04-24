/**
 * Close confirmation modal — bridge to Vue CloseConfirmModal.
 *
 * Legacy callers still use showCloseConfirm() / hideCloseConfirm().
 * These now set reactive bridge state that App.vue's CloseConfirmModal observes.
 */

import { logEvent } from '../utils.js';
import {
  closeConfirm, setCloseConfirmCallback,
} from '../stores/modal-bridge.js';

// ============================================================================
// State — kept for legacy readers (navigation.ts, etc.)
// ============================================================================

export interface CloseConfirmState {
  visible: boolean;
  sessionId: string;
  sessionName: string;
  selectedIndex: number;
  draftCount: number;
}

export const closeConfirmState: CloseConfirmState = {
  visible: false,
  sessionId: '',
  sessionName: '',
  selectedIndex: 0,
  draftCount: 0,
};

// ============================================================================
// Show / Hide — bridge to Vue
// ============================================================================

export function showCloseConfirm(
  sessionId: string,
  sessionName: string,
  onConfirm: (sessionId: string) => void,
  draftCount?: number,
): void {
  // Sync legacy state for any remaining external readers
  closeConfirmState.visible = true;
  closeConfirmState.sessionId = sessionId;
  closeConfirmState.sessionName = sessionName;
  closeConfirmState.selectedIndex = 0;
  closeConfirmState.draftCount = draftCount ?? 0;

  // Set bridge state — Vue CloseConfirmModal reacts to this
  closeConfirm.visible = true;
  closeConfirm.sessionId = sessionId;
  closeConfirm.sessionName = sessionName;
  closeConfirm.draftCount = draftCount ?? 0;
  setCloseConfirmCallback(onConfirm);

  logEvent('Close confirm opened');
}

export function hideCloseConfirm(): void {
  closeConfirmState.visible = false;
  closeConfirm.visible = false;
  setCloseConfirmCallback(null);
}

// ============================================================================
// Gamepad handler — kept for legacy navigation.ts callers (no-op now, Vue handles)
// ============================================================================

export function handleCloseConfirmButton(_button: string): void {}
