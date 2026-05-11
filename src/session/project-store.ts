import { randomUUID } from 'node:crypto';
import { loadProjectRecords, saveProjectRecords } from './persistence.js';
import { dirDisplayNameFromPath, inspectProjectIdentity, normalizeProjectPath, type GitRunner } from './project-identity.js';
import type { ProjectIdentity, ProjectRecord } from '../types/project.js';

function chooseCanonicalPath(paths: string[]): string {
  return [...paths].sort((a, b) => a.length - b.length || a.localeCompare(b))[0];
}

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
  const nextCanonicalPath = chooseCanonicalPath([...pathSet]);
  const nextAlternatePaths = sortProjectPaths([...pathSet].filter((candidate) => candidate !== nextCanonicalPath));

  const changed =
    record.canonicalPath !== nextCanonicalPath
    || record.rootKind !== identity.rootKind
    || record.gitCommonDir !== identity.gitCommonDir
    || record.repoRootPath !== identity.repoRootPath
    || record.alternatePaths.length !== nextAlternatePaths.length
    || record.alternatePaths.some((candidate, index) => nextAlternatePaths[index] !== candidate);

  if (changed) {
    record.canonicalPath = nextCanonicalPath;
    record.alternatePaths = nextAlternatePaths;
    record.rootKind = identity.rootKind;
    record.gitCommonDir = identity.gitCommonDir;
    record.repoRootPath = identity.repoRootPath;
    record.name = dirDisplayNameFromPath(nextCanonicalPath);
    record.updatedAt = Date.now();
  }

  return changed;
}

export class ProjectStore {
  private records: ProjectRecord[];
  private dirty = false;

  constructor(private readonly runGit?: GitRunner, private readonly projectsFile?: string) {
    this.records = loadProjectRecords(projectsFile);
  }

  list(): ProjectRecord[] {
    return [...this.records];
  }

  resolveForPath(dirPath: string): ProjectRecord {
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
      return record;
    }

    if (mergeProjectPath(record, identity, observedProjectPath)) {
      this.dirty = true;
    }
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
}
