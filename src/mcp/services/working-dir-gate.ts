import { normalizeProjectPath } from '../../session/project-identity.js';
import type { ConfigLoader, WorkingDirectory } from '../../config/loader.js';
import type { ProjectStore } from '../../session/project-store.js';

/**
 * Resolve a configured working directory for dirPath.
 *
 * If the path is already registered, return it. If it is not registered but
 * corresponds to a known project (canonical or alternate path), self-heal by
 * registering it — this closes the window where a project exists but its
 * working-dir entry was never persisted (e.g. created by an older build before
 * the auto-register fix). Throws only when the path is genuinely unknown.
 */
export function resolveWorkingDirectory(
  configLoader: ConfigLoader,
  projectStore: ProjectStore | undefined,
  dirPath: string,
): WorkingDirectory {
  const normalized = normalizeProjectPath(dirPath);
  const found = configLoader
    .getWorkingDirectories()
    .find((entry) => normalizeProjectPath(entry.path) === normalized);
  if (found) return found;

  const project = projectStore?.findByPath(dirPath);
  if (project) {
    return configLoader.ensureWorkingDirectory(dirPath, project.name);
  }

  throw new Error(`Working directory is not configured in Helm: ${dirPath}`);
}
