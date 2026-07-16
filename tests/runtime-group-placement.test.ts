/**
 * Runtime group placement — the standardised rule for MCP-spawned sessions.
 *
 * A session is ALWAYS made for its project; a runtime group is an OPTIONAL overlay.
 * These tests exercise the real RuntimeGroupManager (no mocks) against the pure
 * placement resolver used by session_create.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { RuntimeGroupManager } from '../src/session/runtime-group-manager.js';
import { placeSessionInRuntimeGroup } from '../src/session/runtime-group-placement.js';

describe('placeSessionInRuntimeGroup', () => {
  let manager: RuntimeGroupManager;

  beforeEach(() => {
    // No persistence side effect in tests; deterministic clock not required here.
    manager = new RuntimeGroupManager();
  });

  it('inherits the creator group when runtimeGroupId is omitted', () => {
    const group = manager.create('Feature X');
    manager.addSession(group.id, 'creator');

    const result = placeSessionInRuntimeGroup(manager, {
      creatorSessionId: 'creator',
      newSessionId: 'child',
    });

    expect(result).toEqual({ runtimeGroupId: group.id, runtimeGroupName: 'Feature X' });
    expect(manager.groupForSession('child')?.id).toBe(group.id);
  });

  it('places under project only (null) when the creator has no group', () => {
    const result = placeSessionInRuntimeGroup(manager, {
      creatorSessionId: 'creator',
      newSessionId: 'child',
    });

    expect(result).toBeNull();
    expect(manager.groupForSession('child')).toBeNull();
  });

  it('places under project only when there is no creator context', () => {
    const result = placeSessionInRuntimeGroup(manager, { newSessionId: 'child' });
    expect(result).toBeNull();
  });

  it('forces project-only placement when runtimeGroupId is "none", ignoring inherit', () => {
    const group = manager.create('Feature X');
    manager.addSession(group.id, 'creator');

    const result = placeSessionInRuntimeGroup(manager, {
      runtimeGroupId: 'none',
      creatorSessionId: 'creator',
      newSessionId: 'child',
    });

    expect(result).toBeNull();
    expect(manager.groupForSession('child')).toBeNull();
  });

  it('joins an explicit group by id, overriding the creator group', () => {
    const inherited = manager.create('Inherited');
    manager.addSession(inherited.id, 'creator');
    const target = manager.create('Target');

    const result = placeSessionInRuntimeGroup(manager, {
      runtimeGroupId: target.id,
      creatorSessionId: 'creator',
      newSessionId: 'child',
    });

    expect(result).toEqual({ runtimeGroupId: target.id, runtimeGroupName: 'Target' });
    expect(manager.groupForSession('child')?.id).toBe(target.id);
  });

  it('returns null for an unknown explicit group id and leaves the session project-only', () => {
    const result = placeSessionInRuntimeGroup(manager, {
      runtimeGroupId: 'does-not-exist',
      newSessionId: 'child',
    });

    expect(result).toBeNull();
    expect(manager.groupForSession('child')).toBeNull();
  });
});
