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
