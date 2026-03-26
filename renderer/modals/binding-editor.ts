/**
 * Binding editor modal — edit or create button→action bindings.
 */

/** Binding editor modal state — co-located with its only consumer. */
export interface BindingEditorState {
  visible: boolean;
  editingBinding: { button: string; cliType: string | null; binding: any } | null;
  focusIndex: number;
}

export const bindingEditorState: BindingEditorState = {
  visible: false,
  editingBinding: null,
  focusIndex: 0,
};

import { state } from '../state.js';
import { logEvent, getCliDisplayName, toDirection, getSequenceSyntaxHelpText } from '../utils.js';
import { loadSettingsScreen } from '../screens/settings.js';
import { attachModalKeyboard } from './modal-base.js';

// Keyboard shortcut cleanup for the binding editor modal
let cleanupKeyboard: (() => void) | null = null;

// ============================================================================
// Constants
// ============================================================================

const ACTION_TYPES = ['keyboard', 'voice', 'scroll', 'session-switch', 'spawn', 'list-sessions', 'close-session', 'profile-switch', 'hub-focus'] as const;

// ============================================================================
// Open / Close
// ============================================================================

export function openBindingEditor(button: string, cliType: string | null, binding: any): void {
  bindingEditorState.editingBinding = { button, cliType, binding: { ...binding } };
  bindingEditorState.visible = true;
  bindingEditorState.focusIndex = 0;

  const modal = document.getElementById('bindingEditorModal');
  if (!modal) return;

  const title = document.getElementById('bindingEditorTitle');
  if (title) {
    const context = cliType ? getCliDisplayName(cliType) : 'Global';
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
    case 'session-switch': {
      const dirOptions = ['previous', 'next'].map(d =>
        `<option value="${d}" ${d === binding.direction ? 'selected' : ''}>${d}</option>`
      ).join('');
      form.appendChild(createEditorField('Direction', `
        <select id="bindingEditorDirection">${dirOptions}</select>
      `));
      break;
    }
    case 'spawn': {
      const spawnOptions = state.cliTypes.map(ct =>
        `<option value="${ct}" ${ct === binding.cliType ? 'selected' : ''}>${getCliDisplayName(ct)} (${ct})</option>`
      ).join('');
      form.appendChild(createEditorField('CLI Type', `
        <select id="bindingEditorCliType">${spawnOptions}</select>
      `));
      break;
    }
    case 'list-sessions':
      form.appendChild(createEditorField('Parameters', `
        <input type="text" value="No additional parameters" disabled />
      `, true));
      break;
    case 'hub-focus':
      form.appendChild(createEditorField('Parameters', `
        <input type="text" value="No additional parameters" disabled />
      `, true));
      break;
    case 'close-session':
      form.appendChild(createEditorField('Parameters', `
        <input type="text" value="No additional parameters" disabled />
      `, true));
      break;
    case 'profile-switch': {
      const profDirOptions = ['previous', 'next'].map(d =>
        `<option value="${d}" ${d === binding.direction ? 'selected' : ''}>${d}</option>`
      ).join('');
      form.appendChild(createEditorField('Direction', `
        <select id="bindingEditorDirection">${profDirOptions}</select>
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
  }
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
    case 'session-switch':
      return { action: 'session-switch', direction: 'next' };
    case 'spawn':
      return { action: 'spawn', cliType: state.cliTypes[0] || 'generic-terminal' };
    case 'list-sessions':
      return { action: 'list-sessions' };
    case 'hub-focus':
      return { action: 'hub-focus' };
    case 'close-session':
      return { action: 'close-session' };
    case 'profile-switch':
      return { action: 'profile-switch', direction: 'next' };
    case 'scroll':
      return { action: 'scroll', direction: 'down' };
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
    case 'session-switch': {
      const dirSelect = document.getElementById('bindingEditorDirection') as HTMLSelectElement;
      return { action: 'session-switch', direction: dirSelect?.value || 'next' };
    }
    case 'spawn': {
      const typeSelect = document.getElementById('bindingEditorCliType') as HTMLSelectElement;
      return { action: 'spawn', cliType: typeSelect?.value || 'generic-terminal' };
    }
    case 'list-sessions':
      return { action: 'list-sessions' };
    case 'hub-focus':
      return { action: 'hub-focus' };
    case 'close-session':
      return { action: 'close-session' };
    case 'profile-switch': {
      const profDirSelect = document.getElementById('bindingEditorDirection') as HTMLSelectElement;
      return { action: 'profile-switch', direction: profDirSelect?.value || 'next' };
    }
    case 'scroll': {
      const scrollDirSelect = document.getElementById('bindingEditorScrollDirection') as HTMLSelectElement;
      const scrollLinesInput = document.getElementById('bindingEditorScrollLines') as HTMLInputElement;
      const lines = parseInt(scrollLinesInput?.value || '5', 10);
      return { action: 'scroll', direction: scrollDirSelect?.value || 'down', lines: isNaN(lines) ? 5 : lines };
    }
    default:
      return null;
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

      // Update local caches so dispatch uses new bindings immediately
      if (cliType === null) {
        if (state.globalBindings) {
          state.globalBindings[button] = binding;
        }
      } else {
        if (state.cliBindingsCache[cliType]) {
          state.cliBindingsCache[cliType][button] = binding;
        }
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
