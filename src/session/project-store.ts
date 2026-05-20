import { randomUUID } from 'node:crypto';
import { loadProjectRecords, saveProjectRecords } from './persistence.js';
import { dirDisplayNameFromPath, inspectProjectIdentity, normalizeProjectPath, type GitRunner } from './project-identity.js';
import type { ProjectIdentity, ProjectRecord } from '../types/project.js';

function sortProjectPaths(paths: string[]): string[] {
  return [...paths].sort((a, b) => a.length - b.length || a.localeCompare(b));
}

function findProjectByPath(records: ProjectRecord[], normalizedPath: string): ProjectRecord | undefined {
  return records.find((record) =>
    normalizeProjectPath(record.canonicalPath) === normalizedPath
    || record.alternatePaths.some((candidate) => normalizeProjectPath(candidate) === normalizedPath));
}

function mergeProjectPath(record: ProjectRecord, identity: ProjectIdentity, normalizedPath: string): boolean {
  const pathSet = new Set<string>([
    normalizeProjectPath(record.canonicalPath),
    ...record.alternatePaths.map(normalizeProjectPath),
    normalizedPath,
    identity.canonicalPathHint,
  ]);
  const canonicalPath = normalizeProjectPath(record.canonicalPath);
  const nextAlternatePaths = sortProjectPaths([...pathSet].filter((candidate) => candidate !== canonicalPath));

  const changed =
    record.canonicalPath !== canonicalPath
    || record.rootKind !== identity.rootKind
    || record.gitCommonDir !== identity.gitCommonDir
    || record.repoRootPath !== identity.repoRootPath
    || record.alternatePaths.length !== nextAlternatePaths.length
    || record.alternatePaths.some((candidate, index) => nextAlternatePaths[index] !== candidate);

  if (changed) {
    record.canonicalPath = canonicalPath;
    record.alternatePaths = nextAlternatePaths;
    record.rootKind = identity.rootKind;
    record.gitCommonDir = identity.gitCommonDir;
    record.repoRootPath = identity.repoRootPath;
    record.updatedAt = Date.now();
  }

  return changed;
}

export class ProjectStore {
  private records: ProjectRecord[];
  private dirty = false;
  private cache = new Map<string, ProjectRecord>();

  constructor(private readonly runGit?: GitRunner, private readonly projectsFile?: string) {
    this.records = loadProjectRecords(projectsFile);
  }

  list(): ProjectRecord[] {
    return [...this.records];
  }

  resolveForPath(dirPath: string): ProjectRecord {
    const cacheKey = normalizeProjectPath(dirPath);
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const identity = inspectProjectIdentity(dirPath, this.runGit);
    const observedProjectPath = identity.repoRootPath ?? normalizeProjectPath(dirPath);

    let record = this.records.find((candidate) => candidate.key === identity.key)
      ?? findProjectByPath(this.records, observedProjectPath);

    if (!record) {
      const now = Date.now();
      record = {
        id: randomUUID(),
        key: identity.key,
        name: dirDisplayNameFromPath(identity.canonicalPathHint),
        canonicalPath: identity.canonicalPathHint,
        alternatePaths: observedProjectPath === identity.canonicalPathHint ? [] : [observedProjectPath],
        rootKind: identity.rootKind,
        gitCommonDir: identity.gitCommonDir,
        repoRootPath: identity.repoRootPath,
        createdAt: now,
        updatedAt: now,
      };
      this.records.push(record);
      this.dirty = true;
      this.cache.set(cacheKey, record);
      return record;
    }

    if (mergeProjectPath(record, identity, observedProjectPath)) {
      this.dirty = true;
    }
    this.cache.set(cacheKey, record);
    return record;
  }

  save(): void {
    if (!this.dirty) return;
    saveProjectRecords(this.records, this.projectsFile);
    this.dirty = false;
  }

  isDirty(): boolean {
    return this.dirty;
  }

  getById(id: string): ProjectRecord | undefined {
    return this.records.find((r) => r.id === id);
  }

  findByPath(dirPath: string): ProjectRecord | undefined {
    return findProjectByPath(this.records, normalizeProjectPath(dirPath));
  }

  addDirectory(projectId: string, dirPath: string): void {
    const record = this.requireRecord(projectId);
    const normalized = normalizeProjectPath(dirPath);
    if (normalized === normalizeProjectPath(record.canonicalPath)) {
      throw new Error('Cannot add canonical path as an alternate directory');
    }
    if (record.alternatePaths.some((p) => normalizeProjectPath(p) === normalized)) return;
    record.alternatePaths = sortProjectPaths([...record.alternatePaths, normalized]);
    record.updatedAt = Date.now();
    this.cache.set(normalized, record);
    this.dirty = true;
  }

  removeDirectory(projectId: string, dirPath: string): void {
    const record = this.requireRecord(projectId);
    const normalized = normalizeProjectPath(dirPath);
    if (normalized === normalizeProjectPath(record.canonicalPath)) {
      throw new Error('Cannot remove the canonical path');
    }
    const before = record.alternatePaths.length;
    record.alternatePaths = record.alternatePaths.filter((p) => normalizeProjectPath(p) !== normalized);
    if (record.alternatePaths.length === before) return;
    record.updatedAt = Date.now();
    this.cache.delete(normalized);
    this.dirty = true;
  }

  setMainDirectory(projectId: string, dirPath: string): void {
    const record = this.requireRecord(projectId);
    const normalized = normalizeProjectPath(dirPath);
    const canonicalPath = normalizeProjectPath(record.canonicalPath);
    if (normalized === canonicalPath) return;

    const alternatePaths = record.alternatePaths.map(normalizeProjectPath);
    if (!alternatePaths.includes(normalized)) {
      throw new Error('Main directory must already belong to the project');
    }

    record.canonicalPath = normalized;
    record.alternatePaths = sortProjectPaths([
      canonicalPath,
      ...alternatePaths.filter((candidate) => candidate !== normalized),
    ]);
    record.updatedAt = Date.now();
    this.cache.set(normalized, record);
    this.cache.set(canonicalPath, record);
    this.dirty = true;
  }

  rename(projectId: string, name: string): void {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Project name cannot be empty');
    const record = this.requireRecord(projectId);
    record.name = trimmed;
    record.updatedAt = Date.now();
    this.dirty = true;
  }

  delete(projectId: string): void {
    const idx = this.records.findIndex((r) => r.id === projectId);
    if (idx < 0) return;
    const record = this.records[idx];
    this.records.splice(idx, 1);
    this.cache.delete(normalizeProjectPath(record.canonicalPath));
    for (const alt of record.alternatePaths) this.cache.delete(normalizeProjectPath(alt));
    this.dirty = true;
  }

  private requireRecord(id: string): ProjectRecord {
    const record = this.records.find((r) => r.id === id);
    if (!record) throw new Error(`Project not found: ${id}`);
    return record;
  }
}
