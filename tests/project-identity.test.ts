import { describe, it, expect } from 'vitest';
import { inspectProjectIdentity, normalizeProjectPath } from '../src/session/project-identity.js';

describe('normalizeProjectPath', () => {
  it('normalizes path case and trailing slashes on Windows-style paths', () => {
    expect(normalizeProjectPath('X:\\Coding\\Repo\\')).toBe('x:\\coding\\repo');
  });
});

describe('inspectProjectIdentity', () => {
  it('uses git common-dir as the stable merge key for git worktrees', () => {
    const runGit = (cwd: string, args: string[]) => {
      if (args.includes('--show-toplevel')) return `${cwd}\\repo-root`;
      if (args.includes('--git-common-dir')) return 'X:\\coding\\repo\\.git';
      return null;
    };

    const identity = inspectProjectIdentity('X:\\coding\\repo-worktree-a', runGit);

    expect(identity.rootKind).toBe('git');
    expect(identity.key).toBe('git:x:\\coding\\repo\\.git');
    expect(identity.repoRootPath).toBe('x:\\coding\\repo-worktree-a\\repo-root');
  });

  it('falls back to normalized path identity outside git repos', () => {
    const identity = inspectProjectIdentity('X:\\coding\\standalone', () => null);

    expect(identity.rootKind).toBe('path');
    expect(identity.key).toBe('path:x:\\coding\\standalone');
    expect(identity.canonicalPathHint).toBe('x:\\coding\\standalone');
  });
});
