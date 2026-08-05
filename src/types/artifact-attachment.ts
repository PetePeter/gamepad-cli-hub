/**
 * Artifact attachment types — binary files stored alongside artifacts.
 *
 * When a user manually creates an artifact from a file (drag-drop, paste,
 * file picker), the file bytes are stored on disk under the config dir.
 * The artifact's markdown content references the stored file via a local
 * path that the existing helm-img:// protocol serves to the renderer.
 */

/** A binary file attached to an artifact. */
export interface ArtifactAttachment {
  /** Unique attachment identifier (UUID v4). */
  id: string;
  /** Parent artifact id. */
  artifactId: string;
  /** Sanitized original filename. */
  filename: string;
  /** MIME type hint from the source (not trusted for security decisions). */
  contentType?: string;
  /** File size in bytes. */
  sizeBytes: number;
  /** Relative path from the attachments root: {artifactId}/{uuid}{ext}. */
  relativePath: string;
  /** Epoch ms when the attachment was created. */
  createdAt: number;
}
