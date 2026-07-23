/**
 * Artifact types — versioned renderable outputs (markdown / html) produced by a
 * session. An artifact accumulates versions over time; the newest version is the
 * live content, prior versions are retained for history.
 */

/** Renderable content kind for an artifact. */
export type ArtifactKind = 'markdown' | 'html';

/** A single immutable version of an artifact's content. */
export interface ArtifactVersion {
  /** 1-based version number, monotonically increasing within its artifact. */
  version: number;
  /** The content body for this version. */
  content: string;
  /** Epoch ms this version was created. */
  createdAt: number;
}

/** A versioned artifact owned by a session. */
export interface Artifact {
  /** Unique artifact identifier (UUID v4). */
  id: string;
  /** Owning session id. */
  sessionId: string;
  /** Display title — also the identity used to dedupe/append within a session. */
  title: string;
  /** Renderable content kind. */
  kind: ArtifactKind;
  /** Versions ordered oldest -> newest; version is 1-based. */
  versions: ArtifactVersion[];
  /** Epoch ms the artifact was first created. */
  createdAt: number;
  /** Epoch ms of the most recent mutation (new version). */
  updatedAt: number;
}
