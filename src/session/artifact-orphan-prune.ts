/**
 * pruneOrphanArtifacts — startup reclamation of artifacts with no owner.
 *
 * Artifacts are persisted keyed by session id. Normally the session:removed
 * listener clears them on an ephemeral close and keeps them for a recoverable
 * (binned) close. A crash bypasses that listener, so on startup some stored keys
 * may belong to no live session and no recycle-bin entry — those are true
 * orphans and are cleared. Anything still referenced by a live session OR a bin
 * entry (a recoverable session awaiting restore) is retained.
 *
 * Pure and side-effect-only through the injected `clear` callback so it is
 * trivially testable.
 *
 * @returns the session ids that were pruned.
 */
export function pruneOrphanArtifacts(
  storedSessionIds: Iterable<string>,
  liveSessionIds: Set<string>,
  retainedSessionIds: Set<string>,
  clear: (sessionId: string) => void,
): string[] {
  const pruned: string[] = [];
  for (const sessionId of storedSessionIds) {
    if (!liveSessionIds.has(sessionId) && !retainedSessionIds.has(sessionId)) {
      clear(sessionId);
      pruned.push(sessionId);
    }
  }
  return pruned;
}
