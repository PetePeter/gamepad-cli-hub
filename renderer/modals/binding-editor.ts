/**
 * Binding editor modal — edit or create button→action bindings.
 */

import type { SequenceListItem } from '../../src/config/loader.js';
import { escapeHtml } from '../utils.js';

/** Binding editor modal state — co-located with its only consumer. */
export interface BindingEditorState {
  visible: boolean;
  editingBinding: { button: string; cliType: string; binding: any } | null;
  focusIndex: number;
}

export const bindingEditorState: BindingEditorState = {
  visible: false,
  editingBinding: null,
  focusIndex: 0,
};

import { state } from '../state.js';
import { logEvent, getCliDisplayName, toDirection, getSequenceSyntaxHelpText, showFormModal } from '../utils.js';
import { loadSettingsScreen } from '../screens/settings.js';
import { attachModalKeyboard } from './modal-base.js';

// Keyboard shortcut cleanup for the binding editor modal
let cleanupKeyboard: (() => void) | null = null;

// ============================================================================
// Constants
// ============================================================================

const ACTION_TYPES = ['keyboard', 'voice', 'scroll', 'context-menu', 'sequence-list', 'new-draft'] as const;

// ============================================================================
// Open / Close
// ============================================================================

export function openBindingEditor(button: string, cliType: string, binding: any): void {
  bindingEditorState.editingBinding = { button, cliType, binding: { ...binding } };
  bindingEditorState.visible = true;
  bindingEditorState.focusIndex = 0;

  const modal = document.getElementById('bindingEditorModal');
  if (!modal) return;

  const title = document.getElementById('bindingEditorTitle');
  if (title) {
    const context = cliType ? getCliDisplayName(cliType) : cliType;
    title.textContent = `Edit Binding — ${button} (${context})`;
  }

  renderBindingEditorForm();
  modal.classList.add('modal--visible');
  modal.setAttribute('aria-hidden', 'false');
  logEvent(`Editing binding: ${button}`);

  // Attach ESC/Enter keyboard shortcuts
  cleanupKeyboard?.();
  cleanupKeyboard = attachModalKeyboard({
    onAccept: () => saveBinding(),
    onCancel: () => { closeBindingEditor(); logEvent('Binding edit cancelled'); },
  });
}

export function closeBindingEditor(): void {
  bindingEditorState.visible = false;
  bindingEditorState.editingBinding = null;

  cleanupKeyboard?.();
  cleanupKeyboard = null;

  const modal = document.getElementById('bindingEditorModal');
  if (modal) {
    modal.classList.remove('modal--visible');
    modal.setAttribute('aria-hidden', 'true');
  }
}

// ============================================================================
// Render
// ============================================================================

function renderBindingEditorForm(): void {
  const form = document.getElementById('bindingEditorForm');
  if (!form || !bindingEditorState.editingBinding) return;

  const { button, binding } = bindingEditorState.editingBinding;
  form.innerHTML = '';

  // Button name (read-only)
  form.appendChild(createEditorField('Button', `
    <input type="text" value="${button}" disabled />
  `, true));

  // Action type dropdown
  const actionOptions = ACTION_TYPES.map(t =>
    `<option value="${t}" ${t === binding.action ? 'selected' : ''}>${t}</option>`
  ).join('');
  form.appendChild(createEditorField('Action Type', `
    <select id="bindingEditorAction">${actionOptions}</select>
  `));

  // Dynamic params based on action type
  renderActionParams(form, binding);

  // Wire action type change to re-render params
  const actionSelect = document.getElementById('bindingEditorAction') as HTMLSelectElement;
  actionSelect?.addEventListener('change', () => {
    if (!bindingEditorState.editingBinding) return;
    const newAction = actionSelect.value;
    bindingEditorState.editingBinding.binding = buildDefaultBinding(newAction);
    renderBindingEditorForm();
  });

  focusBindingEditorField();
}

function renderActionParams(form: HTMLElement, binding: any): void {
  switch (binding.action) {
    case 'keyboard': {
      const savedSequence: string = binding.sequence || '';

      const seqField = document.createElement('div');
      seqField.className = 'binding-editor-field';
      const seqLabel = document.createElement('label');
      seqLabel.textContent = 'Sequence';
      seqField.appendChild(seqLabel);

      const textarea = document.createElement('textarea');
      textarea.id = 'bindingEditorSequence';
      textarea.rows = 5;
      textarea.className = 'sequence-textarea focusable';
      textarea.placeholder = 'Type text, use {Ctrl+S} for combos, newlines = Enter';
      textarea.value = savedSequence;
      seqField.appendChild(textarea);

      const helpToggle = document.createElement('button');
      helpToggle.type = 'button';
      helpToggle.className = 'sequence-help-toggle focusable';
      helpToggle.textContent = '? Syntax Help';
      helpToggle.tabIndex = 0;
      seqField.appendChild(helpToggle);

      const helpPanel = document.createElement('div');
      helpPanel.className = 'sequence-help';
      helpPanel.textContent = getSequenceSyntaxHelpText();
      seqField.appendChild(helpPanel);

      helpToggle.addEventListener('click', () => {
        helpPanel.classList.toggle('sequence-help--visible');
      });

      form.appendChild(seqField);
      break;
    }
    case 'voice': {
      // Key input (e.g. "F1" or "Ctrl+Alt")
      form.appendChild(createEditorField('Key', `
        <input type="text" id="bindingEditorVoiceKey" value="${binding.key || ''}" placeholder="e.g. F1, Space, Ctrl+Alt" />
      `));

      // Mode toggle (tap/hold)
      const modeOptions = ['tap', 'hold'].map(m =>
        `<option value="${m}" ${m === (binding.mode || 'tap') ? 'selected' : ''}>${m}</option>`
      ).join('');
      form.appendChild(createEditorField('Mode', `
        <select id="bindingEditorVoiceMode">${modeOptions}</select>
      `));
      break;
    }
    case 'scroll': {
      const scrollDirOptions = ['up', 'down'].map(d =>
        `<option value="${d}" ${d === (binding.direction || 'down') ? 'selected' : ''}>${d}</option>`
      ).join('');
      form.appendChild(createEditorField('Direction', `
        <select id="bindingEditorScrollDirection">${scrollDirOptions}</select>
      `));
      form.appendChild(createEditorField('Lines', `
        <input type="number" id="bindingEditorScrollLines" value="${binding.lines ?? 5}" min="1" max="100" />
      `));
      break;
    }
    case 'sequence-list': {
      renderSequenceListParams(form, binding);
      break;
    }
  }
}

function renderSequenceListParams(form: HTMLElement, binding: any): void {
  const hasGroup = !!binding.sequenceGroup;
  const cliType = bindingEditorState.editingBinding?.cliType || '';

  const container = document.createElement('div');
  container.className = 'binding-editor-field';
  container.id = 'sequenceListContainer';

  // Source toggle: Sequence Group vs Inline Items
  const toggleField = document.createElement('div');
  toggleField.className = 'binding-editor-field';
  const toggleLabel = document.createElement('label');
  toggleLabel.textContent = 'Source';
  toggleField.appendChild(toggleLabel);

  const toggleRow = document.createElement('div');
  toggleRow.style.display = 'flex';
  toggleRow.style.gap = '12px';

  const groupRadio = document.createElement('input');
  groupRadio.type = 'radio';
  groupRadio.name = 'seqListSource';
  groupRadio.id = 'seqSourceGroup';
  groupRadio.value = 'group';
  groupRadio.checked = hasGroup;

  const groupLabel = document.createElement('label');
  groupLabel.htmlFor = 'seqSourceGroup';
  groupLabel.textContent = ' Sequence Group';
  groupLabel.style.cursor = 'pointer';

  const inlineRadio = document.createElement('input');
  inlineRadio.type = 'radio';
  inlineRadio.name = 'seqListSource';
  inlineRadio.id = 'seqSourceInline';
  inlineRadio.value = 'inline';
  inlineRadio.checked = !hasGroup;

  const inlineLabel = document.createElement('label');
  inlineLabel.htmlFor = 'seqSourceInline';
  inlineLabel.textContent = ' Inline Items';
  inlineLabel.style.cursor = 'pointer';

  toggleRow.appendChild(groupRadio);
  toggleRow.appendChild(groupLabel);
  toggleRow.appendChild(inlineRadio);
  toggleRow.appendChild(inlineLabel);
  toggleField.appendChild(toggleRow);
  form.appendChild(toggleField);

  // Group mode: dropdown of available groups
  const groupContainer = document.createElement('div');
  groupContainer.id = 'seqGroupContainer';

  const groupSelectLabel = document.createElement('label');
  groupSelectLabel.textContent = 'Group';
  groupContainer.appendChild(groupSelectLabel);

  const groupSelect = document.createElement('select');
  groupSelect.id = 'seqGroupSelect';
  groupSelect.className = 'focusable';

  // Populate from cache
  const sequences = state.cliSequencesCache[cliType] || {};
  const groupIds = Object.keys(sequences);
  if (groupIds.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '(no groups configured)';
    groupSelect.appendChild(opt);
  } else {
    groupIds.forEach(gid => {
      const opt = document.createElement('option');
      opt.value = gid;
      opt.textContent = `${gid} (${sequences[gid].length} items)`;
      opt.selected = gid === binding.sequenceGroup;
      groupSelect.appendChild(opt);
    });
  }
  groupContainer.appendChild(groupSelect);
  groupContainer.className = 'binding-editor-field';

  // Inline mode: existing items CRUD
  const inlineContainer = document.createElement('div');
  inlineContainer.id = 'seqInlineContainer';
  inlineContainer.className = 'binding-editor-field';

  renderInlineSequenceItems(inlineContainer, binding);

  container.appendChild(groupContainer);
  container.appendChild(inlineContainer);
  form.appendChild(container);

  // Toggle visibility
  function updateVisibility(): void {
    const isGroup = groupRadio.checked;
    groupContainer.style.display = isGroup ? '' : 'none';
    inlineContainer.style.display = isGroup ? 'none' : '';
  }
  updateVisibility();

  groupRadio.addEventListener('change', updateVisibility);
  inlineRadio.addEventListener('change', updateVisibility);
}

function renderInlineSequenceItems(container: HTMLElement, binding: any): void {
  const items: SequenceListItem[] = binding.items || [];

  const label = document.createElement('label');
  label.textContent = `Inline Items (${items.length})`;
  container.appendChild(label);

  const list = document.createElement('div');
  list.className = 'sequence-list-items';
  list.id = 'sequenceListItems';

  items.forEach((item, index) => {
    list.appendChild(createSequenceListItemRow(item, index));
  });

  container.appendChild(list);

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn btn--secondary sequence-list-add focusable';
  addBtn.textContent = '+ Add Item';
  addBtn.addEventListener('click', async () => {
    const result = await showFormModal('Add Sequence Item', [
      { key: 'label', label: 'Label', placeholder: 'e.g. Clear screen' },
      { key: 'sequence', label: 'Sequence', type: 'textarea', placeholder: '/clear{Enter}' },
    ]);
    if (result) {
      if (!bindingEditorState.editingBinding) return;
      const currentItems = bindingEditorState.editingBinding.binding.items || [];
      currentItems.push({ label: result.label, sequence: result.sequence });
      bindingEditorState.editingBinding.binding.items = currentItems;
      renderBindingEditorForm();
    }
  });
  container.appendChild(addBtn);
}

function createSequenceListItemRow(item: SequenceListItem, index: number): HTMLElement {
  const row = document.createElement('div');
  row.className = 'sequence-list-row';
  row.dataset.index = String(index);

  const info = document.createElement('div');
  info.className = 'sequence-list-row__info';
  info.innerHTML = `<strong>${escapeHtml(item.label)}</strong><span class="sequence-list-row__preview">${escapeHtml(item.sequence)}</span>`;

  const actions = document.createElement('div');
  actions.className = 'sequence-list-row__actions';

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'btn btn--small focusable';
  editBtn.textContent = '✏';
  editBtn.title = 'Edit';
  editBtn.addEventListener('click', async () => {
    const result = await showFormModal('Edit Sequence Item', [
      { key: 'label', label: 'Label', defaultValue: item.label },
      { key: 'sequence', label: 'Sequence', type: 'textarea', defaultValue: item.sequence },
    ]);
    if (result && bindingEditorState.editingBinding) {
      const items = bindingEditorState.editingBinding.binding.items || [];
      if (items[index]) {
        items[index] = { label: result.label, sequence: result.sequence };
        renderBindingEditorForm();
      }
    }
  });

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'btn btn--small btn--danger focusable';
  removeBtn.textContent = '✕';
  removeBtn.title = 'Remove';
  removeBtn.addEventListener('click', () => {
    if (!bindingEditorState.editingBinding) return;
    const items = bindingEditorState.editingBinding.binding.items || [];
    items.splice(index, 1);
    bindingEditorState.editingBinding.binding.items = items;
    renderBindingEditorForm();
  });

  actions.appendChild(editBtn);
  actions.appendChild(removeBtn);
  row.appendChild(info);
  row.appendChild(actions);
  return row;
}

function collectSequenceListFromForm(): any {
  if (!bindingEditorState.editingBinding) return null;
  const groupRadio = document.getElementById('seqSourceGroup') as HTMLInputElement;
  if (groupRadio?.checked) {
    const groupSelect = document.getElementById('seqGroupSelect') as HTMLSelectElement;
    const groupId = groupSelect?.value;
    if (groupId) return { action: 'sequence-list', sequenceGroup: groupId };
  }
  const items = bindingEditorState.editingBinding.binding.items || [];
  return { action: 'sequence-list', items: [...items] };
}

function createEditorField(label: string, inputHtml: string, readonly = false): HTMLElement {
  const field = document.createElement('div');
  field.className = `binding-editor-field${readonly ? ' binding-editor-field--readonly' : ''}`;
  field.innerHTML = `<label>${label}</label>${inputHtml}`;
  return field;
}

function buildDefaultBinding(action: string): any {
  switch (action) {
    case 'keyboard':
      return { action: 'keyboard', sequence: '' };
    case 'voice':
      return { action: 'voice', key: '', mode: 'tap' };
    case 'scroll':
      return { action: 'scroll', direction: 'down' };
    case 'sequence-list':
      return { action: 'sequence-list', items: [] };
    default:
      return { action };
  }
}

// ============================================================================
// Collect & Save
// ============================================================================

function collectBindingFromForm(): any | null {
  if (!bindingEditorState.editingBinding) return null;

  const actionSelect = document.getElementById('bindingEditorAction') as HTMLSelectElement;
  if (!actionSelect) return null;

  const action = actionSelect.value;

  switch (action) {
    case 'keyboard': {
      const sequenceTextarea = document.getElementById('bindingEditorSequence') as HTMLTextAreaElement;
      return { action: 'keyboard', sequence: sequenceTextarea?.value || '' };
    }
    case 'voice': {
      const keyInput = document.getElementById('bindingEditorVoiceKey') as HTMLInputElement;
      const modeSelect = document.getElementById('bindingEditorVoiceMode') as HTMLSelectElement;
      return {
        action: 'voice',
        key: keyInput?.value?.trim() || '',
        mode: (modeSelect?.value as 'tap' | 'hold') || 'tap',
      };
    }
    case 'scroll': {
      const scrollDirSelect = document.getElementById('bindingEditorScrollDirection') as HTMLSelectElement;
      const scrollLinesInput = document.getElementById('bindingEditorScrollLines') as HTMLInputElement;
      const lines = parseInt(scrollLinesInput?.value || '5', 10);
      return { action: 'scroll', direction: scrollDirSelect?.value || 'down', lines: isNaN(lines) ? 5 : lines };
    }
    case 'sequence-list': {
      return collectSequenceListFromForm();
    }
    default:
      return { action };
  }
}

export async function saveBinding(): Promise<void> {
  if (!bindingEditorState.editingBinding || !window.gamepadCli) return;

  const binding = collectBindingFromForm();
  if (!binding) {
    logEvent('Save failed: could not read form');
    return;
  }

  const { button, cliType } = bindingEditorState.editingBinding;

  try {
    const result = await window.gamepadCli.configSetBinding(button, cliType, binding);
    if (result.success) {
      logEvent(`Saved binding: ${button} → ${binding.action}`);

      // Update local cache so dispatch uses new bindings immediately
      if (cliType) {
        if (!state.cliBindingsCache[cliType]) {
          state.cliBindingsCache[cliType] = {};
        }
        state.cliBindingsCache[cliType][button] = binding;
      }

      closeBindingEditor();
      loadSettingsScreen();
    } else {
      logEvent(`Save failed: ${result.error || 'unknown error'}`);
    }
  } catch (error) {
    console.error('Failed to save binding:', error);
    logEvent(`Save error: ${error}`);
  }
}

// ============================================================================
// Gamepad Navigation
// ============================================================================

function getBindingEditorFocusables(): HTMLElement[] {
  const form = document.getElementById('bindingEditorForm');
  if (!form) return [];
  return Array.from(form.querySelectorAll<HTMLElement>(
    'select:not([disabled]), input:not([disabled]), textarea:not([disabled]), button.focusable'
  ));
}

function focusBindingEditorField(): void {
  const fields = getBindingEditorFocusables();
  if (fields.length === 0) return;
  if (bindingEditorState.focusIndex >= fields.length) {
    bindingEditorState.focusIndex = fields.length - 1;
  }
  fields[bindingEditorState.focusIndex]?.focus();
}

export function handleBindingEditorButton(button: string): void {
  const dir = toDirection(button);
  if (dir === 'up') {
    const fields = getBindingEditorFocusables();
    bindingEditorState.focusIndex = Math.max(0, bindingEditorState.focusIndex - 1);
    if (fields[bindingEditorState.focusIndex]) {
      fields[bindingEditorState.focusIndex].focus();
    }
    return;
  }
  if (dir === 'down') {
    const fields = getBindingEditorFocusables();
    bindingEditorState.focusIndex = Math.min(fields.length - 1, bindingEditorState.focusIndex + 1);
    if (fields[bindingEditorState.focusIndex]) {
      fields[bindingEditorState.focusIndex].focus();
    }
    return;
  }
  switch (button) {
    case 'A':
      saveBinding();
      break;
    case 'B':
      closeBindingEditor();
      logEvent('Binding edit cancelled');
      break;
  }
}
