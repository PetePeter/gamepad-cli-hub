/** A project is simply a folder identified by its canonical path. */
export interface ProjectRecord {
  /** Unique identifier (UUID v4). */
  id: string;
  /** User-facing project label, typically the folder tail name. */
  name: string;
  /** Normalized canonical folder path for this project. */
  canonicalPath: string;
  createdAt: number;
  updatedAt: number;
}
