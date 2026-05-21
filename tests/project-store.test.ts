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

  it('returns same object reference on cache hit', () => {
    const store = new ProjectStore(projectsFile);
    const first = store.resolveForPath('X:\\coding\\repo');
    const second = store.resolveForPath('X:\\coding\\repo');
    expect(first).toBe(second);
  });

  it('creates distinct projects for distinct paths', () => {
    const store = new ProjectStore(projectsFile);
    const a = store.resolveForPath('X:\\coding\\alpha');
    const b = store.resolveForPath('X:\\coding\\beta');
    expect(a.id).not.toBe(b.id);
    expect(store.list()).toHaveLength(2);
  });

  it('normalizes path on lookup so case-variant paths resolve to the same project on Windows', () => {
    const store = new ProjectStore(projectsFile);
    const lower = store.resolveForPath('x:\\coding\\repo');
    const upper = store.resolveForPath('X:\\Coding\\Repo');
    expect(lower).toBe(upper);
    expect(store.list()).toHaveLength(1);
  });

  it('sets canonicalPath to the normalized input path', () => {
    const store = new ProjectStore(projectsFile);
    const record = store.resolveForPath('X:\\coding\\Repo\\');
    expect(record.canonicalPath).toBe('x:\\coding\\repo');
  });

  it('sets name to the trailing folder segment', () => {
    const store = new ProjectStore(projectsFile);
    const record = store.resolveForPath('X:\\coding\\my-project');
    expect(record.name).toBe('my-project');
  });

  describe('getById', () => {
    it('returns record by id', () => {
      const store = new ProjectStore(projectsFile);
      const record = store.resolveForPath('X:\\coding\\repo');
      expect(store.getById(record.id)).toBe(record);
    });

    it('returns undefined for unknown id', () => {
      const store = new ProjectStore(projectsFile);
      expect(store.getById('nonexistent')).toBeUndefined();
    });
  });

  describe('findByPath', () => {
    it('finds a record by canonical path without creating new projects', () => {
      const store = new ProjectStore(projectsFile);
      const record = store.resolveForPath('X:\\coding\\repo');
      expect(store.findByPath('X:\\coding\\repo')?.id).toBe(record.id);
      expect(store.findByPath('X:\\coding\\other')).toBeUndefined();
    });

    it('finds a record by alternate path', () => {
      const store = new ProjectStore(projectsFile);
      const record = store.resolveForPath('X:\\coding\\repo');
      store.addDirectory(record.id, 'X:\\coding\\worktree-b');
      expect(store.findByPath('X:\\coding\\worktree-b')?.id).toBe(record.id);
    });

    it('is case-insensitive for alternate paths', () => {
      const store = new ProjectStore(projectsFile);
      const record = store.resolveForPath('X:\\coding\\repo');
      store.addDirectory(record.id, 'X:\\coding\\Worktree-B');
      expect(store.findByPath('x:\\coding\\worktree-b')?.id).toBe(record.id);
    });
  });

  describe('addDirectory', () => {
    it('adds a path to alternatePaths', () => {
      const store = new ProjectStore(projectsFile);
      const record = store.resolveForPath('X:\\coding\\repo');
      store.addDirectory(record.id, 'X:\\coding\\worktree-b');
      expect(record.alternatePaths).toContain('x:\\coding\\worktree-b');
    });

    it('normalizes the path before adding', () => {
      const store = new ProjectStore(projectsFile);
      const record = store.resolveForPath('X:\\coding\\repo');
      store.addDirectory(record.id, 'X:\\Coding\\Worktree-B\\');
      expect(record.alternatePaths).toContain('x:\\coding\\worktree-b');
    });

    it('is idempotent — no duplicate entries', () => {
      const store = new ProjectStore(projectsFile);
      const record = store.resolveForPath('X:\\coding\\repo');
      store.addDirectory(record.id, 'X:\\coding\\worktree-b');
      store.addDirectory(record.id, 'X:\\coding\\worktree-b');
      expect(record.alternatePaths?.filter(p => p === 'x:\\coding\\worktree-b')).toHaveLength(1);
    });

    it('throws for unknown project id', () => {
      const store = new ProjectStore(projectsFile);
      expect(() => store.addDirectory('nonexistent', 'X:\\coding\\extra')).toThrow();
    });

    it('marks store dirty', () => {
      const store = new ProjectStore(projectsFile);
      const record = store.resolveForPath('X:\\coding\\repo');
      store.save();
      store.addDirectory(record.id, 'X:\\coding\\worktree-b');
      expect(store.isDirty()).toBe(true);
    });
  });

  describe('removeDirectory', () => {
    it('removes a path from alternatePaths', () => {
      const store = new ProjectStore(projectsFile);
      const record = store.resolveForPath('X:\\coding\\repo');
      store.addDirectory(record.id, 'X:\\coding\\worktree-b');
      store.removeDirectory(record.id, 'X:\\coding\\worktree-b');
      expect(record.alternatePaths).not.toContain('x:\\coding\\worktree-b');
    });

    it('is silent when path not present', () => {
      const store = new ProjectStore(projectsFile);
      const record = store.resolveForPath('X:\\coding\\repo');
      expect(() => store.removeDirectory(record.id, 'X:\\coding\\missing')).not.toThrow();
    });

    it('throws for unknown project id', () => {
      const store = new ProjectStore(projectsFile);
      expect(() => store.removeDirectory('nonexistent', 'X:\\coding\\extra')).toThrow();
    });

    it('marks store dirty', () => {
      const store = new ProjectStore(projectsFile);
      const record = store.resolveForPath('X:\\coding\\repo');
      store.addDirectory(record.id, 'X:\\coding\\worktree-b');
      store.save();
      store.removeDirectory(record.id, 'X:\\coding\\worktree-b');
      expect(store.isDirty()).toBe(true);
    });
  });

  describe('setMainDirectory', () => {
    it('swaps an alternate path into canonicalPath', () => {
      const store = new ProjectStore(projectsFile);
      const record = store.resolveForPath('X:\\coding\\repo');
      store.addDirectory(record.id, 'X:\\coding\\worktree-b');
      store.setMainDirectory(record.id, 'X:\\coding\\worktree-b');
      expect(record.canonicalPath).toBe('x:\\coding\\worktree-b');
    });

    it('old canonical becomes an alternate after swap', () => {
      const store = new ProjectStore(projectsFile);
      const record = store.resolveForPath('X:\\coding\\repo');
      store.addDirectory(record.id, 'X:\\coding\\worktree-b');
      store.setMainDirectory(record.id, 'X:\\coding\\worktree-b');
      expect(record.alternatePaths).toContain('x:\\coding\\repo');
    });

    it('throws if path is not an alternate', () => {
      const store = new ProjectStore(projectsFile);
      const record = store.resolveForPath('X:\\coding\\repo');
      expect(() => store.setMainDirectory(record.id, 'X:\\coding\\not-an-alt')).toThrow();
    });

    it('marks store dirty', () => {
      const store = new ProjectStore(projectsFile);
      const record = store.resolveForPath('X:\\coding\\repo');
      store.addDirectory(record.id, 'X:\\coding\\worktree-b');
      store.save();
      store.setMainDirectory(record.id, 'X:\\coding\\worktree-b');
      expect(store.isDirty()).toBe(true);
    });
  });

  describe('rename', () => {
    it('updates name and updatedAt', () => {
      const store = new ProjectStore(projectsFile);
      const record = store.resolveForPath('X:\\coding\\repo');
      const before = record.updatedAt;
      store.rename(record.id, 'My Project');
      expect(record.name).toBe('My Project');
      expect(record.updatedAt).toBeGreaterThanOrEqual(before);
    });

    it('marks store dirty', () => {
      const store = new ProjectStore(projectsFile);
      const record = store.resolveForPath('X:\\coding\\repo');
      store.save();
      store.rename(record.id, 'Renamed');
      expect(store.isDirty()).toBe(true);
    });

    it('throws for unknown id', () => {
      const store = new ProjectStore(projectsFile);
      expect(() => store.rename('nonexistent', 'X')).toThrow();
    });
  });

  describe('delete', () => {
    it('removes the project record', () => {
      const store = new ProjectStore(projectsFile);
      const record = store.resolveForPath('X:\\coding\\repo');
      store.delete(record.id);
      expect(store.list()).toHaveLength(0);
      expect(store.getById(record.id)).toBeUndefined();
    });

    it('clears cache so re-resolving the path creates a new project', () => {
      const store = new ProjectStore(projectsFile);
      const record = store.resolveForPath('X:\\coding\\repo');
      store.delete(record.id);
      const newRecord = store.resolveForPath('X:\\coding\\repo');
      expect(newRecord.id).not.toBe(record.id);
    });
  });

  describe('save / isDirty', () => {
    it('is dirty after resolveForPath creates a new record', () => {
      const store = new ProjectStore(projectsFile);
      store.resolveForPath('X:\\coding\\repo');
      expect(store.isDirty()).toBe(true);
    });

    it('is not dirty after save', () => {
      const store = new ProjectStore(projectsFile);
      store.resolveForPath('X:\\coding\\repo');
      store.save();
      expect(store.isDirty()).toBe(false);
    });

    it('persists records to disk and reloads them', () => {
      const store = new ProjectStore(projectsFile);
      const record = store.resolveForPath('X:\\coding\\repo');
      store.save();

      const store2 = new ProjectStore(projectsFile);
      expect(store2.getById(record.id)?.canonicalPath).toBe(record.canonicalPath);
    });

    it('persists alternatePaths through save and reload', () => {
      const store = new ProjectStore(projectsFile);
      const record = store.resolveForPath('X:\\coding\\repo');
      store.addDirectory(record.id, 'X:\\coding\\worktree-b');
      store.save();

      const store2 = new ProjectStore(projectsFile);
      expect(store2.getById(record.id)?.alternatePaths).toContain('x:\\coding\\worktree-b');
    });
  });
});
