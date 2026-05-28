import type { NavItem } from '../session-groups.js';

const SLOT_COUNT = 10;

/**
 * Maps visible session IDs in navList display order to their Ctrl+N slot.
 * Slots 1–9 → Ctrl+1..9; slot 0 → Ctrl+0 (position 10).
 * Skips non-session-card items and sessions in hiddenSessionIds.
 */
export function buildSessionShortcutMap(
  navList: NavItem[],
  hiddenSessionIds: Set<string>,
): Map<string, number> {
  const map = new Map<string, number>();
  let pos = 0;

  for (const item of navList) {
    if (item.type !== 'session-card') continue;
    if (hiddenSessionIds.has(item.id)) continue;
    if (pos >= SLOT_COUNT) break;
    map.set(item.id, pos < 9 ? pos + 1 : 0);
    pos++;
  }

  return map;
}
