import { normalizeProjectPath } from './project-identity.js';
import type { ProjectStore } from './project-store.js';
import type { ConfigLoader } from '../config/loader.js';

/**
 * Ensure every project's canonical and alternate paths are registered as Helm
 * working directories. Runs once on startup to heal projects that were created
 * before working-dir auto-registration existed (and any later drift).
 *
 * Idempotent: already-registered paths (normalized) are skipped. Returns the
 * number of newly-registered directories.
 */
export function reconcileProjectWorkingDirectories(
  projectStore: ProjectStore,
  configLoader: ConfigLoader,
): number {
  const registered = new Set(
    configLoader.getWorkingDirectories().map((d) => normalizeProjectPath(d.path)),
  );
  let added = 0;
  for (const project of projectStore.list()) {
    const paths = [project.canonicalPath, ...(project.alternatePaths ?? [])];
    for (const dirPath of paths) {
      const key = normalizeProjectPath(dirPath);
      if (registered.has(key)) continue;
      configLoader.ensureWorkingDirectory(dirPath, project.name);
      registered.add(key);
      added++;
    }
  }
  return added;
}
