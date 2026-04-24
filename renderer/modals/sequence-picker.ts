/**
 * Sequence picker modal — bridge to Vue SequencePickerModal.vue.
 *
 * Legacy callers still use showSequencePicker() / hideSequencePicker().
 * These now set reactive bridge state that App.vue's SequencePickerModal observes.
 */

import { logEvent } from '../utils.js';
import {
  sequencePicker, setSequencePickerCallback,
} from '../stores/modal-bridge.js';
import type { SequenceListItem } from '../../src/config/loader.js';

// ============================================================================
// State — kept for legacy readers
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

// ============================================================================
// Show / Hide — bridge to Vue
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

  sequencePicker.visible = true;
  sequencePicker.items = [...items];
  setSequencePickerCallback(onSelect);

  logEvent('Sequence picker opened');
}

export function hideSequencePicker(): void {
  sequencePickerState.visible = false;
  sequencePicker.visible = false;
  setSequencePickerCallback(null);
}

// ============================================================================
// Gamepad handler — kept for legacy callers (no-op now, Vue handles)
// ============================================================================

export function handleSequencePickerButton(_button: string): void {}
