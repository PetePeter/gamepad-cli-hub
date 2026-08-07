/**
 * Deleting temp files Helm wrote read-only.
 *
 * Artifact and plan exports are chmod'd 0o444 so an edit in the external app
 * cannot masquerade as the source of truth. On Windows that read-only bit makes
 * `unlink` fail with EPERM, which silently stranded those copies forever — so
 * every deletion path must clear it first. One helper, used by both the
 * per-session drain and the startup sweep.
 */

import { chmodSync, unlinkSync } from 'node:fs';
import { logger } from './logger.js';

/**
 * Best-effort delete of a temp file we own, clearing the read-only bit first.
 *
 * @returns true when the file is gone afterwards (deleted or already absent).
 */
export function forceDeleteTempFile(filePath: string): boolean {
  try { chmodSync(filePath, 0o666); } catch { /* may not exist, or already writable */ }
  try {
    unlinkSync(filePath);
    return true;
  } catch (err) {
    // ENOENT means the goal is already met; anything else is a real failure.
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return true;
    // The file survives — typically the external app still holds it open. Put
    // the read-only bit back, or the copy stays editable until the next sweep
    // and an edit there could masquerade as the source of truth.
    try { chmodSync(filePath, 0o444); } catch { /* best effort */ }
    logger.debug(`[TempFiles] Could not delete ${filePath}: ${err}`);
    return false;
  }
}
