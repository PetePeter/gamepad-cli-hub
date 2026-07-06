import { existsSync, statSync } from 'node:fs';
import type { ProjectStore } from '../../session/project-store.js';

/**
 * Project management for the MCP surface.
 * Delegates to ProjectStore for persistence and wraps results for MCP consumers.
 */
export class HelmProjectService {
  constructor(private readonly projectStore: ProjectStore) {}

  /**
   * Register a brand-new project (working directory) so it becomes a valid
   * target for plan/sequence/context creation. Validates that the directory
   * exists on disk and is not already registered.
   */
  createProject(dirPath: string, name?: string): { id: string; name: string; canonicalPath: string } {
    if (!existsSync(dirPath)) {
      throw new Error(`Directory does not exist: ${dirPath}`);
    }
    if (!statSync(dirPath).isDirectory()) {
      throw new Error(`Path is not a directory: ${dirPath}`);
    }
    const record = this.projectStore.createProject(dirPath, name);
    this.projectStore.save();
    return { id: record.id, name: record.name, canonicalPath: record.canonicalPath };
  }

  renameProject(projectId: string, name: string): { ok: true } {
    if (!this.projectStore.getById(projectId)) {
      throw new Error(`Project not found: ${projectId}`);
    }
    this.projectStore.rename(projectId, name);
    this.projectStore.save();
    return { ok: true };
  }

  deleteProject(projectId: string): { ok: true } {
    if (!this.projectStore.getById(projectId)) {
      throw new Error(`Project not found: ${projectId}`);
    }
    this.projectStore.delete(projectId);
    this.projectStore.save();
    return { ok: true };
  }

  listProjects() {
    return this.projectStore.list().map(r => ({
      id: r.id,
      name: r.name,
      canonicalPath: r.canonicalPath,
      directories: [r.canonicalPath],
    }));
  }

  listProjectDirs(projectId: string) {
    const record = this.projectStore.getById(projectId);
    if (!record) throw new Error(`Project not found: ${projectId}`);
    return [record.canonicalPath];
  }

  addProjectDir(projectId: string, dirPath: string): { ok: true } {
    this.projectStore.addDirectory(projectId, dirPath);
    this.projectStore.save();
    return { ok: true };
  }

  removeProjectDir(projectId: string, dirPath: string): { ok: true } {
    this.projectStore.removeDirectory(projectId, dirPath);
    this.projectStore.save();
    return { ok: true };
  }
}
