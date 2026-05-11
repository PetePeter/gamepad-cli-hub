export type ProjectRootKind = 'git' | 'path';

/** Stable persisted project identity that can own plans across many worktrees. */
export interface ProjectRecord {
  /** Unique identifier (UUID v4). */
  id: string;
  /** Stable merge key derived from repo identity or normalized path. */
  key: string;
  /** User-facing project label, typically the canonical path tail. */
  name: string;
  /** Deterministic canonical home for the project. */
  canonicalPath: string;
  /** Additional known paths that map to the same project. */
  alternatePaths: string[];
  /** Whether this project was identified from git metadata or raw path fallback. */
  rootKind: ProjectRootKind;
  /** Shared git common dir when this is a multi-worktree git project. */
  gitCommonDir?: string;
  /** Repo root path reported by git for the canonical path. */
  repoRootPath?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectIdentity {
  key: string;
  canonicalPathHint: string;
  rootKind: ProjectRootKind;
  gitCommonDir?: string;
  repoRootPath?: string;
}
