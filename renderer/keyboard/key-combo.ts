/**
 * Combo normalization — the router's entire vocabulary for "which key".
 *
 * Every handler matches against these strings instead of re-deriving modifier
 * logic, so a binding reads the way it is spoken: `ctrl+shift+o`, `ctrl+tab`,
 * `escape`. Meta is folded into ctrl because this app treats Cmd as Ctrl
 * everywhere; leaving that to each handler is how `ctrlKey || metaKey` ended up
 * copied into a dozen guards.
 */

export interface ComboEvent {
  key: string;
  /** Layout-independent physical key. Optional so tests and synthetic events stay cheap. */
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/** Keys whose `event.key` is unpronounceable as a binding. */
const KEY_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  ' ': 'space',
  spacebar: 'space',
});

/**
 * `KeyboardEvent` → canonical combo string.
 *
 * Modifier order is fixed (ctrl, alt, shift) so a combo has exactly one
 * spelling, and the key is lowercased so Shift+O and shift+o agree.
 */
export function toCombo(event: ComboEvent): string {
  const key = event.key.toLowerCase();
  const name = KEY_ALIASES[key] ?? key;

  let prefix = '';
  if (event.ctrlKey || event.metaKey) prefix += 'ctrl+';
  if (event.altKey) prefix += 'alt+';
  if (event.shiftKey) prefix += 'shift+';

  return prefix + name;
}

/**
 * Digit pressed, as a slot number, or null.
 *
 * Reads `event.code` first: Alt remaps `event.key` to a symbol on several
 * layouts, which would otherwise make Alt+1 unbindable.
 */
export function digitSlot(event: ComboEvent): number | null {
  const code = event.code ?? '';
  if (code.length === 6 && code.startsWith('Digit')) return Number(code.slice(5));
  if (event.key.length === 1 && event.key >= '0' && event.key <= '9') return Number(event.key);
  return null;
}
