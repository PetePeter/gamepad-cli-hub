/**
 * Quick-spawn modal — CLI type picker triggered from the context menu.
 *
 * Shows a centred list of available CLI types. Pre-selects the active
 * session's CLI type. On selection, triggers the spawn flow (which opens
 * the dir-picker if working directories are configured).
 */

import { logEvent, toDirection, getCliDisplayName } from '../utils.js';
import { attachModalKeyboard } from './modal-base.js';

// ============================================================================
// State
// ============================================================================

export interface QuickSpawnState {
  visible: boolean;
  selectedIndex: number;
  cliTypes: string[];
  onSelect: ((cliType: string) => void) | null;
}

export const quickSpawnState: QuickSpawnState = {
  visible: false,
  selectedIndex: 0,
  cliTypes: [],
  onSelect: null,
};

// Keyboard shortcut cleanup
let cleanupKeyboard: (() => void) | null = null;

// ============================================================================
// Show / Hide
// ============================================================================

export function showQuickSpawn(
  cliTypes: string[],
  onSelect: (cliType: string) => void,
  preselectedCliType?: string,
): void {
  if (cliTypes.length === 0) {
    logEvent('Quick spawn: no CLI types available');
    return;
  }

  quickSpawnState.visible = true;
  quickSpawnState.cliTypes = [...cliTypes];
  quickSpawnState.onSelect = onSelect;

  // Pre-select CLI type matching the active session
  const matchIdx = preselectedCliType
    ? cliTypes.indexOf(preselectedCliType)
    : -1;
  quickSpawnState.selectedIndex = matchIdx >= 0 ? matchIdx : 0;

  const overlay = document.getElementById('quickSpawnOverlay');
  if (!overlay) return;

  renderQuickSpawn();

  overlay.classList.add('modal--visible');
  overlay.setAttribute('aria-hidden', 'false');

  // Attach keyboard shortcuts
  cleanupKeyboard?.();
  cleanupKeyboard = attachModalKeyboard({
    onAccept: () => executeSelectedItem(),
    onCancel: () => hideQuickSpawn(),
  });

  logEvent('Quick spawn opened');
}

export function hideQuickSpawn(): void {
  quickSpawnState.visible = false;

  cleanupKeyboard?.();
  cleanupKeyboard = null;

  const overlay = document.getElementById('quickSpawnOverlay');
  if (overlay) {
    overlay.classList.remove('modal--visible');
    overlay.setAttribute('aria-hidden', 'true');
  }
}

// ============================================================================
// Render
// ============================================================================

export function renderQuickSpawn(): void {
  const list = document.getElementById('quickSpawnList');
  if (!list) return;

  list.innerHTML = '';

  quickSpawnState.cliTypes.forEach((cliType, index) => {
    const item = document.createElement('div');
    item.className = 'dir-picker-item focusable';
    item.dataset.index = String(index);

    if (index === quickSpawnState.selectedIndex) {
      item.classList.add('dir-picker-item--selected');
    }

    item.tabIndex = 0;
    item.innerHTML = `
      <span class="dir-picker-item__name">${getCliDisplayName(cliType)}</span>
      <span class="dir-picker-item__path">${cliType}</span>
    `;

    item.addEventListener('click', () => {
      quickSpawnState.selectedIndex = index;
      executeSelectedItem();
    });

    list.appendChild(item);
  });

  // Focus + scroll the selected item into view
  const selected = list.children[quickSpawnState.selectedIndex] as HTMLElement;
  selected?.focus();
  selected?.scrollIntoView?.({ block: 'nearest' });
}

// ============================================================================
// Gamepad button handler
// ============================================================================

export function handleQuickSpawnButton(button: string): void {
  const dir = toDirection(button);
  const count = quickSpawnState.cliTypes.length;

  if (dir === 'up') {
    quickSpawnState.selectedIndex = Math.max(0, quickSpawnState.selectedIndex - 1);
    renderQuickSpawn();
    return;
  }
  if (dir === 'down') {
    quickSpawnState.selectedIndex = Math.min(count - 1, quickSpawnState.selectedIndex + 1);
    renderQuickSpawn();
    return;
  }

  switch (button) {
    case 'A':
      executeSelectedItem();
      break;
    case 'B':
      hideQuickSpawn();
      break;
  }
}

// ============================================================================
// Click handlers — overlay wired once at init
// ============================================================================

export function initQuickSpawnClickHandlers(): void {
  const overlay = document.getElementById('quickSpawnOverlay');
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) {
      hideQuickSpawn();
    }
  });
}

// ============================================================================
// Execute selected CLI type
// ============================================================================

function executeSelectedItem(): void {
  const cliType = quickSpawnState.cliTypes[quickSpawnState.selectedIndex];
  if (!cliType) return;

  const { onSelect } = quickSpawnState;
  hideQuickSpawn();

  if (onSelect) {
    onSelect(cliType);
  }

  logEvent(`Quick spawn selected: ${cliType}`);
}
