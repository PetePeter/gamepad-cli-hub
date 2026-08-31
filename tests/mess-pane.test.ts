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

  it('marks directed mail for a busy or closed target, never broadcasts', () => {
    expect(isMessTargetUnread(entry(), sessions, new Map([['target', 'busy']]))).toBe(false);
    expect(isMessTargetUnread(entry({ toSessionId: 'target', toLabelSnapshot: 'Memories' }), sessions, new Map([['target', 'active']]))).toBe(true);
    expect(isMessTargetUnread(entry({ toSessionId: 'closed' }), sessions, new Map())).toBe(true);
    expect(isMessTargetUnread(entry(), sessions, new Map())).toBe(false);
    expect(isMessTargetUnread({ ...entry({ toSessionId: 'target' }), targetUnread: false }, sessions, new Map([['target', 'active']]))).toBe(false);
  });

  it('combines sender, broadcast, and unread filters without changing entries', () => {
    const entries = [
      entry({ id: 'broadcast' }),
      entry({ id: 'direct', toSessionId: 'target', toLabelSnapshot: 'Memories' }),
    ];
    expect(filterMessEntries(entries, { senderId: 'sender', broadcast: 'yes', unread: 'either' }, sessions, new Map())).toHaveLength(1);
    expect(filterMessEntries(entries, { senderId: '', broadcast: 'no', unread: 'yes' }, sessions, new Map([['target', 'active']])).map(item => item.id)).toEqual(['direct']);
    expect(entries).toHaveLength(2);
  });
});
