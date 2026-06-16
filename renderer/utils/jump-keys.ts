/**
 * Jump-number helpers for selection lists (cli picker, folder picker, etc.).
 *
 * Mirrors the Ctrl+N session list: the first 10 selectable rows get slots
 * 1–9 then 0 (the 10th). Rows beyond the 10th are unnumbered. Inside a
 * selection modal the keys are bare digits (no Ctrl) — pressing one selects
 * that row immediately.
 */

export const JUMP_SLOT_COUNT = 10;

/**
 * Display label for the Nth selectable row (0-based position).
 * Positions 0–8 → "1".."9"; position 9 → "0"; beyond → null (unnumbered).
 */
export function jumpKeyLabel(position: number): number | null {
  if (position < 0 || position >= JUMP_SLOT_COUNT) return null;
  return position < 9 ? position + 1 : 0;
}

/**
 * Map a digit button ("Digit1".."Digit9","Digit0") to its 0-based row
 * position, or null if the button is not a jump-number key.
 */
export function jumpButtonToPosition(button: string): number | null {
  const match = /^Digit([0-9])$/.exec(button);
  if (!match) return null;
  const digit = parseInt(match[1], 10);
  return digit === 0 ? 9 : digit - 1;
}

// ── Tree picker: 36-slot accelerators (digits 1-9,0 then a-z) ─────────

export const TREE_JUMP_SLOT_COUNT = 36;

/** Display label for the Nth selectable row in a tree picker (0-based position). */
export function treeJumpKeyLabel(position: number): string | null {
  if (position < 0 || position >= TREE_JUMP_SLOT_COUNT) return null;
  if (position < 9) return String(position + 1);       // "1".."9"
  if (position === 9) return '0';
  return String.fromCharCode(97 + position - 10);      // "a".."z"
}

/** Map a gamepad button ("Digit1".."Digit9","Digit0","KeyA".."KeyZ") to its 0-based row position, or null. */
export function treeJumpButtonToPosition(button: string): number | null {
  const digitMatch = /^Digit([0-9])$/.exec(button);
  if (digitMatch) {
    const d = parseInt(digitMatch[1], 10);
    return d === 0 ? 9 : d - 1;
  }
  const letterMatch = /^Key([A-Z])$/.exec(button);
  if (letterMatch) return 10 + (letterMatch[1].charCodeAt(0) - 65);
  return null;
}
