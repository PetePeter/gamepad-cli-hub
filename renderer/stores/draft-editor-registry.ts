/**
 * Draft editor registry — module-level callback registry for non-Vue callers.
 *
 * The active window controller (MainWindowApp.vue or SnapOutWindow.vue)
 * registers opener/closer/handler callbacks on mount. Non-Vue modules
 * (bindings.ts, navigation.ts, paste-handler.ts) call through these to
 * interact with the mounted DraftEditor.vue instance.
 */

import type { PlanStatus, PlanType } from '../../src/types/plan.js';
import type { PlanCallbacks } from '../components/panels/DraftEditor.vue';

export type { PlanCallbacks };

type DraftEditorOpener = (sessionId: string, draft?: { id: string; label: string; text: string }) => void;
type PlanEditorOpener = (sessionId: string, plan: { id: string; title: string; description: string; status: PlanStatus; stateInfo?: string; type?: PlanType; completionNotes?: string }, callbacks: PlanCallbacks) => void;

let _opener: DraftEditorOpener | null = null;
let _planOpener: PlanEditorOpener | null = null;
let _closer: (() => void) | null = null;
let _visibilityChecker: (() => boolean) | null = null;
let _buttonHandler: ((button: string) => void) | null = null;
let _planChangesChecker: (() => boolean) | null = null;

export function setDraftEditorOpener(fn: DraftEditorOpener): void { _opener = fn; }
export function setPlanEditorOpener(fn: PlanEditorOpener): void { _planOpener = fn; }
export function setDraftEditorCloser(fn: () => void): void { _closer = fn; }
export function setDraftEditorVisibilityChecker(fn: () => boolean): void { _visibilityChecker = fn; }
export function setDraftEditorButtonHandler(fn: (button: string) => void): void { _buttonHandler = fn; }
export function setPlanChangesChecker(fn: () => boolean): void { _planChangesChecker = fn; }

export function showDraftEditor(sessionId: string, existingDraft?: { id: string; label: string; text: string }): void {
  _opener?.(sessionId, existingDraft);
}

export function showPlanInEditor(
  sessionId: string,
  plan: { id: string; title: string; description: string; status: PlanStatus; stateInfo?: string; type?: PlanType; humanId?: string; createdAt?: number; stateUpdatedAt?: number; completionNotes?: string },
  callbacks: PlanCallbacks,
): void {
  _planOpener?.(sessionId, plan, callbacks);
}

export function hideDraftEditor(): void { _closer?.(); }
export function closeEditor(): void { _closer?.(); }

export function isDraftEditorVisible(): boolean { return _visibilityChecker?.() ?? false; }

export function handleDraftEditorButton(button: string): void {
  if (!_buttonHandler) {
    console.warn('[DraftEditorRegistry] handleDraftEditorButton called but no handler registered');
    return;
  }
  _buttonHandler(button);
}

export function hasUnsavedPlanChanges(): boolean { return _planChangesChecker?.() ?? false; }
