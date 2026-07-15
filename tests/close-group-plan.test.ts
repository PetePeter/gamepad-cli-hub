/**
 * Tests for close-group-plan.ts — pure close-group sequencing.
 */

import { describe, it, expect } from 'vitest';
import { buildCloseGroupPlan } from '../renderer/close-group-plan';
import type { CloseGroupMember } from '../renderer/close-group-plan';

describe('buildCloseGroupPlan', () => {
  it('C1: keep — dissolves group, leaves sessions, does not mutate input', () => {
    const members: CloseGroupMember[] = [{ id: 'a' }, { id: 'b' }];
    const before = members.map(m => m.id);
    const plan = buildCloseGroupPlan('keep', members);
    expect(plan).toEqual({ closeSessionIds: [], closeGroup: true });
    // Input array unchanged (no mutation).
    expect(members.map(m => m.id)).toEqual(before);
  });

  it('C2: closeAll — closes every member first, then removes group', () => {
    const plan = buildCloseGroupPlan('closeAll', [{ id: 'a' }, { id: 'b' }]);
    expect(plan.closeSessionIds).toEqual(['a', 'b']);
    expect(plan.closeGroup).toBe(true);
  });

  it('C3: closeAll with no members — still removes the (empty) group', () => {
    const plan = buildCloseGroupPlan('closeAll', []);
    expect(plan).toEqual({ closeSessionIds: [], closeGroup: true });
  });
});
