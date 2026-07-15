/**
 * Re-attach a restored session to its runtime group.
 *
 * WHY: a recycle-bin entry may carry the runtime group id + name the session had
 * when it was closed. This helper unifies the three restore cases behind a single
 * call:
 *   - restore-into-existing group (group still present),
 *   - restore-after-delete (group was closed → `ensureGroup` recreates it by id),
 *   - close-all (multiple restored sessions land back in the same recreated group).
 * When the entry has no group tag, restore is a plain ungrouped spawn (no-op).
 */

import type { RuntimeGroupManager } from './runtime-group-manager.js';

export function reattachRestoredSession(
  mgr: Pick<RuntimeGroupManager, 'ensureGroup' | 'addSession'>,
  entry: { runtimeGroupId?: string; runtimeGroupName?: string },
  newSessionId: string,
): void {
  if (!entry.runtimeGroupId) return;
  mgr.ensureGroup(entry.runtimeGroupId, entry.runtimeGroupName ?? 'Restored group');
  mgr.addSession(entry.runtimeGroupId, newSessionId);
}
