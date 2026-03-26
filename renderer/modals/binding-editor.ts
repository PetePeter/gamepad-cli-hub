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
      const allKeys = Array.isArray(binding.keys) ? [...binding.keys] : [];
      const modifiers = ['Ctrl', 'Alt', 'Shift'];

      // Preserved state across mode toggles
      let savedModifiers = allKeys.filter(k => modifiers.includes(k));
      let savedKeysValue = allKeys.filter(k => !modifiers.includes(k)).join(',');
      let savedHold = binding.hold === true;
      let savedTarget = binding.target || (savedHold ? 'os' : 'terminal');
      let savedSequence: string = binding.sequence || '';

      const initialMode = savedSequence.trim() ? 'sequence' : 'keys';

      // Mode toggle buttons
      const modeField = document.createElement('div');
      modeField.className = 'binding-editor-field';
      const modeLabel = document.createElement('label');
      modeLabel.textContent = 'Input Mode';
      modeField.appendChild(modeLabel);

      const modeToggles = document.createElement('div');
      modeToggles.className = 'mode-toggles';

      const keysToggle = document.createElement('button');
      keysToggle.type = 'button';
      keysToggle.className = `btn btn--sm mode-toggle focusable${initialMode === 'keys' ? ' mode-toggle--active' : ''}`;
      keysToggle.dataset.mode = 'keys';
      keysToggle.textContent = 'Keys';
      keysToggle.tabIndex = 0;

      const seqToggle = document.createElement('button');
      seqToggle.type = 'button';
      seqToggle.className = `btn btn--sm mode-toggle focusable${initialMode === 'sequence' ? ' mode-toggle--active' : ''}`;
      seqToggle.dataset.mode = 'sequence';
      seqToggle.textContent = 'Sequence';
      seqToggle.tabIndex = 0;

      modeToggles.appendChild(keysToggle);
      modeToggles.appendChild(seqToggle);
      modeField.appendChild(modeToggles);
      form.appendChild(modeField);

      // Container for mode-specific content
      const modeContent = document.createElement('div');
      modeContent.id = 'bindingEditorModeContent';
      form.appendChild(modeContent);

      const saveCurrentKeysState = () => {
        const ki = document.getElementById('bindingEditorKeys') as HTMLInputElement;
        if (ki) savedKeysValue = ki.value;
        savedModifiers = [];
        modeContent.querySelectorAll('.modifier-toggle--active').forEach(btn => {
          const mod = (btn as HTMLElement).dataset.modifier;
          if (mod) savedModifiers.push(mod);
        });
        const hc = document.getElementById('bindingEditorHold') as HTMLInputElement;
        if (hc) savedHold = hc.checked;
        const tc = document.getElementById('bindingEditorTarget') as HTMLInputElement;
        if (tc) savedTarget = tc.checked ? 'os' : 'terminal';
      };

      const saveCurrentSequenceState = () => {
        const st = document.getElementById('bindingEditorSequence') as HTMLTextAreaElement;
        if (st) savedSequence = st.value;
      };

      const renderKeysMode = () => {
        modeContent.innerHTML = '';

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
          if (savedModifiers.includes(mod)) btn.classList.add('modifier-toggle--active');
          btn.textContent = mod;
          btn.tabIndex = 0;
          btn.dataset.modifier = mod;
          btn.addEventListener('click', () => {
            btn.classList.toggle('modifier-toggle--active');
          });
          modRow.appendChild(btn);
        });

        modField.appendChild(modRow);
        modeContent.appendChild(modField);

        // Keys input (non-modifier keys only)
        modeContent.appendChild(createEditorField('Keys (comma-separated)', `
          <input type="text" id="bindingEditorKeys" value="${savedKeysValue}" placeholder="e.g. c, w, F4, Clear" />
        `));

        // Hold checkbox
        const holdField = document.createElement('div');
        holdField.className = 'binding-editor-field';
        const holdLabel = document.createElement('label');
        holdLabel.textContent = 'Hold while pressed';
        holdField.appendChild(holdLabel);

        const holdCheckbox = document.createElement('input');
        holdCheckbox.type = 'checkbox';
        holdCheckbox.id = 'bindingEditorHold';
        holdCheckbox.checked = savedHold;
        holdCheckbox.className = 'focusable';
        holdField.appendChild(holdCheckbox);
        modeContent.appendChild(holdField);

        // OS target checkbox
        const osField = document.createElement('div');
        osField.className = 'binding-editor-field';
        const osLabel = document.createElement('label');
        osLabel.textContent = 'OS-level (bypass terminal)';
        osField.appendChild(osLabel);

        const osCheckbox = document.createElement('input');
        osCheckbox.type = 'checkbox';
        osCheckbox.id = 'bindingEditorTarget';
        osCheckbox.checked = savedTarget === 'os';
        osCheckbox.className = 'focusable';
        osField.appendChild(osCheckbox);
        modeContent.appendChild(osField);

        // Auto-link: hold checked → OS pre-ticked; hold unchecked → OS unticked
        holdCheckbox.addEventListener('change', () => {
          osCheckbox.checked = holdCheckbox.checked;
        });
      };

      const renderSequenceMode = () => {
        modeContent.innerHTML = '';

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

        modeContent.appendChild(seqField);
      };

      // Initial render
      if (initialMode === 'sequence') {
        renderSequenceMode();
      } else {
        renderKeysMode();
      }

      // Mode toggle click handlers
      keysToggle.addEventListener('click', () => {
        if (keysToggle.classList.contains('mode-toggle--active')) return;
        saveCurrentSequenceState();
        keysToggle.classList.add('mode-toggle--active');
        seqToggle.classList.remove('mode-toggle--active');
        renderKeysMode();
        const firstKeysEl = modeContent.querySelector<HTMLElement>('input, button.focusable');
        if (firstKeysEl) firstKeysEl.focus();
      });

      seqToggle.addEventListener('click', () => {
        if (seqToggle.classList.contains('mode-toggle--active')) return;
        saveCurrentKeysState();
        seqToggle.classList.add('mode-toggle--active');
        keysToggle.classList.remove('mode-toggle--active');
        renderSequenceMode();
        const firstSeqEl = modeContent.querySelector<HTMLElement>('textarea, button.focusable');
        if (firstSeqEl) firstSeqEl.focus();
      });

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
      const sequenceTextarea = document.getElementById('bindingEditorSequence') as HTMLTextAreaElement;

      // If sequence textarea exists and has content, use sequence mode
      if (sequenceTextarea && sequenceTextarea.value.trim()) {
        return { action: 'keyboard', keys: [], sequence: sequenceTextarea.value };
      }

      // Otherwise, collect legacy keys
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
      const targetCheckbox = document.getElementById('bindingEditorTarget') as HTMLInputElement;
      const targetOs = targetCheckbox?.checked === true;

      const result: any = { action: 'keyboard', keys };
      if (hold) result.hold = true;
      if (targetOs) result.target = 'os';
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
