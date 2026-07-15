/**
 * Runtime-group drag-and-drop verdicts — pure decision logic.
 *
 * No Vue / DOM: given a dragged session and a drop target, decide whether the
 * drop is valid and what mutation it performs. Mirrors the interactive mockup's
 * dropVerdict so the UI and its unit tests share one source of truth.
 *
 * Drop rules:
 *  - onto a RUNTIME group header → move the session in (auto-evicts from any
 *    prior group). No-op (rejected) when it is already in that group.
 *  - onto the session's OWN directory header → remove it from its runtime group.
 *    Rejected when it is not currently in a runtime group.
 *  - onto a DIFFERENT directory header → rejected (can't relocate a session's
 *    working directory by dragging).
 */

export type DropAction = 'add-to-group' | 'remove-from-group';

export interface DropTarget {
  kind: 'runtime' | 'directory';
  /** Runtime group id (kind === 'runtime') or directory path (kind === 'directory'). */
  id: string;
}

export interface DropVerdict {
  /** Whether the drop is allowed. */
  ok: boolean;
  /** Human-readable reason / tooltip. */
  msg: string;
  /** The mutation to perform when ok (absent when rejected). */
  action?: DropAction;
}

/**
 * Decide the outcome of dropping session `sessionId` onto `target`.
 *
 * @param target           The drop target (runtime group header or directory header).
 * @param sessionId        The dragged session id.
 * @param sessionDir       The dragged session's working directory.
 * @param sessionGroupId   The runtime group id the session currently belongs to (null when ungrouped).
 * @param targetGroupName  Display name of the target runtime group (for the message).
 * @param targetDirName    Display name of the target directory (for the message).
 */
export function dropVerdict(
  target: DropTarget,
  sessionId: string,
  sessionDir: string,
  sessionGroupId: string | null,
  targetGroupName = '',
  targetDirName = '',
): DropVerdict {
  if (target.kind === 'runtime') {
    if (sessionGroupId === target.id) {
      return { ok: false, msg: 'Already in this group' };
    }
    return { ok: true, msg: `Move to ${targetGroupName}`, action: 'add-to-group' };
  }

  // Directory target — only the session's OWN folder is a valid drop.
  if (pathsEqual(target.id, sessionDir)) {
    if (!sessionGroupId) return { ok: false, msg: 'Already in its folder' };
    return { ok: true, msg: `Return to ${targetDirName}`, action: 'remove-from-group' };
  }
  return { ok: false, msg: "Can't move a session to a different folder" };
}

/** Case-insensitive path equality (Windows-friendly), tolerant of trailing slashes. */
function pathsEqual(a: string, b: string): boolean {
  const norm = (p: string): string => p.replace(/[\\/]+$/, '').toLowerCase();
  return norm(a) === norm(b);
}
