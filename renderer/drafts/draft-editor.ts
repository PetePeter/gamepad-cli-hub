/**
 * Unified Editor — slide-down panel for composing/editing drafts AND plans.
 * Appears between the tab bar/draft strip and the terminal.
 * When open, keyboard input routes here instead of the terminal.
 * Gamepad D-pad navigates between fields; A activates; B cancels.
 *
 * Two modes:
 *   - 'draft' — per-session draft prompts (Save/Apply/Delete/Cancel)
 *   - 'plan'  — per-directory plan items (Apply/Done/Delete/Cancel)
 */

import { refreshDraftStrip } from './draft-strip.js';
import { showPlanDeleteConfirm } from '../modals/plan-delete-confirm.js';
import { toDirection, logEvent } from '../utils.js';
import type { PlanStatus } from '../../src/types/plan.js';

// ---------------------------------------------------------------------------
// Types & state
// ---------------------------------------------------------------------------

export interface DraftEditorState {
  visible: boolean;
  mode: 'draft' | 'plan';
  sessionId: string;
  // Draft-specific
  draftId: string | null;
  label: string;
  text: string;
  // Plan-specific
  planId: string | null;
  planCallbacks: PlanCallbacks | null;
  planStatus: PlanStatus;
  planStateInfo: string;
  // Shared
  focusIndex: number;
}

export interface PlanCallbacks {
  onSave: (updates: { title: string; description: string; status: PlanStatus; stateInfo?: string }) => void;
  onDelete: () => void;
  onDone?: () => void;
  onApply?: () => void;
}

const ALL_FOCUS_IDS = [
  'draftPlanStateSelect', 'draftPlanStateInfo',
  'draftLabelInput', 'draftContentInput',
  'draftSaveBtn', 'draftApplyBtn', 'draftDoneBtn',
  'draftDeleteBtn', 'draftCancelBtn',
] as const;

const BUTTON_IDS = ['draftSaveBtn', 'draftApplyBtn', 'draftDoneBtn', 'draftDeleteBtn', 'draftCancelBtn'] as const;

export const draftEditorState: DraftEditorState = {
  visible: false,
  mode: 'draft',
  sessionId: '',
  draftId: null,
  label: '',
  text: '',
  planId: null,
  planCallbacks: null,
  planStatus: 'pending',
  planStateInfo: '',
  focusIndex: 0,
};

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/** Create the editor DOM container once. Called at app startup. */
export function initDraftEditor(): void {
  const existing = document.getElementById('draftEditor');
  if (existing) return;

  const editor = document.createElement('div');
  editor.className = 'draft-editor';
  editor.id = 'draftEditor';
  editor.style.display = 'none';

  editor.innerHTML = `
    <div class="draft-editor-header">
      <span class="draft-editor-title">📝 New Draft</span>
      <div class="draft-editor-actions">
        <button class="btn btn--primary btn--sm" id="draftSaveBtn">Save</button>
        <button class="btn btn--primary btn--sm" id="draftApplyBtn">Apply</button>
        <button class="btn btn--success btn--sm" id="draftDoneBtn" style="display:none">✓ Done</button>
        <button class="btn btn--danger btn--sm" id="draftDeleteBtn">Delete</button>
        <button class="btn btn--secondary btn--sm" id="draftCancelBtn">Cancel</button>
      </div>
    </div>
    <div class="draft-editor-plan-state" id="draftPlanStateRow" style="display:none">
      <select class="draft-editor-plan-select" id="draftPlanStateSelect">
        <option value="pending">⏸ Pending</option>
        <option value="startable">▶ Ready</option>
        <option value="doing">🔄 In Progress</option>
        <option value="blocked">⛔ Blocked</option>
        <option value="question">❓ Question</option>
      </select>
      <input
        type="text"
        class="draft-editor-plan-info"
        id="draftPlanStateInfo"
        placeholder="Add state context..."
        maxlength="200"
        style="display:none"
      />
    </div>
    <input type="text" class="draft-editor-label" id="draftLabelInput" placeholder="Title..." maxlength="100" />
    <textarea class="draft-editor-content" id="draftContentInput" placeholder="Enter your prompt..." rows="4"></textarea>
  `;

  const mainArea = document.getElementById('mainArea');
  const terminalContainer = mainArea?.querySelector('.terminal-container');
  const draftStrip = document.getElementById('draftStrip');

  if (mainArea && terminalContainer) {
    if (draftStrip && draftStrip.nextSibling) {
      mainArea.insertBefore(editor, draftStrip.nextSibling);
    } else {
      mainArea.insertBefore(editor, terminalContainer);
    }
  } else if (mainArea) {
    mainArea.appendChild(editor);
  }

  // Wire button event handlers — dispatch based on current mode
  document.getElementById('draftSaveBtn')?.addEventListener('click', () => handleButtonClick('save'));
  document.getElementById('draftApplyBtn')?.addEventListener('click', () => handleButtonClick('apply'));
  document.getElementById('draftDoneBtn')?.addEventListener('click', () => handleButtonClick('done'));
  document.getElementById('draftDeleteBtn')?.addEventListener('click', () => handleButtonClick('delete'));
  document.getElementById('draftCancelBtn')?.addEventListener('click', () => hideDraftEditor());
  document.getElementById('draftPlanStateSelect')?.addEventListener('change', () => syncPlanStateInfoVisibility());

  const labelInput = document.getElementById('draftLabelInput') as HTMLInputElement | null;
  labelInput?.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      saveAndDismiss();
    } else if (e.key === 'n' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      saveAndDismiss();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      (document.getElementById('draftContentInput') as HTMLTextAreaElement | null)?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      hideDraftEditor();
    }
  });

  const contentInput = document.getElementById('draftContentInput') as HTMLTextAreaElement | null;
  contentInput?.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      saveAndDismiss();
    } else if (e.key === 'n' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      saveAndDismiss();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      hideDraftEditor();
    }
  });
}

// ---------------------------------------------------------------------------
// Show / hide
// ---------------------------------------------------------------------------

/** Show the editor in draft mode. */
export function showDraftEditor(sessionId: string, existingDraft?: { id: string; label: string; text: string }): void {
  const editor = document.getElementById('draftEditor');
  if (!editor) return;

  resetState();
  draftEditorState.mode = 'draft';
  draftEditorState.sessionId = sessionId;
  draftEditorState.visible = true;

  const titleEl = editor.querySelector('.draft-editor-title');
  const labelInput = document.getElementById('draftLabelInput') as HTMLInputElement | null;
  const contentInput = document.getElementById('draftContentInput') as HTMLTextAreaElement | null;
  const stateSelect = document.getElementById('draftPlanStateSelect') as HTMLSelectElement | null;
  const stateInfo = document.getElementById('draftPlanStateInfo') as HTMLInputElement | null;

  if (existingDraft) {
    draftEditorState.draftId = existingDraft.id;
    draftEditorState.label = existingDraft.label;
    draftEditorState.text = existingDraft.text;
    if (titleEl) titleEl.textContent = '📝 Edit Draft';
    if (labelInput) labelInput.value = existingDraft.label;
    if (contentInput) contentInput.value = existingDraft.text;
  } else {
    if (titleEl) titleEl.textContent = '📝 New Draft';
    if (labelInput) labelInput.value = '';
    if (contentInput) contentInput.value = '';
  }

  hidePlanStateControls();
  enableEditorInputs(labelInput, contentInput);
  setInputEditable(stateSelect);
  setInputEditable(stateInfo);

  // Draft mode: Save, Apply, Delete, Cancel (no Done)
  setButtonVisibility({ save: true, apply: true, done: false, delete: true, cancel: true });

  editor.style.display = 'flex';
  applyEditorFocus();
}

/** Show the editor in plan mode for a plan item. */
export function showPlanInEditor(
  sessionId: string,
  plan: { id: string; title: string; description: string; status: PlanStatus; stateInfo?: string },
  callbacks: PlanCallbacks,
): void {
  const editor = document.getElementById('draftEditor');
  if (!editor) return;

  resetState();
  draftEditorState.mode = 'plan';
  draftEditorState.sessionId = sessionId;
  draftEditorState.visible = true;
  draftEditorState.planId = plan.id;
  draftEditorState.planCallbacks = callbacks;
  draftEditorState.planStatus = plan.status;
  draftEditorState.planStateInfo = plan.stateInfo ?? '';

  const titleEl = editor.querySelector('.draft-editor-title');
  const labelInput = document.getElementById('draftLabelInput') as HTMLInputElement | null;
  const contentInput = document.getElementById('draftContentInput') as HTMLTextAreaElement | null;
  const stateRow = document.getElementById('draftPlanStateRow') as HTMLElement | null;
  const stateSelect = document.getElementById('draftPlanStateSelect') as HTMLSelectElement | null;
  const stateInfo = document.getElementById('draftPlanStateInfo') as HTMLInputElement | null;

  const statusLabels: Record<string, string> = {
    pending: '⏸ Pending',
    startable: '▶ Ready',
    doing: '🔄 In Progress',
    blocked: '⛔ Blocked',
    question: '❓ Question',
    done: '✓ Done',
  };
  if (titleEl) titleEl.textContent = `🗺️ Edit Plan · ${statusLabels[plan.status] ?? plan.status}`;
  if (labelInput) labelInput.value = plan.title;
  if (contentInput) contentInput.value = plan.description;
  if (stateRow) stateRow.style.display = '';
  if (stateSelect) {
    stateSelect.value = plan.status === 'done' ? 'pending' : plan.status;
  }
  if (stateInfo) stateInfo.value = plan.stateInfo ?? '';
  enableEditorInputs(labelInput, contentInput);
  setInputEditable(stateSelect);
  setInputEditable(stateInfo);
  if (stateSelect) stateSelect.disabled = plan.status === 'done';
  syncPlanStateInfoVisibility();

  // Plan mode: Save, Apply (startable/doing), Done (doing), Delete, Cancel
  setButtonVisibility({
    save: true,
    apply: (plan.status === 'startable' || plan.status === 'doing') && !!callbacks.onApply,
    done: plan.status === 'doing' && !!callbacks.onDone,
    delete: true,
    cancel: true,
  });

  // Relabel Apply for plan context
  const applyBtn = document.getElementById('draftApplyBtn');
  if (applyBtn) {
    applyBtn.textContent = plan.status === 'doing' ? '↻ Apply Again' : '▶ Apply';
  }

  editor.style.display = 'flex';
  applyEditorFocus();
}

/** Hide the editor (both modes). */
export function hideDraftEditor(): void {
  const editor = document.getElementById('draftEditor');
  if (editor) editor.style.display = 'none';
  resetState();
}

/** Check if the editor is currently visible (either mode). */
export function isDraftEditorVisible(): boolean {
  return draftEditorState.visible;
}

// ---------------------------------------------------------------------------
// Gamepad navigation
// ---------------------------------------------------------------------------

/** Handle gamepad button presses while the editor is visible. */
export function handleDraftEditorButton(button: string): void {
  const dir = toDirection(button);
  const rendered = getVisibleFocusIds();

  if (dir === 'down') {
    draftEditorState.focusIndex = (draftEditorState.focusIndex + 1) % rendered.length;
    applyEditorFocus();
    return;
  }
  if (dir === 'up') {
    draftEditorState.focusIndex = (draftEditorState.focusIndex - 1 + rendered.length) % rendered.length;
    applyEditorFocus();
    return;
  }

  switch (button) {
    case 'A': {
      const focused = rendered[draftEditorState.focusIndex];
      if (focused) document.getElementById(focused)?.click();
      break;
    }
    case 'B':
      hideDraftEditor();
      break;
  }
}

// ---------------------------------------------------------------------------
// Button dispatch (mode-aware)
// ---------------------------------------------------------------------------

/** Ctrl+Enter / Ctrl+S shortcut — save current content and close the editor. */
function saveAndDismiss(): void {
  handleButtonClick('save');
}

function handleButtonClick(action: 'save' | 'apply' | 'done' | 'delete'): void {
  if (draftEditorState.mode === 'draft') {
    if (action === 'save') saveDraft();
    else if (action === 'apply') applyDraft();
    else if (action === 'delete') deleteDraft();
  } else {
    if (action === 'save') savePlan();
    else if (action === 'apply') applyPlan();
    else if (action === 'done') donePlan();
    else if (action === 'delete') deletePlan();
  }
}

// ---------------------------------------------------------------------------
// Draft actions
// ---------------------------------------------------------------------------

export async function saveDraft(): Promise<void> {
  const label = (document.getElementById('draftLabelInput') as HTMLInputElement | null)?.value.trim() || '';
  const text = (document.getElementById('draftContentInput') as HTMLTextAreaElement | null)?.value || '';
  if (!label) return;

  const { sessionId, draftId } = draftEditorState;
  try {
    if (draftId) {
      await window.gamepadCli.draftUpdate(draftId, { label, text });
    } else {
      await window.gamepadCli.draftCreate(sessionId, label, text);
    }
  } catch (err) {
    console.error('[Editor] Failed to save draft:', err);
  }

  hideDraftEditor();
  await refreshDraftStrip(sessionId || null);
}

export async function applyDraft(): Promise<void> {
  const text = (document.getElementById('draftContentInput') as HTMLTextAreaElement | null)?.value || '';
  const sessId = draftEditorState.sessionId;  // Capture sessionId before async operations
  const { draftId, sessionId } = draftEditorState;
  hideDraftEditor();

  if (text && sessId) {
    try {
      // Write content to temp file for draft apply
      const result = await window.gamepadCli?.writeTempContent(text);
      if (!result?.success) {
        console.error('[Editor] Failed to write temp file:', result?.error);
        return;
      }

      const filePath = result.path;
      // Route through ptyWrite to the active session
      await window.gamepadCli?.ptyWrite(sessId, `<${filePath}`);

      // Clean up temp file after apply
      if (filePath) {
        try { await window.gamepadCli?.deleteTemp(filePath); }
        catch (err) { console.debug('[Editor] Could not delete temp file:', err); }
      }
    } catch (err) {
      console.error('[Editor] Failed to apply draft:', err);
    }
  }

  if (draftId) {
    try { await window.gamepadCli?.draftDelete(draftId); }
    catch (err) { console.error('[Editor] Failed to delete draft after apply:', err); }
  }

  await refreshDraftStrip(sessionId || null);
  logEvent(`Draft applied: ${draftId}`);
}

export async function deleteDraft(): Promise<void> {
  const { draftId, sessionId } = draftEditorState;
  hideDraftEditor();

  if (draftId) {
    try { await window.gamepadCli?.draftDelete(draftId); }
    catch (err) { console.error('[Editor] Failed to delete draft:', err); }
  }

  await refreshDraftStrip(sessionId || null);
  logEvent(`Draft deleted: ${draftId}`);
}

// ---------------------------------------------------------------------------
// Plan actions
// ---------------------------------------------------------------------------

function savePlan(): void {
  const cb = draftEditorState.planCallbacks;
  if (!cb) return;
  const title = (document.getElementById('draftLabelInput') as HTMLInputElement | null)?.value ?? '';
  const description = (document.getElementById('draftContentInput') as HTMLTextAreaElement | null)?.value ?? '';
  const stateSelect = document.getElementById('draftPlanStateSelect') as HTMLSelectElement | null;
  const stateInfo = (document.getElementById('draftPlanStateInfo') as HTMLInputElement | null)?.value ?? '';
  const status = stateSelect?.disabled
    ? draftEditorState.planStatus
    : ((stateSelect?.value as PlanStatus | undefined) ?? draftEditorState.planStatus);
  cb.onSave({ title, description, status, stateInfo });
  hideDraftEditor();
}

function applyPlan(): void {
  draftEditorState.planCallbacks?.onApply?.();
}

function donePlan(): void {
  draftEditorState.planCallbacks?.onDone?.();
}

function deletePlan(): void {
  const title = (document.getElementById('draftLabelInput') as HTMLInputElement | null)?.value.trim() || 'this plan item';
  showPlanDeleteConfirm(title, () => draftEditorState.planCallbacks?.onDelete());
}

// ---------------------------------------------------------------------------
// Focus helpers
// ---------------------------------------------------------------------------

/** Get IDs of focusable elements that are currently visible. */
function getVisibleFocusIds(): string[] {
  return ALL_FOCUS_IDS.filter(id => {
    let el = document.getElementById(id) as HTMLElement | null;
    while (el) {
      if (el.style.display === 'none') return false;
      el = el.parentElement;
    }
    return true;
  });
}

/** Focus the element at the current focusIndex and highlight buttons. */
function applyEditorFocus(): void {
  const ids = getVisibleFocusIds();
  if (draftEditorState.focusIndex >= ids.length) draftEditorState.focusIndex = 0;
  const id = ids[draftEditorState.focusIndex];
  const el = id ? document.getElementById(id) : null;
  el?.focus();

  for (const btnId of BUTTON_IDS) {
    document.getElementById(btnId)?.classList.remove('btn--focused');
  }
  if (id && !id.endsWith('Input')) {
    el?.classList.add('btn--focused');
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetState(): void {
  draftEditorState.visible = false;
  draftEditorState.mode = 'draft';
  draftEditorState.draftId = null;
  draftEditorState.label = '';
  draftEditorState.text = '';
  draftEditorState.planId = null;
  draftEditorState.planCallbacks = null;
  draftEditorState.planStatus = 'pending';
  draftEditorState.planStateInfo = '';
  draftEditorState.focusIndex = 0;
  hidePlanStateControls();
}

function setButtonVisibility(vis: { save: boolean; apply: boolean; done: boolean; delete: boolean; cancel: boolean }): void {
  const set = (id: string, show: boolean) => {
    const el = document.getElementById(id);
    if (el) el.style.display = show ? '' : 'none';
  };
  set('draftSaveBtn', vis.save);
  set('draftApplyBtn', vis.apply);
  set('draftDoneBtn', vis.done);
  set('draftDeleteBtn', vis.delete);
  set('draftCancelBtn', vis.cancel);
}

function enableEditorInputs(
  labelInput: HTMLInputElement | null,
  contentInput: HTMLTextAreaElement | null,
): void {
  setInputEditable(labelInput);
  setInputEditable(contentInput);
}

function setInputEditable(input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null): void {
  if (!input) return;
  input.disabled = false;
  if ('readOnly' in input) {
    input.readOnly = false;
  }
}

function hidePlanStateControls(): void {
  const stateRow = document.getElementById('draftPlanStateRow') as HTMLElement | null;
  const stateSelect = document.getElementById('draftPlanStateSelect') as HTMLSelectElement | null;
  const stateInfo = document.getElementById('draftPlanStateInfo') as HTMLInputElement | null;
  if (stateRow) stateRow.style.display = 'none';
  if (stateSelect) {
    stateSelect.value = 'pending';
    stateSelect.disabled = false;
  }
  if (stateInfo) {
    stateInfo.value = '';
    stateInfo.style.display = 'none';
  }
}

function syncPlanStateInfoVisibility(): void {
  const stateSelect = document.getElementById('draftPlanStateSelect') as HTMLSelectElement | null;
  const stateInfo = document.getElementById('draftPlanStateInfo') as HTMLInputElement | null;
  if (!stateSelect || !stateInfo) return;
  const needsInfo = stateSelect.value === 'blocked' || stateSelect.value === 'question';
  stateInfo.style.display = needsInfo ? '' : 'none';
  if (!needsInfo) stateInfo.value = '';
}
