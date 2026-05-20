import type { ProjectStore } from '../../session/project-store.js';

/**
 * Project management for the MCP surface.
 * Delegates to ProjectStore for persistence and wraps results for MCP consumers.
 */
export class HelmProjectService {
  constructor(private readonly projectStore: ProjectStore) {}

  listProjects() {
    return this.projectStore.list().map(r => ({
      id: r.id,
      name: r.name,
      canonicalPath: r.canonicalPath,
      directories: [r.canonicalPath, ...r.alternatePaths],
      rootKind: r.rootKind,
    }));
  }

  listProjectDirs(projectId: string) {
    const record = this.projectStore.getById(projectId);
    if (!record) throw new Error(`Project not found: ${projectId}`);
    return [record.canonicalPath, ...record.alternatePaths];
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
