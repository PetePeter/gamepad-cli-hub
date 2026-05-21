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
  });

  describe('addDirectory / removeDirectory / setMainDirectory', () => {
    it('addDirectory is a no-op and does not throw', () => {
      const store = new ProjectStore(projectsFile);
      const record = store.resolveForPath('X:\\coding\\repo');
      expect(() => store.addDirectory(record.id, 'X:\\coding\\worktree-b')).not.toThrow();
    });

    it('removeDirectory is a no-op and does not throw', () => {
      const store = new ProjectStore(projectsFile);
      const record = store.resolveForPath('X:\\coding\\repo');
      expect(() => store.removeDirectory(record.id, 'X:\\coding\\worktree-b')).not.toThrow();
    });

    it('setMainDirectory is a no-op and does not throw', () => {
      const store = new ProjectStore(projectsFile);
      const record = store.resolveForPath('X:\\coding\\repo');
      expect(() => store.setMainDirectory(record.id, 'X:\\coding\\repo')).not.toThrow();
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
  });
});
