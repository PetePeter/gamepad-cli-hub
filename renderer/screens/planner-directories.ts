export interface ProjectDirectoryItem {
  name: string;
  path: string;
  projectId?: string;
  projectName?: string;
  isCanonical?: boolean;
}

export interface PlannerDirectoryItem {
  name: string;
  path: string;
  projectId?: string;
}

export interface PlannerProject {
  id: string;
  name: string;
  canonicalPath: string;
  alternatePaths?: readonly string[];
}

function directoryKey(path: string): string {
  const trimmed = path.trim().replace(/[\\/]+$/, '');
  // Project paths are absolute and Windows paths are case-insensitive. Keep
  // this helper pure so planner-directory tests do not need renderer globals.
  return /^[A-Za-z]:[\\/]/.test(trimmed) ? trimmed.toLowerCase() : trimmed;
}

/**
 * Build the planner's complete source set from the project registry and the
 * configured working-directory list. Registered projects are authoritative;
 * configured paths without a project remain standalone entries until they are
 * registered.
 */
export function buildPlannerDirectorySource(
  configuredDirectories: ProjectDirectoryItem[],
  projects: readonly PlannerProject[],
): ProjectDirectoryItem[] {
  const projectPaths = new Map<string, PlannerProject>();
  const source: ProjectDirectoryItem[] = [];

  for (const project of projects) {
    const projectName = project.name || project.canonicalPath;
    source.push({
      name: projectName,
      path: project.canonicalPath,
      projectId: project.id,
      projectName,
      isCanonical: true,
    });
    projectPaths.set(directoryKey(project.canonicalPath), project);

    for (const alternatePath of project.alternatePaths ?? []) {
      source.push({
        name: projectName,
        path: alternatePath,
        projectId: project.id,
        projectName,
      });
      projectPaths.set(directoryKey(alternatePath), project);
    }
  }

  for (const directory of configuredDirectories) {
    // Project paths have already been added above with their project metadata.
    // Only add genuinely standalone configured folders here.
    if (!projectPaths.has(directoryKey(directory.path))) source.push(directory);
  }

  return source;
}

export function buildPlannerDirectories(directories: ProjectDirectoryItem[]): PlannerDirectoryItem[] {
  const byKey = new Map<string, PlannerDirectoryItem & { isCanonical?: boolean }>();

  for (const dir of directories) {
    const key = dir.projectId ?? dir.path;
    const name = dir.projectName || dir.name;
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, {
        name,
        path: dir.path,
        ...(dir.projectId ? { projectId: dir.projectId } : {}),
        ...(dir.isCanonical ? { isCanonical: true } : {}),
      });
      continue;
    }

    existing.name = name;
    if (dir.isCanonical && !existing.isCanonical) {
      existing.path = dir.path;
      existing.isCanonical = true;
    }
  }

  return [...byKey.values()].map(({ isCanonical: _isCanonical, ...dir }) => dir);
}
