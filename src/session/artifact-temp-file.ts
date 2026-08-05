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
 * Name for a throwaway copy of an artifact version. The stamp keeps repeat opens
 * from colliding while an earlier copy is still held open by the external app.
 */
export function artifactTempFileName(title: string, kind: ArtifactKind, stamp: number): string {
  return `${ARTIFACT_TEMP_PREFIX}${sanitizeFilename(title)}-${stamp}.${artifactExtension(kind)}`;
}
