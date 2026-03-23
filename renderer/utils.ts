/**
 * Shared UI helpers used across multiple modules.
 */

import { state } from './state.js';

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
  // Hide all screens
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.remove('screen--active');
  });

  // Show target screen
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
// Footer Bindings
// ============================================================================

export function renderFooterBindings(): void {
  const container = document.getElementById('footerBindings');
  if (!container) return;

  container.innerHTML = '';

  const bindings = state.globalBindings || {};
  const allBindings: Record<string, string> = {};

  // Global bindings
  for (const [button, binding] of Object.entries(bindings)) {
    allBindings[button] = getShortActionLabel(binding);
  }

  // Active CLI bindings (if a session is focused)
  if (state.activeSessionId) {
    const session = state.sessions.find(s => s.id === state.activeSessionId);
    if (session) {
      const cliBindings = state.cliBindingsCache[session.cliType] || {};
      for (const [button, binding] of Object.entries(cliBindings)) {
        if (!allBindings[button]) {
          allBindings[button] = getShortActionLabel(binding);
        }
      }
    }
  }

  // Render each as a hint
  for (const [button, label] of Object.entries(allBindings)) {
    const hint = document.createElement('span');
    hint.className = 'nav-hint';
    hint.innerHTML = `<kbd>${getButtonSymbol(button)}</kbd> ${label}`;
    container.appendChild(hint);
  }
}

function getShortActionLabel(binding: any): string {
  switch (binding.action) {
    case 'keyboard':
      return binding.keys?.length === 1 ? binding.keys[0] : (binding.keys?.join('+') || 'keys');
    case 'spawn':
      return `+${getCliDisplayName(binding.cliType || '')}`;
    case 'session-switch':
      return binding.direction === 'next' ? 'Next' : 'Prev';
    case 'profile-switch':
      return binding.direction === 'next' ? 'Prof→' : '←Prof';
    case 'voice':
      return 'Voice';
    case 'hub-focus':
      return 'Hub';
    case 'list-sessions':
      return 'Sessions';
    case 'close-session':
      return 'Close';
    default:
      return binding.action || '?';
  }
}

function getButtonSymbol(button: string): string {
  const symbols: Record<string, string> = {
    'Up': '↑',
    'Down': '↓',
    'Left': '←',
    'Right': '→',
    'A': 'A',
    'B': 'B',
    'X': 'X',
    'Y': 'Y',
    'LeftTrigger': 'LT',
    'RightTrigger': 'RT',
    'LeftBumper': 'LB',
    'RightBumper': 'RB',
    'Back': '⊲',
    'Sandwich': '☰',
    'Xbox': 'ⓧ',
  };
  return symbols[button] || button;
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
    case 'keyboard':
      return binding.keys ? binding.keys.join(' → ') : '—';
    case 'spawn':
      return binding.cliType ? `spawn: ${binding.cliType}` : '—';
    case 'session-switch':
      return binding.direction ? `direction: ${binding.direction}` : '—';
    case 'voice':
      return binding.holdDuration
        ? `voice hold ${binding.key || 'space'} ${binding.holdDuration}ms`
        : 'voice';
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

export interface FormField {
  key: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  type?: 'text' | 'select';
  options?: string[];
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
          option.value = opt;
          option.textContent = opt;
          if (opt === field.defaultValue) option.selected = true;
          select.appendChild(option);
        });
        wrapper.appendChild(select);
      } else {
        const input = document.createElement('input');
        input.type = 'text';
        input.id = `formField_${field.key}`;
        input.value = field.defaultValue || '';
        if (field.placeholder) input.placeholder = field.placeholder;
        wrapper.appendChild(input);
      }

      fieldsEl.appendChild(wrapper);
    });

    modal.classList.add('modal--visible');
    modal.setAttribute('aria-hidden', 'false');

    // Focus first input
    const firstInput = fieldsEl.querySelector('input, select') as HTMLElement;
    if (firstInput) firstInput.focus();

    function cleanup() {
      modal.classList.remove('modal--visible');
      modal.setAttribute('aria-hidden', 'true');
      saveBtn.removeEventListener('click', onSave);
      cancelBtn.removeEventListener('click', onCancel);
    }

    function onSave() {
      const result: Record<string, string> = {};
      fields.forEach(field => {
        const el = document.getElementById(`formField_${field.key}`) as HTMLInputElement | HTMLSelectElement;
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
