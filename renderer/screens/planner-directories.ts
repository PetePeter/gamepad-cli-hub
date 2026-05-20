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
