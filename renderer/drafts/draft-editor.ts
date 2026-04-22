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

import { showPlanDeleteConfirm } from '../modals/plan-delete-confirm.js';
import { toDirection, logEvent } from '../utils.js';
import type { PlanStatus } from '../../src/types/plan.js';
import { deliverBulkText } from '../paste-handler.js';

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
  planOriginalTitle: string;
  planOriginalDescription: string;
  planOriginalStatus: PlanStatus;
  planOriginalStateInfo: string;
  planSaveStatus: 'clean' | 'unsaved' | 'saving' | 'saved';
  autoSaveTimer: ReturnType<typeof setTimeout> | null;
  // Shared
  focusIndex: number;
}

export interface PlanCallbacks {
  onSave: (updates: { title: string; description: string; status: PlanStatus; stateInfo?: string }) => void;
  onDelete: () => void;
  onDone?: () => void;
  onApply?: () => void;
  onClose?: () => void;
}

const ALL_FOCUS_IDS = [
  'draftLabelInput',        // Title first (auto-focused in plan mode)
  'draftPlanStateSelect', 'draftPlanStateInfo',
  'draftContentInput',
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
  planOriginalTitle: '',
  planOriginalDescription: '',
  planOriginalStatus: 'pending',
  planOriginalStateInfo: '',
  planSaveStatus: 'clean',
  autoSaveTimer: null,
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
        <span class="plan-save-status plan-save-status--hidden" id="planSaveStatus"></span>
        <button class="btn btn--primary btn--sm" id="draftSaveBtn">Save</button>
        <button class="btn btn--primary btn--sm" id="draftApplyBtn">Apply</button>
        <button class="btn btn--success btn--sm" id="draftDoneBtn" style="display:none">✓ Done</button>
        <button class="btn btn--danger btn--sm" id="draftDeleteBtn">Delete</button>
        <button class="btn btn--secondary btn--sm" id="draftCancelBtn">Cancel</button>
      </div>
    </div>
    <div class="draft-editor-title-row">
      <input type="text" class="draft-editor-label" id="draftLabelInput" placeholder="Title..." maxlength="100" />
      <select class="draft-editor-plan-select" id="draftPlanStateSelect" style="display:none">
        <option value="pending">⏸ Pending</option>
        <option value="startable">▶ Ready</option>
        <option value="doing">🔄 In Progress</option>
        <option value="wait-tests">⏳ Wait Tests</option>
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
    <textarea class="draft-editor-content" id="draftContentInput" placeholder="Enter your prompt..." rows="4"></textarea>
  `;

  const mainArea = document.getElementById('mainArea');
  const terminalContainer = mainArea?.querySelector('.terminal-container, .snap-out-terminal');
  const actionDock = mainArea?.querySelector('.chip-action-dock');

  if (mainArea && actionDock) {
    mainArea.insertBefore(editor, actionDock);
  } else if (mainArea && terminalContainer) {
    mainArea.appendChild(editor);
  } else if (mainArea) {
    mainArea.appendChild(editor);
  }

  // Wire button event handlers — dispatch based on current mode
  document.getElementById('draftSaveBtn')?.addEventListener('click', () => handleButtonClick('save'));
  document.getElementById('draftApplyBtn')?.addEventListener('click', () => handleButtonClick('apply'));
  document.getElementById('draftDoneBtn')?.addEventListener('click', () => handleButtonClick('done'));
  document.getElementById('draftDeleteBtn')?.addEventListener('click', () => handleButtonClick('delete'));
  document.getElementById('draftCancelBtn')?.addEventListener('click', () => closeEditor());
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
      closeEditor();
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
      closeEditor();
    }
  });

  // Auto-save listeners: blur triggers debounced save, input marks as unsaved
  const autoSaveFields = ['draftLabelInput', 'draftContentInput', 'draftPlanStateSelect', 'draftPlanStateInfo'];
  for (const id of autoSaveFields) {
    document.getElementById(id)?.addEventListener('blur', scheduleAutoSave);
    document.getElementById(id)?.addEventListener('input', () => updateSaveStatus('unsaved'));
  }
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

  updateSaveStatus('clean');

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
  draftEditorState.planOriginalTitle = plan.title;
  draftEditorState.planOriginalDescription = plan.description;
  draftEditorState.planOriginalStatus = plan.status;
  draftEditorState.planOriginalStateInfo = plan.stateInfo ?? '';

  const titleEl = editor.querySelector('.draft-editor-title');
  const labelInput = document.getElementById('draftLabelInput') as HTMLInputElement | null;
  const contentInput = document.getElementById('draftContentInput') as HTMLTextAreaElement | null;
  const stateSelect = document.getElementById('draftPlanStateSelect') as HTMLSelectElement | null;
  const stateInfo = document.getElementById('draftPlanStateInfo') as HTMLInputElement | null;

  const statusLabels: Record<string, string> = {
    pending: '⏸ Pending',
    startable: '▶ Ready',
    doing: '🔄 In Progress',
    'wait-tests': '⏳ Wait Tests',
    blocked: '⛔ Blocked',
    question: '❓ Question',
    done: '✓ Done',
  };
  if (titleEl) titleEl.textContent = `🗺️ Edit Plan · ${statusLabels[plan.status] ?? plan.status}`;
  if (labelInput) labelInput.value = plan.title;
  if (contentInput) contentInput.value = plan.description;
  if (stateSelect) {
    stateSelect.style.display = '';
    stateSelect.value = plan.status === 'done' ? 'pending' : plan.status;
  }
  if (stateInfo) stateInfo.value = plan.stateInfo ?? '';
  enableEditorInputs(labelInput, contentInput);
  setInputEditable(stateSelect);
  setInputEditable(stateInfo);
  if (stateSelect) stateSelect.disabled = plan.status === 'done';
  syncPlanStateInfoVisibility();

  // Set focus index for gamepad navigation (actual focus happens in applyEditorFocus)
  draftEditorState.focusIndex = ALL_FOCUS_IDS.indexOf('draftLabelInput');
  updateSaveStatus('clean');

  // Plan mode: Save, Apply (startable/doing/wait-tests), Done (doing/wait-tests), Delete, Cancel
  setButtonVisibility({
    save: true,
    apply: (plan.status === 'startable' || plan.status === 'doing' || plan.status === 'wait-tests') && !!callbacks.onApply,
    done: (plan.status === 'doing' || plan.status === 'wait-tests') && !!callbacks.onDone,
    delete: true,
    cancel: true,
  });

  // Relabel Apply for plan context
  const applyBtn = document.getElementById('draftApplyBtn');
  if (applyBtn) {
    applyBtn.textContent = plan.status === 'doing' || plan.status === 'wait-tests' ? '↻ Apply Again' : '▶ Apply';
  }

  editor.style.display = 'flex';
  applyEditorFocus();
  labelInput?.select();  // Select text after focus for immediate typing
}

/** Hide the editor (both modes). */
export function hideDraftEditor(): void {
  // Cancel any pending auto-save timer
  if (draftEditorState.autoSaveTimer) {
    clearTimeout(draftEditorState.autoSaveTimer);
    draftEditorState.autoSaveTimer = null;
  }
  const editor = document.getElementById('draftEditor');
  if (editor) editor.style.display = 'none';
  resetState();
}

/** Close the editor as a user dismissal and notify plan-mode owners. */
export function closeEditor(): void {
  draftEditorState.planCallbacks?.onClose?.();
  hideDraftEditor();
}

/** Check if the editor is currently visible (either mode). */
export function isDraftEditorVisible(): boolean {
  return draftEditorState.visible;
}

/** Whether the currently visible plan editor has unsaved field changes. */
export function hasUnsavedPlanChanges(): boolean {
  if (!draftEditorState.visible || draftEditorState.mode !== 'plan') return false;

  const title = (document.getElementById('draftLabelInput') as HTMLInputElement | null)?.value ?? '';
  const description = (document.getElementById('draftContentInput') as HTMLTextAreaElement | null)?.value ?? '';
  const stateSelect = document.getElementById('draftPlanStateSelect') as HTMLSelectElement | null;
  const stateInfoInput = document.getElementById('draftPlanStateInfo') as HTMLInputElement | null;
  const status = stateSelect?.disabled
    ? draftEditorState.planStatus
    : ((stateSelect?.value as PlanStatus | undefined) ?? draftEditorState.planStatus);
  const stateInfo = status === 'blocked' || status === 'question'
    ? (stateInfoInput?.value ?? '')
    : '';

  return title !== draftEditorState.planOriginalTitle ||
    description !== draftEditorState.planOriginalDescription ||
    status !== draftEditorState.planOriginalStatus ||
    stateInfo !== draftEditorState.planOriginalStateInfo;
}

/** Whether the currently visible draft editor has unsaved field changes. */
function hasUnsavedDraftChanges(): boolean {
  if (!draftEditorState.visible || draftEditorState.mode !== 'draft') return false;
  const label = (document.getElementById('draftLabelInput') as HTMLInputElement | null)?.value.trim() || '';
  const text = (document.getElementById('draftContentInput') as HTMLTextAreaElement | null)?.value || '';
  return label !== draftEditorState.label || text !== draftEditorState.text;
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
      closeEditor();
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
  await refreshChipBar(sessionId || null);
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
      // Route through the active CLI's configured bulk-text path.
      await deliverBulkText(sessId, `<${filePath}`);
    } catch (err) {
      console.error('[Editor] Failed to apply draft:', err);
    }
  }

  if (draftId) {
    try { await window.gamepadCli?.draftDelete(draftId); }
    catch (err) { console.error('[Editor] Failed to delete draft after apply:', err); }
  }

  await refreshChipBar(sessionId || null);
  logEvent(`Draft applied: ${draftId}`);
}

export async function deleteDraft(): Promise<void> {
  const { draftId, sessionId } = draftEditorState;
  hideDraftEditor();

  if (draftId) {
    try { await window.gamepadCli?.draftDelete(draftId); }
    catch (err) { console.error('[Editor] Failed to delete draft:', err); }
  }

  await refreshChipBar(sessionId || null);
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
  closeEditor();
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

/** Save plan/draft data without closing the editor (for auto-save). */
function saveWithoutClose(): void {
  if (draftEditorState.mode === 'plan') {
    saveWithoutClosePlan();
  } else if (draftEditorState.mode === 'draft') {
    void saveWithoutCloseDraft();
  }
}

/** Save plan data without closing the editor (for auto-save). */
function saveWithoutClosePlan(): void {
  const cb = draftEditorState.planCallbacks;
  if (!cb) return;
  if (!hasUnsavedPlanChanges()) return;  // no-op if clean
  updateSaveStatus('saving');
  const title = (document.getElementById('draftLabelInput') as HTMLInputElement | null)?.value ?? '';
  const description = (document.getElementById('draftContentInput') as HTMLTextAreaElement | null)?.value ?? '';
  const stateSelect = document.getElementById('draftPlanStateSelect') as HTMLSelectElement | null;
  const status = stateSelect?.disabled
    ? draftEditorState.planStatus
    : ((stateSelect?.value as PlanStatus | undefined) ?? draftEditorState.planStatus);
  // Only include stateInfo when status requires it (same logic as hasUnsavedPlanChanges)
  const stateInfo = (status === 'blocked' || status === 'question')
    ? ((document.getElementById('draftPlanStateInfo') as HTMLInputElement | null)?.value ?? '')
    : '';
  try {
    cb.onSave({ title, description, status, stateInfo });
    // Update originals so hasUnsavedPlanChanges() returns false
    draftEditorState.planOriginalTitle = title;
    draftEditorState.planOriginalDescription = description;
    draftEditorState.planOriginalStatus = status;
    draftEditorState.planOriginalStateInfo = stateInfo;
    updateSaveStatus('saved');
    setTimeout(() => updateSaveStatus('clean'), 2000);  // fade out after 2s
  } catch {
    updateSaveStatus('unsaved');
  }
}

/** Save draft data without closing the editor (for auto-save). */
async function saveWithoutCloseDraft(): Promise<void> {
  if (!hasUnsavedDraftChanges()) return;
  const label = (document.getElementById('draftLabelInput') as HTMLInputElement | null)?.value.trim() || '';
  const text = (document.getElementById('draftContentInput') as HTMLTextAreaElement | null)?.value || '';
  if (!label) return;  // require label before auto-saving
  updateSaveStatus('saving');
  try {
    const { draftId, sessionId } = draftEditorState;
    if (draftId) {
      await window.gamepadCli.draftUpdate(draftId, { label, text });
    } else {
      const created = await window.gamepadCli.draftCreate(sessionId, label, text);
      draftEditorState.draftId = created.id;  // track for subsequent updates
    }
    draftEditorState.label = label;  // update originals
    draftEditorState.text = text;
    updateSaveStatus('saved');
    void refreshChipBar(sessionId || null);
    setTimeout(() => updateSaveStatus('clean'), 2000);
  } catch (err) {
    console.error('[Editor] Auto-save draft failed:', err);
    updateSaveStatus('unsaved');
  }
}

/** Schedule auto-save 500ms after user stops editing (plan and draft modes). */
function scheduleAutoSave(): void {
  if (draftEditorState.autoSaveTimer) clearTimeout(draftEditorState.autoSaveTimer);
  draftEditorState.autoSaveTimer = setTimeout(() => {
    draftEditorState.autoSaveTimer = null;
    saveWithoutClose();
  }, 500);
}

/** Update the save status indicator span. */
function updateSaveStatus(status: 'clean' | 'unsaved' | 'saving' | 'saved'): void {
  draftEditorState.planSaveStatus = status;
  const el = document.getElementById('planSaveStatus');
  if (!el) return;
  el.className = 'plan-save-status';
  if (status === 'clean') {
    el.classList.add('plan-save-status--hidden');
    el.textContent = '';
    return;
  }
  const labels: Record<string, string> = {
    unsaved: '● Unsaved',
    saving: '◑ Saving…',
    saved: '✓ Saved',
  };
  el.textContent = labels[status] ?? '';
  el.classList.add(`plan-save-status--${status}`);
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
  draftEditorState.planOriginalTitle = '';
  draftEditorState.planOriginalDescription = '';
  draftEditorState.planOriginalStatus = 'pending';
  draftEditorState.planOriginalStateInfo = '';
  draftEditorState.planSaveStatus = 'clean';
  draftEditorState.autoSaveTimer = null;
  draftEditorState.focusIndex = 0;
  hidePlanStateControls();
  updateSaveStatus('clean');  // clear save indicator span
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
  const stateSelect = document.getElementById('draftPlanStateSelect') as HTMLSelectElement | null;
  const stateInfo = document.getElementById('draftPlanStateInfo') as HTMLInputElement | null;
  if (stateSelect) {
    stateSelect.style.display = 'none';
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

async function refreshChipBar(sessionId: string | null): Promise<void> {
  const { useChipBarStore } = await import('../stores/chip-bar.js');
  await useChipBarStore().refresh(sessionId);
}
