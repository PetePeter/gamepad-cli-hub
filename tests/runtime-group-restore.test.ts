/**
 * reattachRestoredSession unit tests — real RuntimeGroupManager, no mocks.
 */

import { describe, it, expect, vi } from 'vitest';
import { RuntimeGroupManager } from '../src/session/runtime-group-manager.js';
import { reattachRestoredSession } from '../src/session/runtime-group-restore.js';

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe('reattachRestoredSession', () => {
  it('R3 reattaches into an existing group by id', () => {
    const mgr = new RuntimeGroupManager();
    mgr.ensureGroup('g1', 'G');

    reattachRestoredSession(mgr, { runtimeGroupId: 'g1', runtimeGroupName: 'G' }, 'newSid');

    expect(mgr.groupForSession('newSid')!.id).toBe('g1');
    expect(mgr.list()).toHaveLength(1);
  });

  it('R4 recreates a deleted group by id + name and adds the session', () => {
    const mgr = new RuntimeGroupManager();

    reattachRestoredSession(mgr, { runtimeGroupId: 'g9', runtimeGroupName: 'Gone' }, 'newSid');

    const group = mgr.get('g9');
    expect(group).not.toBeNull();
    expect(group!.name).toBe('Gone');
    expect(group!.sessionIds).toEqual(['newSid']);
  });

  it('R5 two entries from the same closed group land in ONE recreated group', () => {
    const mgr = new RuntimeGroupManager();
    const entry = { runtimeGroupId: 'g9', runtimeGroupName: 'Gone' };

    reattachRestoredSession(mgr, entry, 'a');
    reattachRestoredSession(mgr, entry, 'b');

    const groups = mgr.list().filter(g => g.id === 'g9');
    expect(groups).toHaveLength(1);
    expect(groups[0].sessionIds).toEqual(['a', 'b']);
  });

  it('R6 no tag is a safe no-op', () => {
    const mgr = new RuntimeGroupManager();

    expect(() => reattachRestoredSession(mgr, {}, 'newSid')).not.toThrow();
    expect(mgr.list()).toHaveLength(0);
  });
});
