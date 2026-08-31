import { describe, expect, it } from 'vitest';
import {
  filterMessEntries,
  isMessTargetUnread,
  resolveMessLabel,
} from '../renderer/composables/useMessPane.js';
import type { MessEntry } from '../src/types/mess.js';

const sessions = [
  { id: 'sender', name: 'Planner' },
  { id: 'target', name: 'Memories' },
] as any;

function entry(overrides: Partial<MessEntry> = {}): MessEntry {
  return {
    id: 'entry',
    projectId: 'project',
    seq: 1,
    fromSessionId: 'sender',
    fromLabelSnapshot: 'old planner',
    text: 'hello',
    createdAt: 1,
    ...overrides,
  };
}

describe('Mess pane projection', () => {
  it('joins live labels and preserves snapshots for closed sessions', () => {
    expect(resolveMessLabel('sender', 'old planner', sessions)).toBe('Planner');
    expect(resolveMessLabel('closed', 'Former agent', sessions)).toBe('Former agent');
    expect(resolveMessLabel(undefined, undefined, sessions)).toBe('all');
  });

  it('takes the unread badge from the target cursor, never from session activity', () => {
    const directed = entry({ toSessionId: 'target', toLabelSnapshot: 'Memories' });

    expect(isMessTargetUnread({ ...directed, targetUnread: true })).toBe(true);
    expect(isMessTargetUnread({ ...directed, targetUnread: false })).toBe(false);
    // A busy target that already read its mail must not regain a badge, and an
    // undecorated entry claims nothing.
    expect(isMessTargetUnread(directed)).toBe(false);
    // Broadcasts have no target to be waiting on them.
    expect(isMessTargetUnread({ ...entry(), targetUnread: true })).toBe(false);
  });

  it('combines sender, broadcast, and unread filters without changing entries', () => {
    const entries = [
      entry({ id: 'broadcast' }),
      { ...entry({ id: 'direct', toSessionId: 'target', toLabelSnapshot: 'Memories' }), targetUnread: true },
    ];
    expect(filterMessEntries(entries, { senderId: 'sender', broadcast: 'yes', unread: 'either' })).toHaveLength(1);
    expect(filterMessEntries(entries, { senderId: '', broadcast: 'no', unread: 'yes' }).map(item => item.id)).toEqual(['direct']);
    expect(entries).toHaveLength(2);
  });
});
