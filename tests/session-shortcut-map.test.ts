/**
 * Tests for buildSessionShortcutMap — pure slot-assignment logic.
 */

import { describe, it, expect } from 'vitest';
import { buildSessionShortcutMap } from '../renderer/utils/session-shortcut-map.js';
import type { NavItem } from '../renderer/session-groups.js';

// ============================================================================
// Helpers
// ============================================================================

function makeSessionCard(id: string): NavItem {
  return { type: 'session-card' as const, id, groupIndex: 0 };
}

function makeGroupHeader(id: string): NavItem {
  return { type: 'group-header' as const, id, groupIndex: 0 };
}

function makeOverviewButton(): NavItem {
  return { type: 'overview-button' as const, id: 'overview', groupIndex: -1 };
}

// ============================================================================
// Tests
// ============================================================================

describe('buildSessionShortcutMap', () => {
  it('assigns slots 1–9 then 0 to first 10 visible session-card nav items in order', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
    const navList: NavItem[] = ids.map(makeSessionCard);
    const map = buildSessionShortcutMap(navList, new Set());

    expect(map.get('a')).toBe(1);
    expect(map.get('b')).toBe(2);
    expect(map.get('c')).toBe(3);
    expect(map.get('d')).toBe(4);
    expect(map.get('e')).toBe(5);
    expect(map.get('f')).toBe(6);
    expect(map.get('g')).toBe(7);
    expect(map.get('h')).toBe(8);
    expect(map.get('i')).toBe(9);
    expect(map.get('j')).toBe(0);
    expect(map.size).toBe(10);
  });

  it('skips hidden session IDs — subsequent sessions fill the gaps', () => {
    const navList: NavItem[] = ['a', 'b', 'c', 'd'].map(makeSessionCard);
    const hidden = new Set(['b']);
    const map = buildSessionShortcutMap(navList, hidden);

    // 'a' takes slot 1, 'b' is skipped, 'c' takes slot 2, 'd' takes slot 3
    expect(map.get('a')).toBe(1);
    expect(map.has('b')).toBe(false);
    expect(map.get('c')).toBe(2);
    expect(map.get('d')).toBe(3);
    expect(map.size).toBe(3);
  });

  it('sessions beyond position 10 get no entry in the map', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'];
    const navList: NavItem[] = ids.map(makeSessionCard);
    const map = buildSessionShortcutMap(navList, new Set());

    expect(map.has('k')).toBe(false);
    expect(map.has('l')).toBe(false);
    expect(map.size).toBe(10);
  });

  it('non-session-card nav items are ignored and do not consume slots', () => {
    const navList: NavItem[] = [
      makeOverviewButton(),
      makeGroupHeader('/dir/a'),
      makeSessionCard('s1'),
      makeSessionCard('s2'),
      makeGroupHeader('/dir/b'),
      makeSessionCard('s3'),
    ];
    const map = buildSessionShortcutMap(navList, new Set());

    expect(map.get('s1')).toBe(1);
    expect(map.get('s2')).toBe(2);
    expect(map.get('s3')).toBe(3);
    expect(map.size).toBe(3);
  });

  it('empty navList → empty map', () => {
    const map = buildSessionShortcutMap([], new Set());
    expect(map.size).toBe(0);
  });

  it('all sessions hidden → empty map', () => {
    const navList: NavItem[] = ['a', 'b', 'c'].map(makeSessionCard);
    const hidden = new Set(['a', 'b', 'c']);
    const map = buildSessionShortcutMap(navList, hidden);
    expect(map.size).toBe(0);
  });
});
