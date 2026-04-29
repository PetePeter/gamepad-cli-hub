/**
 * Unified Editor — legacy delegator.
 *
 * All functionality has moved to DraftEditor.vue. This file maintains
 * backward-compatible exports that delegate to registered callbacks.
 */

import type { PlanStatus } from '../../src/types/plan.js';
import type { PlanType } from '../../src/types/plan.js';

export interface DraftEditorState {
  visible: boolean;
  mode: 'draft' | 'plan';
  sessionId: string;
  draftId: string | null;
  label: string;
  text: string;
  planId: string | null;
  planCallbacks: PlanCallbacks | null;
  planStatus: PlanStatus;
  planStateInfo: string;
  planOriginalTitle: string;
  planOriginalDescription: string;
  planOriginalStatus: PlanStatus;
  planOriginalStateInfo: string;
  planSaveStatus: 'clean' | 'unsaved' | 'saving' | 'saved';
  autoSaveTimer: ReturnType<typeof setTimeout> | null;
  focusIndex: number;
}

export interface PlanCallbacks {
  onSave: (updates: { title: string; description: string; status: PlanStatus; stateInfo?: string; type?: PlanType }) => void;
  onDelete: () => void;
  onDone?: () => void;
  onApply?: () => void;
  onClose?: () => void;
}

export const draftEditorState: DraftEditorState = {
  visible: false,
  mode: 'draft',
  sessionId: '',
  draftId: null,
  label: '',
  text: '',
  planId: null,
  planCallbacks: null,
  planStatus: 'planning',
  planStateInfo: '',
  planOriginalTitle: '',
  planOriginalDescription: '',
  planOriginalStatus: 'planning',
  planOriginalStateInfo: '',
  planSaveStatus: 'clean',
  autoSaveTimer: null,
  focusIndex: 0,
};

// ---------------------------------------------------------------------------
// Callback registrations
// ---------------------------------------------------------------------------

type DraftEditorOpener = (sessionId: string, draft?: { id: string; label: string; text: string }) => void;
let draftEditorOpener: DraftEditorOpener | null = null;
export function setDraftEditorOpener(fn: DraftEditorOpener) { draftEditorOpener = fn; }

type PlanEditorOpener = (sessionId: string, plan: { id: string; title: string; description: string; status: PlanStatus; stateInfo?: string; type?: PlanType; completionNotes?: string }, callbacks: PlanCallbacks) => void;
let planEditorOpener: PlanEditorOpener | null = null;
export function setPlanEditorOpener(fn: PlanEditorOpener) { planEditorOpener = fn; }

let draftEditorCloser: (() => void) | null = null;
export function setDraftEditorCloser(fn: () => void) { draftEditorCloser = fn; }

let draftEditorVisibilityChecker: (() => boolean) | null = null;
export function setDraftEditorVisibilityChecker(fn: () => boolean) { draftEditorVisibilityChecker = fn; }

let draftEditorButtonHandler: ((button: string) => void) | null = null;
export function setDraftEditorButtonHandler(fn: (button: string) => void) { draftEditorButtonHandler = fn; }

let planChangesChecker: (() => boolean) | null = null;
export function setPlanChangesChecker(fn: () => boolean) { planChangesChecker = fn; }

// ---------------------------------------------------------------------------
// Backward-compatible exports (delegated)
// ---------------------------------------------------------------------------

export function initDraftEditor(): void {
  // No-op — DOM is managed by DraftEditor.vue
}

export function showDraftEditor(sessionId: string, existingDraft?: { id: string; label: string; text: string }): void {
  draftEditorOpener?.(sessionId, existingDraft);
}

export function showPlanInEditor(
  sessionId: string,
  plan: { id: string; title: string; description: string; status: PlanStatus; stateInfo?: string; type?: PlanType; humanId?: string; createdAt?: number; stateUpdatedAt?: number; completionNotes?: string },
  callbacks: PlanCallbacks,
): void {
  planEditorOpener?.(sessionId, plan, callbacks);
}

export function hideDraftEditor(): void {
  draftEditorCloser?.();
}

export function closeEditor(): void {
  draftEditorCloser?.();
}

export function isDraftEditorVisible(): boolean {
  return draftEditorVisibilityChecker?.() ?? false;
}

export function handleDraftEditorButton(button: string): void {
  if (!draftEditorButtonHandler) {
    console.warn('[DraftEditor] handleDraftEditorButton called but no handler registered');
    return;
  }
  draftEditorButtonHandler(button);
}

export function hasUnsavedPlanChanges(): boolean {
  return planChangesChecker?.() ?? false;
}
