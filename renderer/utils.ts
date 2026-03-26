/**
 * Shared UI helpers used across multiple modules.
 */

import { state } from './state.js';
import { attachModalKeyboard } from './modals/modal-base.js';

/** Whether the generic form modal is currently visible (used by navigation.ts for gamepad interception). */
export let formModalVisible = false;

// ============================================================================
// Directional button normalisation
// ============================================================================

/** Maps D-pad and left stick directional buttons to a cardinal direction.
 *  Right stick is excluded — it's used for scrolling/bindings, not UI navigation. */
const DIRECTION_MAP: Record<string, 'up' | 'down' | 'left' | 'right'> = {
  DPadUp: 'up', LeftStickUp: 'up',
  DPadDown: 'down', LeftStickDown: 'down',
  DPadLeft: 'left', LeftStickLeft: 'left',
  DPadRight: 'right', LeftStickRight: 'right',
};

/** Returns the cardinal direction for any directional button, or null for non-directional buttons. */
export function toDirection(button: string): 'up' | 'down' | 'left' | 'right' | null {
  return DIRECTION_MAP[button] ?? null;
}

// ============================================================================
// Event Logging
// ============================================================================

export function logEvent(event: string): void {
  const now = new Date();
  const time = now.toLocaleTimeString('en-US', { hour12: false });
  state.eventLog.unshift({ time, event });

  // Keep only last 50 events
  if (state.eventLog.length > 50) {
    state.eventLog.pop();
  }

  renderEventLog();
}

export function renderEventLog(): void {
  const logEl = document.getElementById('eventLog');
  if (!logEl) return;

  logEl.innerHTML = state.eventLog.slice(0, 20).map(e => `
    <div class="event-log-item">
      <span class="event-log-item--time">[${e.time}]</span> ${e.event}
    </div>
  `).join('');
}

// ============================================================================
// Screen Management
// ============================================================================

/** Callback set by the settings module so showScreen can trigger settings load */
let loadSettingsCallback: (() => void) | null = null;

export function setLoadSettingsCallback(cb: () => void): void {
  loadSettingsCallback = cb;
}

export function showScreen(screenName: string): void {
  document.querySelectorAll('.screen').forEach(s => {
    // Keep sessions visible when settings is shown (slide-over)
    if (s.id === 'screen-sessions' && screenName === 'settings') {
      return;
    }
    s.classList.remove('screen--active');
  });

  const targetScreen = document.getElementById(`screen-${screenName}`);
  if (targetScreen) {
    targetScreen.classList.add('screen--active');
    state.currentScreen = screenName;
    logEvent(`Screen: ${screenName}`);

    if (screenName === 'settings' && loadSettingsCallback) {
      loadSettingsCallback();
    }
  }
}

// ============================================================================
// Profile Display
// ============================================================================

export async function updateProfileDisplay(): Promise<void> {
  try {
    if (!window.gamepadCli) return;
    const active = await window.gamepadCli.profileGetActive();
    state.activeProfile = active;
    const nameEl = document.getElementById('profileName');
    if (nameEl) nameEl.textContent = active;
  } catch (error) {
    console.error('[Renderer] Failed to update profile display:', error);
  }
}

// ============================================================================
// CLI Display Helpers
// ============================================================================

export function getCliIcon(cliType: string): string {
  const icons: Record<string, string> = {
    'claude-code': '🤖',
    'copilot-cli': '💬',
    'generic-terminal': '📟',
  };
  return icons[cliType] || '📟';
}

export function getCliDisplayName(cliType: string): string {
  const names: Record<string, string> = {
    'claude-code': 'Claude',
    'copilot-cli': 'Copilot',
    'generic-terminal': 'Terminal',
  };
  return names[cliType] || cliType;
}

// ============================================================================
// Focus helpers
// ============================================================================

export function getFocusableElements(): HTMLElement[] {
  return Array.from(document.querySelectorAll('.focusable:not([hidden])'));
}

export function navigateFocus(direction: number): void {
  const focusable = getFocusableElements();
  if (focusable.length === 0) return;

  const currentIndex = focusable.findIndex(el => el === document.activeElement);
  let nextIndex = currentIndex + direction;

  // Wrap around
  if (nextIndex < 0) nextIndex = focusable.length - 1;
  if (nextIndex >= focusable.length) nextIndex = 0;

  focusable[nextIndex].focus();
}

// ============================================================================
// Binding details formatter (shared by settings + binding editor)
// ============================================================================

export function formatBindingDetails(binding: any): string {
  switch (binding.action) {
    case 'keyboard': {
      if (!binding.sequence) return '—';
      const preview = binding.sequence.length > 40
        ? binding.sequence.substring(0, 37) + '...'
        : binding.sequence;
      return `seq: ${preview.replace(/\n/g, '↵')}`;
    }
    case 'voice':
      return binding.key
        ? `${binding.mode || 'tap'}: ${binding.key}`
        : '—';
    case 'spawn':
      return binding.cliType ? `spawn: ${binding.cliType}` : '—';
    case 'session-switch':
      return binding.direction ? `direction: ${binding.direction}` : '—';
    case 'hub-focus':
      return 'bring hub to foreground';
    case 'list-sessions':
      return 'show sessions list';
    case 'close-session':
      return 'close active session';
    case 'profile-switch':
      return binding.direction ? `profile: ${binding.direction}` : 'profile switch';
    default:
      return JSON.stringify(binding);
  }
}

// ============================================================================
// Form Modal (shared utility for profile/tools/directories)
// ============================================================================

export interface FormFieldOption {
  value: string;
  label: string;
}

export interface FormField {
  key: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  type?: 'text' | 'select' | 'textarea';
  options?: FormFieldOption[];
  /** Optional element appended after the input (e.g. syntax help panel). */
  afterElement?: HTMLElement;
}

export function showFormModal(title: string, fields: FormField[]): Promise<Record<string, string> | null> {
  return new Promise((resolve) => {
    const modal = document.getElementById('formModal');
    const titleEl = document.getElementById('formModalTitle');
    const fieldsEl = document.getElementById('formModalFields');
    const saveBtn = document.getElementById('formModalSaveBtn');
    const cancelBtn = document.getElementById('formModalCancelBtn');
    if (!modal || !titleEl || !fieldsEl || !saveBtn || !cancelBtn) {
      resolve(null);
      return;
    }

    titleEl.textContent = title;
    fieldsEl.innerHTML = '';

    fields.forEach(field => {
      const wrapper = document.createElement('div');
      wrapper.className = 'binding-editor-field';
      const label = document.createElement('label');
      label.textContent = field.label;
      wrapper.appendChild(label);

      if (field.type === 'select' && field.options) {
        const select = document.createElement('select');
        select.id = `formField_${field.key}`;
        field.options.forEach(opt => {
          const option = document.createElement('option');
          option.value = opt.value;
          option.textContent = opt.label;
          if (opt.value === (field.defaultValue ?? '')) option.selected = true;
          select.appendChild(option);
        });
        wrapper.appendChild(select);
      } else if (field.type === 'textarea') {
        const textarea = document.createElement('textarea');
        textarea.id = `formField_${field.key}`;
        textarea.className = 'sequence-textarea';
        textarea.value = field.defaultValue || '';
        textarea.rows = 4;
        if (field.placeholder) textarea.placeholder = field.placeholder;
        wrapper.appendChild(textarea);
      } else {
        const input = document.createElement('input');
        input.type = 'text';
        input.id = `formField_${field.key}`;
        input.value = field.defaultValue || '';
        if (field.placeholder) input.placeholder = field.placeholder;
        wrapper.appendChild(input);
      }

      if (field.afterElement) {
        wrapper.appendChild(field.afterElement);
      }

      fieldsEl.appendChild(wrapper);
    });

    modal.classList.add('modal--visible');
    modal.setAttribute('aria-hidden', 'false');

    formModalVisible = true;

    // Attach ESC/Enter keyboard shortcuts
    const cleanupKb = attachModalKeyboard({
      onAccept: onSave,
      onCancel: onCancel,
    });

    // Focus first input
    const firstInput = fieldsEl.querySelector('input, select, textarea') as HTMLElement;
    if (firstInput) firstInput.focus();

    function cleanup() {
      formModalVisible = false;
      modal.classList.remove('modal--visible');
      modal.setAttribute('aria-hidden', 'true');
      saveBtn.removeEventListener('click', onSave);
      cancelBtn.removeEventListener('click', onCancel);
      cleanupKb();
    }

    function onSave() {
      const result: Record<string, string> = {};
      fields.forEach(field => {
        const el = document.getElementById(`formField_${field.key}`) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
        result[field.key] = el?.value?.trim() || '';
      });
      cleanup();
      resolve(result);
    }

    function onCancel() {
      cleanup();
      resolve(null);
    }

    saveBtn.addEventListener('click', onSave);
    cancelBtn.addEventListener('click', onCancel);
  });
}

// ============================================================================
// Sequence syntax help (shared by binding editor + CLI type settings form)
// ============================================================================

/** Returns the plain-text syntax reference for the sequence input language. */
export function getSequenceSyntaxHelpText(): string {
  return `SYNTAX REFERENCE

Plain text     \u2192 Typed literally
{Enter}        \u2192 Tap special key
{Ctrl+S}       \u2192 Key combo
{Ctrl+Shift+P} \u2192 Multi-modifier combo
{Ctrl Down}    \u2192 Press & hold modifier
{Ctrl Up}      \u2192 Release modifier
{Wait 500}     \u2192 Pause 500ms
{{ or }}        \u2192 Literal { or }
Newline        \u2192 Enter key press

MODIFIERS: Ctrl, Alt, Shift, Win

SPECIAL KEYS: Enter, Tab, Esc, Space, Backspace, Delete,
  Insert, Home, End, PageUp, PageDown, Up, Down, Left,
  Right, F1\u2013F12, CapsLock, PrintScreen

EXAMPLE:
  /clear{Enter}{Wait 500}yes{Enter}{Ctrl+S}`;
}

/**
 * Creates a collapsible syntax help panel (toggle button + panel div).
 * Returns the wrapper element to append into a form field container.
 */
export function createSequenceSyntaxHelp(): HTMLElement {
  const wrapper = document.createDocumentFragment() as unknown as HTMLElement;

  const helpToggle = document.createElement('button');
  helpToggle.type = 'button';
  helpToggle.className = 'sequence-help-toggle focusable';
  helpToggle.textContent = '? Syntax Help';
  helpToggle.tabIndex = 0;

  const helpPanel = document.createElement('div');
  helpPanel.className = 'sequence-help';
  helpPanel.textContent = getSequenceSyntaxHelpText();

  helpToggle.addEventListener('click', () => {
    helpPanel.classList.toggle('sequence-help--visible');
  });

  // Return as a container div
  const container = document.createElement('div');
  container.className = 'sequence-syntax-help-container';
  container.appendChild(helpToggle);
  container.appendChild(helpPanel);
  return container;
}
