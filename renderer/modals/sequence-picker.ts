/**
 * Sequence picker modal — select from a list of pre-prepared text sequences.
 *
 * When a `sequence-list` binding is triggered, this picker shows a list of
 * labelled sequence items. The user picks one via D-pad, mouse, or keyboard,
 * and the selected item's sequence string is passed to a callback.
 */

import { logEvent, toDirection } from '../utils.js';
import { attachModalKeyboard } from './modal-base.js';
import type { SequenceListItem } from '../../src/config/loader.js';

// ============================================================================
// State
// ============================================================================

export interface SequencePickerState {
  visible: boolean;
  selectedIndex: number;
  items: SequenceListItem[];
  onSelect: ((sequence: string) => void) | null;
}

export const sequencePickerState: SequencePickerState = {
  visible: false,
  selectedIndex: 0,
  items: [],
  onSelect: null,
};

// Keyboard shortcut cleanup
let cleanupKeyboard: (() => void) | null = null;

// ============================================================================
// Show / Hide
// ============================================================================

export function showSequencePicker(items: SequenceListItem[], onSelect: (sequence: string) => void): void {
  if (items.length === 0) {
    logEvent('Sequence picker: no items to show');
    return;
  }

  sequencePickerState.visible = true;
  sequencePickerState.selectedIndex = 0;
  sequencePickerState.items = [...items];
  sequencePickerState.onSelect = onSelect;

  const overlay = document.getElementById('sequencePickerOverlay');
  const picker = document.getElementById('sequencePicker');
  if (!overlay || !picker) return;

  renderSequencePicker();

  overlay.classList.add('modal--visible');
  overlay.setAttribute('aria-hidden', 'false');

  // Attach keyboard shortcuts
  cleanupKeyboard?.();
  cleanupKeyboard = attachModalKeyboard({
    mode: 'selection',
    onAccept: () => executeSelectedItem(),
    onCancel: () => hideSequencePicker(),
    onArrowUp: () => {
      const count = sequencePickerState.items.length;
      sequencePickerState.selectedIndex = ((sequencePickerState.selectedIndex - 1) % count + count) % count;
      renderSequencePicker();
    },
    onArrowDown: () => {
      const count = sequencePickerState.items.length;
      sequencePickerState.selectedIndex = (sequencePickerState.selectedIndex + 1) % count;
      renderSequencePicker();
    },
  });

  logEvent('Sequence picker opened');
}

export function hideSequencePicker(): void {
  sequencePickerState.visible = false;

  cleanupKeyboard?.();
  cleanupKeyboard = null;

  const overlay = document.getElementById('sequencePickerOverlay');
  if (overlay) {
    overlay.classList.remove('modal--visible');
    overlay.setAttribute('aria-hidden', 'true');
  }
}

// ============================================================================
// Render
// ============================================================================

export function renderSequencePicker(): void {
  const picker = document.getElementById('sequencePicker');
  if (!picker) return;

  picker.innerHTML = '';

  sequencePickerState.items.forEach((item, index) => {
    const div = document.createElement('div');
    div.className = 'context-menu-item sequence-picker-item';
    div.dataset.index = String(index);

    if (index === sequencePickerState.selectedIndex) {
      div.classList.add('context-menu-item--selected');
    }

    const span = document.createElement('span');
    span.className = 'item-text';
    span.textContent = item.label;

    div.appendChild(span);
    picker.appendChild(div);
  });

  // Wire click handlers on dynamically created items
  const itemEls = picker.querySelectorAll('.sequence-picker-item');
  itemEls.forEach((el) => {
    el.addEventListener('click', () => {
      const idx = parseInt((el as HTMLElement).dataset.index ?? '0', 10);
      sequencePickerState.selectedIndex = idx;
      executeSelectedItem();
    });
  });

  // Scroll selected item into view
  const selected = picker.querySelector('.context-menu-item--selected') as HTMLElement | null;
  if (selected?.scrollIntoView) {
    selected.scrollIntoView({ block: 'nearest' });
  }
}

// ============================================================================
// Gamepad button handler
// ============================================================================

export function handleSequencePickerButton(button: string): void {
  const dir = toDirection(button);
  const count = sequencePickerState.items.length;

  if (dir === 'up') {
    sequencePickerState.selectedIndex = ((sequencePickerState.selectedIndex - 1) % count + count) % count;
    renderSequencePicker();
    return;
  }
  if (dir === 'down') {
    sequencePickerState.selectedIndex = (sequencePickerState.selectedIndex + 1) % count;
    renderSequencePicker();
    return;
  }

  switch (button) {
    case 'A':
      executeSelectedItem();
      break;
    case 'B':
      hideSequencePicker();
      break;
  }
}

// ============================================================================
// Click handlers — overlay wired once at init
// ============================================================================

export function initSequencePickerClickHandlers(): void {
  const overlay = document.getElementById('sequencePickerOverlay');
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) {
      hideSequencePicker();
    }
  });
}

// ============================================================================
// Execute selected sequence
// ============================================================================

function executeSelectedItem(): void {
  const item = sequencePickerState.items[sequencePickerState.selectedIndex];
  if (!item) return;

  const { onSelect } = sequencePickerState;
  hideSequencePicker();

  if (onSelect) {
    onSelect(item.sequence);
  }

  logEvent(`Sequence selected: ${item.label}`);
}
