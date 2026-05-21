/** A project is a folder identified by its canonical path, with optional alternate paths. */
export interface ProjectRecord {
  /** Unique identifier (UUID v4). */
  id: string;
  /** User-facing project label, typically the folder tail name. */
  name: string;
  /** Normalized canonical folder path for this project. */
  canonicalPath: string;
  /** Additional normalized paths associated with this project. */
  alternatePaths?: string[];
  createdAt: number;
  updatedAt: number;
}
