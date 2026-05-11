import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ProjectStore } from '../src/session/project-store.js';

describe('ProjectStore', () => {
  let tmpDir: string;
  let projectsFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'helm-project-store-'));
    projectsFile = path.join(tmpDir, 'projects.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('consolidates many worktree roots under one project without storing subdirectory cwd as an alternate path', () => {
    const store = new ProjectStore((cwd, args) => {
      if (args.includes('--show-toplevel')) {
        if (cwd.includes('worktree-a')) return 'X:\\coding\\worktree-a';
        if (cwd.includes('worktree-b')) return 'X:\\coding\\worktree-b';
      }
      if (args.includes('--git-common-dir')) return 'X:\\coding\\repo\\.git';
      return null;
    }, projectsFile);

    const a = store.resolveForPath('X:\\coding\\worktree-a\\packages\\ui');
    const b = store.resolveForPath('X:\\coding\\worktree-b\\apps\\desktop');

    expect(a.id).toBe(b.id);
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0].alternatePaths).toEqual(['x:\\coding\\worktree-b']);
    expect(store.list()[0].canonicalPath).toBe('x:\\coding\\worktree-a');
  });
});
