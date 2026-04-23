/**
 * Session Rename Modal — rename active session via Ctrl+Shift+R
 */

import { logEvent } from '../utils.js';

export interface SessionRenameState {
  visible: boolean;
  sessionId: string;
  currentName: string;
  inputValue: string;
  error: string;
}

export const sessionRenameState: SessionRenameState = {
  visible: false,
  sessionId: '',
  currentName: '',
  inputValue: '',
  error: '',
};

const MAX_NAME_LENGTH = 50;

export function showSessionRenameModal(sessionId: string, currentName: string): void {
  sessionRenameState.visible = true;
  sessionRenameState.sessionId = sessionId;
  sessionRenameState.currentName = currentName;
  sessionRenameState.inputValue = currentName;
  sessionRenameState.error = '';
  renderModal();
  focusInput();
}

export function hideSessionRenameModal(): void {
  sessionRenameState.visible = false;
  sessionRenameState.error = '';
  renderModal();
}

export async function submitRename(): Promise<void> {
  const trimmed = sessionRenameState.inputValue.trim();

  // Validation
  if (!trimmed) {
    sessionRenameState.error = 'Name cannot be empty';
    return;
  }

  if (trimmed.length > MAX_NAME_LENGTH) {
    sessionRenameState.error = `Name too long (max ${MAX_NAME_LENGTH} chars)`;
    return;
  }

  if (trimmed === sessionRenameState.currentName) {
    hideSessionRenameModal();
    return;
  }

  try {
    const result = await window.gamepadCli.sessionRename(
      sessionRenameState.sessionId,
      trimmed
    );

    if (result.success) {
      logEvent(`Renamed to: ${trimmed}`);
      hideSessionRenameModal();
      // Trigger reload via event so App.vue can refresh
      window.dispatchEvent(new CustomEvent('session-renamed', {
        detail: { sessionId: sessionRenameState.sessionId, newName: trimmed }
      }));
    } else {
      sessionRenameState.error = result.error || 'Rename failed';
    }
  } catch (err) {
    sessionRenameState.error = `Error: ${err instanceof Error ? err.message : 'Unknown error'}`;
  }
}

export function updateInputValue(value: string): void {
  sessionRenameState.inputValue = value;
  sessionRenameState.error = ''; // Clear error on input change
}

export function isOkButtonDisabled(): boolean {
  const trimmed = sessionRenameState.inputValue.trim();
  return !trimmed || trimmed.length > MAX_NAME_LENGTH;
}

function focusInput(): void {
  const input = document.getElementById('sessionRenameInput') as HTMLInputElement | null;
  if (input) {
    setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
  }
}

function renderModal(): void {
  const existing = document.getElementById('sessionRenameModal');
  if (existing) existing.remove();

  if (!sessionRenameState.visible) return;

  const modal = document.createElement('div');
  modal.id = 'sessionRenameModal';
  modal.className = 'modal-overlay modal--visible';
  modal.style.zIndex = '1000';

  const trimmed = sessionRenameState.inputValue.trim();
  const isDisabled = !trimmed || trimmed.length > MAX_NAME_LENGTH;

  modal.innerHTML = `
    <div class="modal-content" style="max-width: 400px;">
      <div class="modal-header">
        <h3>Rename Session</h3>
      </div>
      <div class="modal-body">
        <input
          id="sessionRenameInput"
          type="text"
          class="modal-input"
          maxlength="100"
          placeholder="Enter session name..."
          value="${sessionRenameState.inputValue.replace(/"/g, '&quot;')}"
        />
        ${sessionRenameState.error ? `<div class="modal-error">${sessionRenameState.error}</div>` : ''}
        <div class="modal-info" style="margin-top: 12px; font-size: 12px; color: #888;">
          ${sessionRenameState.inputValue.length}/${MAX_NAME_LENGTH} chars
        </div>
      </div>
      <div class="modal-footer">
        <button
          id="sessionRenameOkBtn"
          class="btn btn--primary"
          ${isDisabled ? 'disabled' : ''}
        >OK</button>
        <button
          id="sessionRenameCancelBtn"
          class="btn btn--secondary"
        >Cancel</button>
      </div>
    </div>
  `;

  // Wire up event handlers
  const input = modal.querySelector('#sessionRenameInput') as HTMLInputElement;
  const okBtn = modal.querySelector('#sessionRenameOkBtn') as HTMLButtonElement;
  const cancelBtn = modal.querySelector('#sessionRenameCancelBtn') as HTMLButtonElement;

  input?.addEventListener('input', (e) => {
    updateInputValue((e.target as HTMLInputElement).value);
    renderModal(); // Re-render to update char count and button state
  });

  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !isDisabled) {
      void submitRename();
    } else if (e.key === 'Escape') {
      hideSessionRenameModal();
    }
  });

  okBtn?.addEventListener('click', () => {
    if (!isDisabled) void submitRename();
  });

  cancelBtn?.addEventListener('click', () => hideSessionRenameModal());

  // Block keyboard relay when modal is visible
  document.body.appendChild(modal);
}

export function initSessionRenameModal(): void {
  // Initialize on demand, no permanent DOM needed
}
