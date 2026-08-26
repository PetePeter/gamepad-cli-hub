/**
 * text-file-drop — decide whether a dropped/pasted/picked file is something the
 * user wants to READ, and turn it into artifact content.
 *
 * Identification is by FILE EXTENSION first: Chromium reports an empty
 * `blob.type` for .md and many source files, so the mime type is only a
 * fallback for the extensionless/unknown case. Anything not recognised here
 * stays on the binary-attachment path.
 */

export { TEXT_INLINE_MAX_BYTES, buildTextArtifact, isTextLikeFile } from '../../src/types/artifact-file.js';
export type { TextArtifactDraft } from '../../src/types/artifact-file.js';

/** Decode base64 file bytes as UTF-8 text (the file-picker path never sees a Blob). */
export function decodeBase64Text(contentBase64: string): string {
  const binary = atob(contentBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}
