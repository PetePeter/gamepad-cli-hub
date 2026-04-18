/**
 * Draft submenu — bridge to Vue DraftSubmenu.vue.
 *
 * Legacy callers still use showDraftSubmenu() / hideDraftSubmenu().
 * These now set reactive bridge state that App.vue's DraftSubmenu observes.
 *
 * The draft action picker (Apply/Edit/Delete/Cancel) also bridges via the
 * same pattern — DraftSubmenu.vue handles this internally.
 */

import { logEvent } from '../utils.js';
import { draftSubmenu } from '../stores/modal-bridge.js';
import { state } from '../state.js';

// ============================================================================
// Draft Submenu State — kept for legacy readers
// ============================================================================

interface DraftSubmenuState {
  visible: boolean;
  selectedIndex: number;
  drafts: Array<{ id: string; label: string; text: string }>;
}

export const draftSubmenuState: DraftSubmenuState = {
  visible: false,
  selectedIndex: 0,
  drafts: [],
};

// ============================================================================
// Show / Hide — bridge to Vue
// ============================================================================

export async function showDraftSubmenu(): Promise<void> {
  if (!state.activeSessionId) return;

  const drafts = await window.gamepadCli?.draftList(state.activeSessionId) ?? [];
  draftSubmenuState.drafts = drafts;
  draftSubmenuState.visible = true;
  draftSubmenuState.selectedIndex = 0;

  draftSubmenu.visible = true;
  draftSubmenu.items = [...drafts];

  logEvent('Draft submenu opened');
}

export function hideDraftSubmenu(): void {
  draftSubmenuState.visible = false;
  draftSubmenu.visible = false;
}

export function isDraftSubmenuVisible(): boolean {
  return draftSubmenuState.visible;
}

// ============================================================================
// Gamepad handler — kept for legacy callers (no-ops now, Vue handles)
// ============================================================================

export function handleDraftSubmenuButton(_button: string): void {
  // Vue DraftSubmenu handles gamepad via useModalStack
}

export function initDraftSubmenuClickHandlers(): void {
  // No-op — Vue component handles click events
}

// ============================================================================
// Draft Action state — kept for legacy readers
// ============================================================================

export interface DraftActionState {
  visible: boolean;
  selectedIndex: number;
  draft: { id: string; label: string; text: string } | null;
}

export const draftActionState: DraftActionState = {
  visible: false,
  selectedIndex: 0,
  draft: null,
};

export function isDraftActionVisible(): boolean {
  return draftActionState.visible;
}

export function handleDraftActionButton(_button: string): void {
  // Vue DraftSubmenu handles the action picker internally
}

export function hideDraftActionPicker(): void {
  draftActionState.visible = false;
}

export function initDraftActionClickHandlers(): void {
  // No-op — Vue component handles click events
}
