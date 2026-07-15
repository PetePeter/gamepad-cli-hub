/**
 * Close-group planning — pure sequencing for tearing down a runtime group.
 *
 * No Vue / IPC imports: this decides the ORDER of operations only, so it can be
 * unit-tested in isolation and reused by the caller that performs the effects.
 *
 * Ordering rationale (the whole reason this is its own module):
 *   To preserve each closed session's runtime-group tag in the recycle bin, the
 *   sessions MUST be closed WHILE they are still members of the group. Main's
 *   `session:removed` listener reads `groupForSession` at close time to stamp the
 *   recycle-bin entry with runtimeGroupId/runtimeGroupName. If we removed the
 *   group first, that lookup would return nothing and the tag would be lost.
 *   Therefore: close sessions FIRST (closeSessionIds), THEN remove the group.
 */

export interface CloseGroupMember {
  id: string;
}

/**
 * 'keep'     — dissolve the group but leave sessions running (they revert to
 *              directory grouping).
 * 'closeAll' — close every member session (each may land in the recycle bin,
 *              tagged with the group), then remove the group.
 */
export type CloseGroupMode = 'keep' | 'closeAll';

export interface CloseGroupPlan {
  /** Session ids to close FIRST — each may go to the recycle bin, tagged. */
  closeSessionIds: string[];
  /** Whether to remove the group afterwards. */
  closeGroup: boolean;
}

/**
 * Build the ordered plan for closing a runtime group.
 *
 * Pure: returns a NEW array and never mutates `members`.
 */
export function buildCloseGroupPlan(mode: CloseGroupMode, members: CloseGroupMember[]): CloseGroupPlan {
  if (mode === 'closeAll') {
    return { closeSessionIds: members.map(m => m.id), closeGroup: true };
  }
  // 'keep' — sessions untouched; only the group is dissolved.
  return { closeSessionIds: [], closeGroup: true };
}
