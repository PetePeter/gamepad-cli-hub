/**
 * Recycle-bin entry — a recoverable record of a closed session.
 *
 * Only sessions that carried a `cliSessionName` (the UUID used to resume the
 * CLI-internal session) are recoverable, so every entry always has one.
 */
export interface RecycleBinEntry {
  /** Stable id for this bin entry (UUID). Distinct from the original session id. */
  id: string;
  /** Original hub session id at close time (informational). */
  sessionId: string;
  /** Display name the session had when closed. */
  name: string;
  /** CLI type (e.g. 'claude-code'), used to re-spawn on restore. */
  cliType: string;
  /** Working directory the session ran in — also its recycle-bin group. */
  workingDir: string;
  /** CLI-internal resume UUID. Passed as resumeSessionName when restoring. */
  cliSessionName: string;
  /** Epoch ms the session was closed / added to the bin. */
  closedAt: number;
}
