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
import { logEvent, getCliDisplayName, toDirection } from '../utils.js';
import { loadSettingsScreen } from '../screens/settings.js';

// ============================================================================
// Constants
// ============================================================================

const ACTION_TYPES = ['keyboard', 'session-switch', 'spawn', 'list-sessions', 'close-session', 'profile-switch', 'hub-focus'] as const;

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
}

export function closeBindingEditor(): void {
  bindingEditorState.visible = false;
  bindingEditorState.editingBinding = null;

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
      const allKeys = Array.isArray(binding.keys) ? [...binding.keys] : [];
      const modifiers = ['Ctrl', 'Alt', 'Shift'];
      const activeModifiers = allKeys.filter(k => modifiers.includes(k));
      const nonModifierKeys = allKeys.filter(k => !modifiers.includes(k));
      const keysValue = nonModifierKeys.join(',');

      // Modifier toggles
      const modField = document.createElement('div');
      modField.className = 'binding-editor-field';
      const modLabel = document.createElement('label');
      modLabel.textContent = 'Modifiers';
      modField.appendChild(modLabel);

      const modRow = document.createElement('div');
      modRow.className = 'modifier-toggles';

      modifiers.forEach(mod => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn--sm modifier-toggle focusable';
        if (activeModifiers.includes(mod)) btn.classList.add('modifier-toggle--active');
        btn.textContent = mod;
        btn.tabIndex = 0;
        btn.dataset.modifier = mod;
        btn.addEventListener('click', () => {
          btn.classList.toggle('modifier-toggle--active');
        });
        modRow.appendChild(btn);
      });

      modField.appendChild(modRow);
      form.appendChild(modField);

      // Keys input (non-modifier keys only)
      form.appendChild(createEditorField('Keys (comma-separated)', `
        <input type="text" id="bindingEditorKeys" value="${keysValue}" placeholder="e.g. c, w, F4, Clear" />
      `));

      // Hold checkbox
      const holdChecked = binding.hold === true;
      const holdField = document.createElement('div');
      holdField.className = 'binding-editor-field';
      const holdLabel = document.createElement('label');
      holdLabel.textContent = 'Hold while pressed';
      holdField.appendChild(holdLabel);

      const holdCheckbox = document.createElement('input');
      holdCheckbox.type = 'checkbox';
      holdCheckbox.id = 'bindingEditorHold';
      holdCheckbox.checked = holdChecked;
      holdCheckbox.className = 'focusable';
      holdField.appendChild(holdCheckbox);
      form.appendChild(holdField);
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
      return { action: 'keyboard', keys: [] };
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
      const keysInput = document.getElementById('bindingEditorKeys') as HTMLInputElement;
      const keysStr = keysInput?.value?.trim() || '';
      const baseKeys = keysStr ? keysStr.split(',').map(k => k.trim()).filter(Boolean) : [];

      // Collect active modifiers
      const activeModBtns = document.querySelectorAll('.modifier-toggle--active');
      const mods: string[] = [];
      activeModBtns.forEach(btn => {
        const mod = (btn as HTMLElement).dataset.modifier;
        if (mod) mods.push(mod);
      });

      const keys = [...mods, ...baseKeys];
      const holdCheckbox = document.getElementById('bindingEditorHold') as HTMLInputElement;
      const hold = holdCheckbox?.checked === true;

      const result: any = { action: 'keyboard', keys };
      if (hold) result.hold = true;
      return result;
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
  return Array.from(form.querySelectorAll<HTMLElement>('select:not([disabled]), input:not([disabled])'));
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
