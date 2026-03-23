/**
 * Binding editor modal — edit or create button→action bindings.
 */

import { state } from '../state.js';
import { logEvent, getCliDisplayName } from '../utils.js';
import { loadSettingsScreen } from '../screens/settings.js';

// ============================================================================
// Constants
// ============================================================================

const ACTION_TYPES = ['keyboard', 'voice', 'session-switch', 'spawn', 'list-sessions', 'close-session', 'profile-switch', 'hub-focus'] as const;

// ============================================================================
// Open / Close
// ============================================================================

export function openBindingEditor(button: string, cliType: string | null, binding: any): void {
  state.editingBinding = { button, cliType, binding: { ...binding } };
  state.bindingEditorVisible = true;
  state.bindingEditorFocusIndex = 0;

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
  state.bindingEditorVisible = false;
  state.editingBinding = null;

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
  if (!form || !state.editingBinding) return;

  const { button, binding } = state.editingBinding;
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
    if (!state.editingBinding) return;
    const newAction = actionSelect.value;
    state.editingBinding.binding = buildDefaultBinding(newAction);
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
      break;
    }
    case 'voice': {
      const holdDuration = binding.holdDuration || 3000;
      const key = binding.key || 'space';
      form.appendChild(createEditorField('Key to Hold', `
        <input type="text" id="bindingEditorVoiceKey" value="${key}" placeholder="e.g. space, f5" />
      `));
      form.appendChild(createEditorField('Hold Duration (ms)', `
        <input type="number" id="bindingEditorHoldDuration" value="${holdDuration}" min="100" step="100" />
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
    case 'voice':
      return { action: 'voice', key: 'space', holdDuration: 3000 };
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
  if (!state.editingBinding) return null;

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
      return { action: 'keyboard', keys };
    }
    case 'voice': {
      const keyInput = document.getElementById('bindingEditorVoiceKey') as HTMLInputElement;
      const durationInput = document.getElementById('bindingEditorHoldDuration') as HTMLInputElement;
      const key = keyInput?.value?.trim() || 'space';
      const holdDuration = parseInt(durationInput?.value || '3000', 10);
      return { action: 'voice', key, holdDuration };
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
  if (!state.editingBinding || !window.gamepadCli) return;

  const binding = collectBindingFromForm();
  if (!binding) {
    logEvent('Save failed: could not read form');
    return;
  }

  const { button, cliType } = state.editingBinding;

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
  if (state.bindingEditorFocusIndex >= fields.length) {
    state.bindingEditorFocusIndex = fields.length - 1;
  }
  fields[state.bindingEditorFocusIndex]?.focus();
}

export function handleBindingEditorButton(button: string): void {
  switch (button) {
    case 'Up': {
      const fields = getBindingEditorFocusables();
      state.bindingEditorFocusIndex = Math.max(0, state.bindingEditorFocusIndex - 1);
      if (fields[state.bindingEditorFocusIndex]) {
        fields[state.bindingEditorFocusIndex].focus();
      }
      break;
    }
    case 'Down': {
      const fields = getBindingEditorFocusables();
      state.bindingEditorFocusIndex = Math.min(fields.length - 1, state.bindingEditorFocusIndex + 1);
      if (fields[state.bindingEditorFocusIndex]) {
        fields[state.bindingEditorFocusIndex].focus();
      }
      break;
    }
    case 'A':
      saveBinding();
      break;
    case 'B':
      closeBindingEditor();
      logEvent('Binding edit cancelled');
      break;
  }
}
