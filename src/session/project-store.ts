import { randomUUID } from 'node:crypto';
import { loadProjectRecords, saveProjectRecords } from './persistence.js';
import { dirDisplayNameFromPath, normalizeProjectPath } from './project-identity.js';
import type { ProjectRecord } from '../types/project.js';

export class ProjectStore {
  private records: ProjectRecord[];
  private dirty = false;
  private cache = new Map<string, ProjectRecord>();

  constructor(private readonly projectsFile?: string) {
    this.records = loadProjectRecords(projectsFile);
  }

  list(): ProjectRecord[] {
    return [...this.records];
  }

  /**
   * Find or create a project for the given directory path.
   * Projects are keyed by their normalized canonical path — no git detection,
   * no worktree collapsing.
   */
  resolveForPath(dirPath: string): ProjectRecord {
    const normalized = normalizeProjectPath(dirPath);
    const cached = this.cache.get(normalized);
    if (cached) return cached;

    let record = this.records.find(
      (r) => normalizeProjectPath(r.canonicalPath) === normalized,
    );

    if (!record) {
      const now = Date.now();
      record = {
        id: randomUUID(),
        name: dirDisplayNameFromPath(dirPath),
        canonicalPath: normalized,
        createdAt: now,
        updatedAt: now,
      };
      this.records.push(record);
      this.dirty = true;
    }

    this.cache.set(normalized, record);
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

  /** Find a project whose canonical path or any alternate path matches the given directory. */
  findByPath(dirPath: string): ProjectRecord | undefined {
    const normalized = normalizeProjectPath(dirPath);
    return this.records.find(
      (r) =>
        normalizeProjectPath(r.canonicalPath) === normalized ||
        r.alternatePaths?.some((p) => normalizeProjectPath(p) === normalized),
    );
  }

  addDirectory(projectId: string, dirPath: string): void {
    const record = this.requireRecord(projectId);
    const normalized = normalizeProjectPath(dirPath);
    if (!record.alternatePaths) record.alternatePaths = [];
    if (!record.alternatePaths.includes(normalized)) {
      record.alternatePaths.push(normalized);
      record.updatedAt = Date.now();
      this.dirty = true;
    }
  }

  removeDirectory(projectId: string, dirPath: string): void {
    const record = this.requireRecord(projectId);
    const normalized = normalizeProjectPath(dirPath);
    const before = record.alternatePaths?.length ?? 0;
    record.alternatePaths = record.alternatePaths?.filter((p) => p !== normalized);
    if ((record.alternatePaths?.length ?? 0) < before) {
      record.updatedAt = Date.now();
      this.dirty = true;
    }
  }

  /** Promotes an alternate path to canonical; the old canonical becomes an alternate. */
  setMainDirectory(projectId: string, dirPath: string): void {
    const record = this.requireRecord(projectId);
    const normalized = normalizeProjectPath(dirPath);
    const altIdx = record.alternatePaths?.indexOf(normalized) ?? -1;
    if (altIdx < 0) throw new Error(`Path "${dirPath}" is not an alternate path of project ${projectId}`);
    const oldCanonical = record.canonicalPath;
    record.canonicalPath = normalized;
    record.alternatePaths!.splice(altIdx, 1);
    if (!record.alternatePaths!.includes(oldCanonical)) {
      record.alternatePaths!.push(oldCanonical);
    }
    this.cache.delete(oldCanonical);
    this.cache.delete(normalized);
    record.updatedAt = Date.now();
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
    this.dirty = true;
  }

  private requireRecord(id: string): ProjectRecord {
    const record = this.records.find((r) => r.id === id);
    if (!record) throw new Error(`Project not found: ${id}`);
    return record;
  }
}
