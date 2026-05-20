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

  it('caches resolveForPath result — second call skips git', () => {
    let gitCallCount = 0;
    const store = new ProjectStore((_cwd, _args) => {
      gitCallCount++;
      return 'X:\\coding\\repo';
    }, projectsFile);

    store.resolveForPath('X:\\coding\\repo');
    expect(gitCallCount).toBe(2); // --show-toplevel + --git-common-dir

    store.resolveForPath('X:\\coding\\repo');
    expect(gitCallCount).toBe(2); // no new git calls
  });

  it('caches different paths independently', () => {
    let gitCallCount = 0;
    const store = new ProjectStore((_cwd, _args) => {
      gitCallCount++;
      return null;
    }, projectsFile);

    store.resolveForPath('X:\\coding\\alpha');
    store.resolveForPath('X:\\coding\\beta');
    expect(gitCallCount).toBe(4); // 2 git calls × 2 paths
  });

  it('returns same object reference on cache hit', () => {
    const store = new ProjectStore(() => 'X:\\coding\\repo', projectsFile);
    const first = store.resolveForPath('X:\\coding\\repo');
    const second = store.resolveForPath('X:\\coding\\repo');
    expect(first).toBe(second);
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

  describe('getById', () => {
    it('returns record by id', () => {
      const store = new ProjectStore(() => 'X:\\coding\\repo', projectsFile);
      const record = store.resolveForPath('X:\\coding\\repo');
      expect(store.getById(record.id)).toBe(record);
    });

    it('returns undefined for unknown id', () => {
      const store = new ProjectStore(() => null, projectsFile);
      expect(store.getById('nonexistent')).toBeUndefined();
    });
  });

  describe('findByPath', () => {
    it('finds records by canonical or alternate path without creating projects', () => {
      const store = new ProjectStore(() => 'X:\\coding\\repo', projectsFile);
      const record = store.resolveForPath('X:\\coding\\repo');
      store.addDirectory(record.id, 'X:\\coding\\worktree-b');

      expect(store.findByPath('X:\\coding\\repo')?.id).toBe(record.id);
      expect(store.findByPath('X:\\coding\\worktree-b')?.id).toBe(record.id);
      expect(store.findByPath('X:\\coding\\other')).toBeUndefined();
    });
  });

  describe('addDirectory', () => {
    it('adds a path to alternatePaths', () => {
      const store = new ProjectStore(() => 'X:\\coding\\repo', projectsFile);
      const record = store.resolveForPath('X:\\coding\\repo');
      store.addDirectory(record.id, 'X:\\coding\\worktree-b');
      expect(record.alternatePaths).toContain('x:\\coding\\worktree-b');
    });

    it('skips if path already present', () => {
      const store = new ProjectStore(() => 'X:\\coding\\repo', projectsFile);
      const record = store.resolveForPath('X:\\coding\\repo');
      store.addDirectory(record.id, 'X:\\coding\\worktree-b');
      store.addDirectory(record.id, 'X:\\coding\\worktree-b');
      expect(record.alternatePaths.filter(p => p === 'x:\\coding\\worktree-b')).toHaveLength(1);
    });

    it('throws for unknown project id', () => {
      const store = new ProjectStore(() => null, projectsFile);
      expect(() => store.addDirectory('nonexistent', 'X:\\coding\\foo')).toThrow();
    });

    it('throws if path is the canonicalPath', () => {
      const store = new ProjectStore(() => 'X:\\coding\\repo', projectsFile);
      const record = store.resolveForPath('X:\\coding\\repo');
      expect(() => store.addDirectory(record.id, 'X:\\coding\\repo')).toThrow();
    });
  });

  describe('removeDirectory', () => {
    it('removes a path from alternatePaths', () => {
      const store = new ProjectStore(() => 'X:\\coding\\repo', projectsFile);
      const record = store.resolveForPath('X:\\coding\\repo');
      store.addDirectory(record.id, 'X:\\coding\\worktree-b');
      store.removeDirectory(record.id, 'X:\\coding\\worktree-b');
      expect(record.alternatePaths).not.toContain('x:\\coding\\worktree-b');
    });

    it('throws if path is the canonicalPath', () => {
      const store = new ProjectStore(() => 'X:\\coding\\repo', projectsFile);
      const record = store.resolveForPath('X:\\coding\\repo');
      expect(() => store.removeDirectory(record.id, 'X:\\coding\\repo')).toThrow();
    });

    it('is no-op if path not present', () => {
      const store = new ProjectStore(() => 'X:\\coding\\repo', projectsFile);
      const record = store.resolveForPath('X:\\coding\\repo');
      store.removeDirectory(record.id, 'X:\\coding\\nonexistent');
      expect(record.alternatePaths).toHaveLength(0);
    });
  });

  describe('setMainDirectory', () => {
    it('promotes an alternate path to canonical and demotes the old canonical path', () => {
      const store = new ProjectStore(() => 'X:\\coding\\repo', projectsFile);
      const record = store.resolveForPath('X:\\coding\\repo');
      store.addDirectory(record.id, 'X:\\coding\\worktree-b');

      store.setMainDirectory(record.id, 'X:\\coding\\worktree-b');

      expect(record.canonicalPath).toBe('x:\\coding\\worktree-b');
      expect(record.alternatePaths).toEqual(['x:\\coding\\repo']);
      expect(store.findByPath('X:\\coding\\repo')?.id).toBe(record.id);
      expect(store.findByPath('X:\\coding\\worktree-b')?.id).toBe(record.id);
    });

    it('keeps the user-selected main directory during later project merges', () => {
      const store = new ProjectStore((cwd, args) => {
        if (args.includes('--show-toplevel')) return cwd.includes('worktree-b') ? 'X:\\coding\\worktree-b' : 'X:\\coding\\repo';
        if (args.includes('--git-common-dir')) return 'X:\\coding\\repo\\.git';
        return null;
      }, projectsFile);
      const record = store.resolveForPath('X:\\coding\\repo');
      store.resolveForPath('X:\\coding\\worktree-b');
      store.setMainDirectory(record.id, 'X:\\coding\\worktree-b');

      store.resolveForPath('X:\\coding\\repo\\packages\\ui');

      expect(record.canonicalPath).toBe('x:\\coding\\worktree-b');
      expect(record.alternatePaths).toContain('x:\\coding\\repo');
    });

    it('throws if the path is not already part of the project', () => {
      const store = new ProjectStore(() => 'X:\\coding\\repo', projectsFile);
      const record = store.resolveForPath('X:\\coding\\repo');

      expect(() => store.setMainDirectory(record.id, 'X:\\coding\\other')).toThrow('Main directory must already belong to the project');
    });

    it('is a no-op when the selected path is already canonical', () => {
      const store = new ProjectStore(() => 'X:\\coding\\repo', projectsFile);
      const record = store.resolveForPath('X:\\coding\\repo');
      store.save();

      store.setMainDirectory(record.id, 'X:\\coding\\repo');

      expect(record.canonicalPath).toBe('x:\\coding\\repo');
      expect(store.isDirty()).toBe(false);
    });
  });

  describe('rename', () => {
    it('updates name and updatedAt', () => {
      const store = new ProjectStore(() => 'X:\\coding\\repo', projectsFile);
      const record = store.resolveForPath('X:\\coding\\repo');
      const before = record.updatedAt;
      store.rename(record.id, 'My Project');
      expect(record.name).toBe('My Project');
      expect(record.updatedAt).toBeGreaterThanOrEqual(before);
    });

    it('marks store dirty', () => {
      const store = new ProjectStore(() => 'X:\\coding\\repo', projectsFile);
      const record = store.resolveForPath('X:\\coding\\repo');
      store.save();
      store.rename(record.id, 'Renamed');
      expect(store.isDirty()).toBe(true);
    });

    it('throws for unknown id', () => {
      const store = new ProjectStore(() => null, projectsFile);
      expect(() => store.rename('nonexistent', 'X')).toThrow();
    });
  });

  describe('delete', () => {
    it('removes the project record', () => {
      const store = new ProjectStore(() => 'X:\\coding\\repo', projectsFile);
      const record = store.resolveForPath('X:\\coding\\repo');
      store.delete(record.id);
      expect(store.list()).toHaveLength(0);
      expect(store.getById(record.id)).toBeUndefined();
    });

    it('clears cache for removed project paths', () => {
      const store = new ProjectStore(() => 'X:\\coding\\repo', projectsFile);
      const record = store.resolveForPath('X:\\coding\\repo');
      store.delete(record.id);
      // Re-resolve should create a new project
      const newRecord = store.resolveForPath('X:\\coding\\repo');
      expect(newRecord.id).not.toBe(record.id);
    });
  });
});
