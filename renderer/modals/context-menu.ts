/**
 * Context menu modal — bridge to Vue ContextMenu.vue.
 *
 * Legacy callers still use showContextMenu() / hideContextMenu().
 * These now set reactive bridge state that App.vue's ContextMenu observes.
 * Action dispatch logic lives in App.vue's onContextMenuAction handler.
 */

import { logEvent } from '../utils.js';
import { getTerminalManager } from '../runtime/terminal-provider.js';
import { contextMenu } from '../stores/modal-bridge.js';
import { state } from '../state.js';

// ============================================================================
// State — kept for legacy readers
// ============================================================================

export interface ContextMenuState {
  visible: boolean;
  selectedIndex: number;
  selectedText: string;
  hasSelection: boolean;
  sourceSessionId: string;
  mode: 'mouse' | 'gamepad';
}

export const contextMenuState: ContextMenuState = {
  visible: false,
  selectedIndex: 0,
  selectedText: '',
  hasSelection: false,
  sourceSessionId: '',
  mode: 'gamepad',
};

// ============================================================================
// Helpers still needed by App.vue's onContextMenuAction
// ============================================================================

/** Returns true if the active session's CLI type has any configured sequence groups */
export function hasSequenceItems(): boolean {
  if (!state.activeSessionId) return false;
  const activeSession = state.sessions.find(s => s.id === state.activeSessionId);
  if (!activeSession) return false;
  const sequences = state.cliSequencesCache[activeSession.cliType];
  if (!sequences) return false;
  return Object.values(sequences).some(group => group.length > 0);
}

/** Collect all sequence items from all groups for the active session's CLI type */
export function collectSequenceItems(): Array<{ label: string; sequence: string }> {
  if (!state.activeSessionId) return [];
  const activeSession = state.sessions.find(s => s.id === state.activeSessionId);
  if (!activeSession) return [];
  const sequences = state.cliSequencesCache[activeSession.cliType];
  if (!sequences) return [];
  return Object.values(sequences).flat();
}

// ============================================================================
// Show / Hide — bridge to Vue
// ============================================================================

export function showContextMenu(x: number, y: number, sessionId: string, mode: 'mouse' | 'gamepad'): void {
  const tm = getTerminalManager();
  const view = tm?.getActiveView() ?? null;

  const selectedText = view?.getSelection() ?? '';
  const hasSelection = view?.hasSelection() ?? false;

  // Sync legacy state for remaining external readers
  contextMenuState.visible = true;
  contextMenuState.selectedText = selectedText;
  contextMenuState.hasSelection = hasSelection;
  contextMenuState.sourceSessionId = sessionId;
  contextMenuState.mode = mode;
  contextMenuState.selectedIndex = 0;

  // Set bridge state — Vue ContextMenu reacts to this
  contextMenu.visible = true;
  contextMenu.mode = mode;
  contextMenu.mouseX = x;
  contextMenu.mouseY = y;
  contextMenu.selectedText = selectedText;
  contextMenu.hasSelection = hasSelection;
  contextMenu.sourceSessionId = sessionId;

  logEvent('Context menu opened');
}

export function hideContextMenu(): void {
  contextMenuState.visible = false;
  contextMenu.visible = false;
}

// ============================================================================
// Gamepad handler — kept for legacy navigation.ts callers (no-ops now, Vue handles)
// ============================================================================

export function handleContextMenuButton(_button: string): void {
  // Vue ContextMenu handles gamepad via useModalStack
}

export function initContextMenuClickHandlers(): void {
  // No-op — Vue component handles click events
}
