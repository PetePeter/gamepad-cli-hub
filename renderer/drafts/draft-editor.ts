/**
 * Draft Editor — slide-down panel for composing/editing drafts.
 * Appears between the tab bar/draft strip and the terminal.
 * When open, keyboard input routes here instead of the terminal.
 * Gamepad D-pad navigates between fields; A activates; B cancels.
 */

import { refreshDraftStrip } from './draft-strip.js';
import { toDirection } from '../utils.js';

export interface DraftEditorState {
  visible: boolean;
  sessionId: string;
  draftId: string | null;  // null = creating new draft
  label: string;
  text: string;
  focusIndex: number;      // 0=title, 1=content, 2=save, 3=cancel
}

const FOCUS_ELEMENTS = ['draftLabelInput', 'draftContentInput', 'draftSaveBtn', 'draftCancelBtn'] as const;

export const draftEditorState: DraftEditorState = {
  visible: false,
  sessionId: '',
  draftId: null,
  label: '',
  text: '',
  focusIndex: 0,
};

/** Create the draft editor DOM container once. Called at app startup. */
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
        <button class="btn btn--secondary btn--sm" id="draftCancelBtn">Cancel</button>
      </div>
    </div>
    <input type="text" class="draft-editor-label" id="draftLabelInput" placeholder="Draft title..." maxlength="100" />
    <textarea class="draft-editor-content" id="draftContentInput" placeholder="Enter your prompt..." rows="4"></textarea>
  `;

  const terminalArea = document.getElementById('terminalArea');
  const terminalContainer = terminalArea?.querySelector('.terminal-container');
  const draftStrip = document.getElementById('draftStrip');

  if (terminalArea && terminalContainer) {
    // Insert after the draft strip (if it exists), before the terminal container
    if (draftStrip && draftStrip.nextSibling) {
      terminalArea.insertBefore(editor, draftStrip.nextSibling);
    } else {
      terminalArea.insertBefore(editor, terminalContainer);
    }
  } else if (terminalArea) {
    terminalArea.appendChild(editor);
  }

  // Wire button event handlers
  const saveBtn = document.getElementById('draftSaveBtn');
  const cancelBtn = document.getElementById('draftCancelBtn');
  const labelInput = document.getElementById('draftLabelInput') as HTMLInputElement | null;

  saveBtn?.addEventListener('click', () => { saveDraft(); });
  cancelBtn?.addEventListener('click', () => { hideDraftEditor(); });

  // Enter in label → move focus to content; Escape → hide
  labelInput?.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const contentInput = document.getElementById('draftContentInput') as HTMLTextAreaElement | null;
      contentInput?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      hideDraftEditor();
    }
  });

  // Escape in content → hide
  const contentInput = document.getElementById('draftContentInput') as HTMLTextAreaElement | null;
  contentInput?.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      hideDraftEditor();
    }
  });
}

/** Show the draft editor for creating a new draft or editing an existing one. */
export function showDraftEditor(sessionId: string, existingDraft?: { id: string; label: string; text: string }): void {
  const editor = document.getElementById('draftEditor');
  if (!editor) return;

  draftEditorState.sessionId = sessionId;
  draftEditorState.visible = true;
  draftEditorState.focusIndex = 0;

  const titleEl = editor.querySelector('.draft-editor-title');
  const labelInput = document.getElementById('draftLabelInput') as HTMLInputElement | null;
  const contentInput = document.getElementById('draftContentInput') as HTMLTextAreaElement | null;

  if (existingDraft) {
    draftEditorState.draftId = existingDraft.id;
    draftEditorState.label = existingDraft.label;
    draftEditorState.text = existingDraft.text;
    if (titleEl) titleEl.textContent = '📝 Edit Draft';
    if (labelInput) labelInput.value = existingDraft.label;
    if (contentInput) contentInput.value = existingDraft.text;
  } else {
    draftEditorState.draftId = null;
    draftEditorState.label = '';
    draftEditorState.text = '';
    if (titleEl) titleEl.textContent = '📝 New Draft';
    if (labelInput) labelInput.value = '';
    if (contentInput) contentInput.value = '';
  }

  editor.style.display = 'flex';
  applyEditorFocus();
}

/** Hide the draft editor without saving. */
export function hideDraftEditor(): void {
  const editor = document.getElementById('draftEditor');
  if (editor) editor.style.display = 'none';

  draftEditorState.visible = false;
  draftEditorState.draftId = null;
  draftEditorState.label = '';
  draftEditorState.text = '';
  draftEditorState.focusIndex = 0;
}

/** Check if the draft editor is currently visible */
export function isDraftEditorVisible(): boolean {
  return draftEditorState.visible;
}

/** Focus the element at the current focusIndex and update button highlights. */
function applyEditorFocus(): void {
  const id = FOCUS_ELEMENTS[draftEditorState.focusIndex];
  const el = document.getElementById(id);
  el?.focus();

  // Highlight Save/Cancel buttons when focused via gamepad
  for (const btnId of ['draftSaveBtn', 'draftCancelBtn']) {
    document.getElementById(btnId)?.classList.remove('btn--focused');
  }
  if (id === 'draftSaveBtn' || id === 'draftCancelBtn') {
    el?.classList.add('btn--focused');
  }
}

/** Handle gamepad button presses while the draft editor is visible. */
export function handleDraftEditorButton(button: string): void {
  const dir = toDirection(button);

  if (dir === 'down') {
    draftEditorState.focusIndex = (draftEditorState.focusIndex + 1) % FOCUS_ELEMENTS.length;
    applyEditorFocus();
    return;
  }
  if (dir === 'up') {
    draftEditorState.focusIndex = (draftEditorState.focusIndex - 1 + FOCUS_ELEMENTS.length) % FOCUS_ELEMENTS.length;
    applyEditorFocus();
    return;
  }

  switch (button) {
    case 'A': {
      const focused = FOCUS_ELEMENTS[draftEditorState.focusIndex];
      if (focused === 'draftSaveBtn') saveDraft();
      else if (focused === 'draftCancelBtn') hideDraftEditor();
      break;
    }
    case 'B':
      hideDraftEditor();
      break;
  }
}

/** Save the current draft (create or update). Returns the saved draft. */
export async function saveDraft(): Promise<void> {
  const labelInput = document.getElementById('draftLabelInput') as HTMLInputElement | null;
  const contentInput = document.getElementById('draftContentInput') as HTMLTextAreaElement | null;

  const label = labelInput?.value.trim() || '';
  const text = contentInput?.value || '';

  if (!label) return; // require at least a label

  const sessionId = draftEditorState.sessionId;
  const draftId = draftEditorState.draftId;

  try {
    if (draftId) {
      // Update existing draft
      await window.gamepadCli.draftUpdate(draftId, { label, text });
    } else {
      // Create new draft
      await window.gamepadCli.draftCreate(sessionId, label, text);
    }
  } catch (err) {
    console.error('[DraftEditor] Failed to save draft:', err);
  }

  hideDraftEditor();
  await refreshDraftStrip(sessionId || null);
}
