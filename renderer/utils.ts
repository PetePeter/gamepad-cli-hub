/**
 * Shared UI helpers used across multiple modules.
 */

import { state } from './state.js';
import { formModal as formModalBridge, setFormModalResolve } from './stores/modal-bridge.js';

/** Whether the generic form modal is currently visible (used by navigation.ts for gamepad interception). */
export let formModalVisible = false;

// ============================================================================
// Directional button normalisation
// ============================================================================

/** Maps D-pad buttons to a cardinal direction for UI navigation.
 *  Left/right sticks are excluded — they're used for CLI bindings only. */
const DIRECTION_MAP: Record<string, 'up' | 'down' | 'left' | 'right'> = {
  DPadUp: 'up',
  DPadDown: 'down',
  DPadLeft: 'left',
  DPadRight: 'right',
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
    'codex': '🧠',
    'generic-terminal': '📟',
  };
  return icons[cliType] || '📟';
}

export function getCliDisplayName(cliType: string): string {
  const names: Record<string, string> = {
    'claude-code': 'Claude',
    'copilot-cli': 'Copilot',
    'codex': 'Codex',
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

  const target = focusable[nextIndex];
  target.focus();
  target.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
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
    case 'scroll':
      return `scroll: ${binding.direction || 'down'}${binding.lines ? ` (${binding.lines} lines)` : ''}`;
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
  type?: 'text' | 'select' | 'textarea' | 'checkbox' | 'sequence-items';
  options?: FormFieldOption[];
  /** Block save when the value is empty/unchecked and show inline validation. */
  required?: boolean;
  /** Show a native OS folder-picker button next to the text input. */
  browse?: boolean;
  /** Show label inputs for each item in sequence-items fields. Default true. */
  showLabels?: boolean;
}

export function getRequiredFormFieldError(field: Pick<FormField, 'label' | 'required' | 'type'>, value?: string): string | null {
  if (!field.required) return null;

  if (field.type === 'checkbox') {
    return value === 'true' ? null : `${field.label} is required.`;
  }

  if (field.type === 'sequence-items') {
    if (!value) return `${field.label} is required.`;
    try {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) return `${field.label} is required.`;
      const hasContent = parsed.some((item: any) =>
        typeof item?.sequence === 'string' && item.sequence.trim().length > 0,
      );
      return hasContent ? null : `${field.label} is required.`;
    } catch {
      return `${field.label} is required.`;
    }
  }

  return value?.trim() ? null : `${field.label} is required.`;
}

/** Extract folder basename from a path (handles both / and \). */
function folderBasename(folderPath: string): string {
  const parts = folderPath.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || parts[parts.length - 2] || '';
}

/** Create a 📁 browse button that opens a native folder picker and fills the given input. */
export function createBrowseButton(
  pathInput: HTMLInputElement,
  nameInput?: HTMLInputElement | null,
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = '📁';
  btn.title = 'Browse…';
  btn.type = 'button';
  btn.addEventListener('click', async () => {
    const selected = await window.gamepadCli.dialogOpenFolder();
    if (selected) {
      pathInput.value = selected;
      pathInput.dispatchEvent(new Event('input', { bubbles: true }));
      const nameEl = nameInput ?? document.getElementById('formField_name') as HTMLInputElement | null;
      if (nameEl && !nameEl.value.trim()) {
        nameEl.value = folderBasename(selected);
      }
    }
  });
  return btn;
}

export function showFormModal(title: string, fields: FormField[]): Promise<Record<string, string> | null> {
  return new Promise((resolve) => {
    formModalBridge.visible = true;
    formModalBridge.title = title;
    formModalBridge.fields = fields.map(f => ({
      key: f.key,
      label: f.label,
      defaultValue: f.defaultValue,
      placeholder: f.placeholder,
      type: f.type,
      options: f.options,
      required: f.required,
      browse: f.browse,
      showLabels: f.showLabels,
    }));

    formModalVisible = true;
    setFormModalResolve((values: Record<string, string> | null) => {
      formModalVisible = false;
      formModalBridge.visible = false;
      resolve(values);
    });
  });
}

// ============================================================================
// Sequence syntax help (shared by binding editor + CLI type settings form)
// ============================================================================

/** Returns the plain-text syntax reference for the sequence input language. */
export function getSequenceSyntaxHelpText(): string {
  return `SYNTAX REFERENCE

Plain text     \u2192 Typed literally
{Enter}        \u2192 Newline (stays in prompt)
{Send}         \u2192 Submit / send prompt
{Ctrl+S}       \u2192 Key combo
{Ctrl+Shift+P} \u2192 Multi-modifier combo
{Ctrl Down}    \u2192 Press & hold modifier
{Ctrl Up}      \u2192 Release modifier
{Wait 500}     \u2192 Pause 500ms
{{ or }}        \u2192 Literal { or }
Newline        \u2192 Enter key press

MODIFIERS: Ctrl, Alt, Shift, Win

SPECIAL KEYS: Enter, Send, Tab, Esc, Space, Backspace, Delete,
  Insert, Home, End, PageUp, PageDown, Up, Down, Left,
  Right, F1\u2013F12, CapsLock, PrintScreen

EXAMPLE:
  /allow-all{Send}{Wait 3000}prompt text here`;
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

/** Escape HTML special characters to prevent XSS when using innerHTML. */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
