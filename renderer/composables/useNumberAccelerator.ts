/**
 * Display-slot arithmetic for the Ctrl+<n> / Alt+<n> accelerators.
 *
 * The accelerators themselves are router handlers now — see
 * `keyboard/handlers/number-keys.ts`. This module used to own a capture-phase
 * `window` listener per scheme, instantiated twice per window.
 */

/**
 * Translate a display slot (1–9, 0) to a zero-based list index.
 * Slot 1–9 → index 0–8; slot 0 → index 9 (the 10th item).
 */
export function slotToIndex(slot: number): number {
  return slot === 0 ? 9 : slot - 1;
}
