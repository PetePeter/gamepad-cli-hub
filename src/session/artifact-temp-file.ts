/**
 * Filename helpers for materialising an artifact to a file.
 *
 * Kept free of Electron and node:fs imports so both the export and the
 * open-externally paths can share them, and so they stay testable in isolation.
 */

import type { ArtifactKind } from '../types/artifact.js';

/** Prefix that marks a temp file as ours, so startup cleanup can reap it. */
export const ARTIFACT_TEMP_PREFIX = 'helm-artifact-';

/** Reduce a title to a safe file stem (no path separators or reserved chars). */
export function sanitizeFilename(title: string): string {
  const cleaned = title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
  return cleaned.length > 0 ? cleaned.slice(0, 120) : 'artifact';
}

/** The on-disk extension for an artifact kind. */
export function artifactExtension(kind: ArtifactKind): string {
  return kind === 'html' ? 'html' : 'md';
}

/**
 * Separator between the session id and the title. A double hyphen, because both
 * a UUID session id and a sanitized title may contain single hyphens — the id
 * segment is normalised so it can never contain `--`, keeping the first
 * occurrence an unambiguous boundary for anyone reading the temp dir.
 */
const SESSION_SEPARATOR = '--';

/** Reduce a session id to a filename-safe token that contains no `--`. */
function sanitizeSessionId(sessionId: string): string {
  const cleaned = sessionId.replace(/[^A-Za-z0-9-]/g, '_').replace(/-{2,}/g, '-');
  return cleaned.length > 0 ? cleaned.slice(0, 64) : 'unknown';
}

/**
 * Name for a throwaway copy of an artifact version. The stamp keeps repeat opens
 * from colliding while an earlier copy is still held open by the external app;
 * the session id makes the copy attributable, so closing a session can reap it.
 */
export function artifactTempFileName(
  sessionId: string,
  title: string,
  kind: ArtifactKind,
  stamp: number,
): string {
  const stem = `${sanitizeSessionId(sessionId)}${SESSION_SEPARATOR}${sanitizeFilename(title)}`;
  return `${ARTIFACT_TEMP_PREFIX}${stem}-${stamp}.${artifactExtension(kind)}`;
}
