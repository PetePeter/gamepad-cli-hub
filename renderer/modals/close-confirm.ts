/**
 * Close confirmation modal — centered popup asking "Close this session?"
 *
 * Replaces the inline ×→? double-click-to-confirm pattern.
 * Triggered from session card ? button or gamepad A on close column.
 */

import { logEvent, toDirection } from '../utils.js';
import { attachModalKeyboard } from './modal-base.js';

// ============================================================================
// State
// ============================================================================

export interface CloseConfirmState {
  visible: boolean;
  sessionId: string;
  sessionName: string;
  selectedIndex: number;  // 0 = Cancel, 1 = Close
}

export const closeConfirmState: CloseConfirmState = {
  visible: false,
  sessionId: '',
  sessionName: '',
  selectedIndex: 0, // Default to Cancel for safety
};

// Callbacks
let onConfirmCallback: ((sessionId: string) => void) | null = null;
let cleanupKeyboard: (() => void) | null = null;

// ============================================================================
// Show / Hide
// ============================================================================

export function showCloseConfirm(
  sessionId: string,
  sessionName: string,
  onConfirm: (sessionId: string) => void,
): void {
  closeConfirmState.visible = true;
  closeConfirmState.sessionId = sessionId;
  closeConfirmState.sessionName = sessionName;
  closeConfirmState.selectedIndex = 0; // Default to Cancel
  onConfirmCallback = onConfirm;

  const overlay = document.getElementById('closeConfirmOverlay');
  if (!overlay) return;

  renderCloseConfirm();

  overlay.classList.add('modal--visible');
  overlay.setAttribute('aria-hidden', 'false');

  // Attach keyboard shortcuts
  cleanupKeyboard?.();
  cleanupKeyboard = attachModalKeyboard({
    onAccept: () => executeSelected(),
    onCancel: () => hideCloseConfirm(),
  });

  logEvent('Close confirmation shown');
}

export function hideCloseConfirm(): void {
  closeConfirmState.visible = false;
  onConfirmCallback = null;

  cleanupKeyboard?.();
  cleanupKeyboard = null;

  const overlay = document.getElementById('closeConfirmOverlay');
  if (overlay) {
    overlay.classList.remove('modal--visible');
    overlay.setAttribute('aria-hidden', 'true');
  }
}

// ============================================================================
// Render
// ============================================================================

function renderCloseConfirm(): void {
  const body = document.getElementById('closeConfirmBody');
  if (!body) return;

  body.textContent = `Close "${closeConfirmState.sessionName}"?`;

  const closeBtn = document.getElementById('closeConfirmCloseBtn');
  const cancelBtn = document.getElementById('closeConfirmCancelBtn');
  if (cancelBtn) cancelBtn.classList.toggle('btn--focused', closeConfirmState.selectedIndex === 0);
  if (closeBtn) closeBtn.classList.toggle('btn--focused', closeConfirmState.selectedIndex === 1);
}

// ============================================================================
// Gamepad button handler
// ============================================================================

export function handleCloseConfirmButton(button: string): void {
  const dir = toDirection(button);

  if (dir === 'left' || dir === 'right') {
    closeConfirmState.selectedIndex = closeConfirmState.selectedIndex === 0 ? 1 : 0;
    renderCloseConfirm();
    return;
  }

  switch (button) {
    case 'A':
      executeSelected();
      break;
    case 'B':
      hideCloseConfirm();
      break;
  }
}

// ============================================================================
// Execute
// ============================================================================

function executeSelected(): void {
  if (closeConfirmState.selectedIndex === 1) {
    // Close confirmed — capture callback before hide nulls it
    const sessionId = closeConfirmState.sessionId;
    const cb = onConfirmCallback;
    hideCloseConfirm();
    cb?.(sessionId);
  } else {
    // Cancel
    hideCloseConfirm();
  }
}

// ============================================================================
// Click handlers — wired once at init
// ============================================================================

export function initCloseConfirmClickHandlers(): void {
  const closeBtn = document.getElementById('closeConfirmCloseBtn');
  const cancelBtn = document.getElementById('closeConfirmCancelBtn');
  const overlay = document.getElementById('closeConfirmOverlay');

  closeBtn?.addEventListener('click', () => {
    closeConfirmState.selectedIndex = 1;
    executeSelected();
  });

  cancelBtn?.addEventListener('click', () => {
    hideCloseConfirm();
  });

  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) {
      hideCloseConfirm();
    }
  });
}
