import { onMounted, onUnmounted } from 'vue';

/**
 * Generic Ctrl/Alt + number accelerator.
 *
 * Registers a single capturing keydown listener that fires `onSlot` with the
 * pressed display slot: digits 1–9 map to 1–9, digit 0 maps to slot 0 (the
 * 10th position). The exact same parsing — modifier guard, modal-overlay
 * suppression, and digit-stable `e.code` resolution (Alt can remap `e.key` to
 * a symbol on some layouts) — is shared by both the Ctrl (session jump) and
 * Alt (chip action) schemes. Each window instantiates it twice with a
 * different `modifier` + `onSlot`.
 *
 * Blocked when any modal overlay is visible to avoid conflicting with modal
 * keyboard handling.
 *
 * `onSlot` returns whether it consumed the press; the event is only
 * default-prevented / stopped when consumed, so unmapped slots fall through.
 */
export function useNumberAccelerator(options: {
  modifier: 'ctrl' | 'alt';
  onSlot: (slot: number) => boolean;
}): void {
  const { modifier, onSlot } = options;

  function onKeydown(e: KeyboardEvent): void {
    const wantCtrl = modifier === 'ctrl';
    const wantAlt = modifier === 'alt';
    if (e.ctrlKey !== wantCtrl || e.altKey !== wantAlt || e.shiftKey || e.metaKey) return;

    // e.code stays digit-stable even when Alt remaps e.key (e.g. to a symbol).
    let slot: number | null = null;
    if (e.code >= 'Digit0' && e.code <= 'Digit9') slot = parseInt(e.code.slice(5), 10);
    else if (e.key >= '0' && e.key <= '9') slot = parseInt(e.key, 10);
    if (slot === null) return;

    if (document.querySelector('.modal-overlay.modal--visible')) return;

    if (onSlot(slot)) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }

  onMounted(() => window.addEventListener('keydown', onKeydown, true));
  onUnmounted(() => window.removeEventListener('keydown', onKeydown, true));
}

/**
 * Translate a display slot (1–9, 0) to a zero-based list index.
 * Slot 1–9 → index 0–8; slot 0 → index 9 (the 10th item).
 */
export function slotToIndex(slot: number): number {
  return slot === 0 ? 9 : slot - 1;
}
