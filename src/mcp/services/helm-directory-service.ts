import type { ConfigLoader } from '../../config/loader.js';
import type { PlanManager } from '../../session/plan-manager.js';
import type { SessionManager } from '../../session/manager.js';
import type { DirectorySummary, CliSummary } from '../helm-control-service.js';
import type { ProjectStore } from '../../session/project-store.js';

/**
 * Directory and CLI type listing for the MCP surface.
 */
export class HelmDirectoryService {
  constructor(
    private readonly configLoader: ConfigLoader,
    private readonly sessionManager: SessionManager,
    private readonly planManager: PlanManager,
    private readonly projectStore?: ProjectStore,
  ) {}

  listDirectories(): DirectorySummary[] {
    const configured = this.configLoader.getWorkingDirectories();
    const sessions = this.sessionManager.getAllSessions();
    const consolidated = new Map<string, DirectorySummary>();

    for (const entry of configured) {
      const project = this.projectStore?.resolveForPath(entry.path);
      const dirPath = project?.canonicalPath ?? entry.path;
      const existing = consolidated.get(dirPath);
      const projectId = project?.id;
      const planCount = this.planManager.getForDirectory(dirPath).length;
      const sessionCount = sessions.filter((session) => {
        if (session.projectPath) return session.projectPath === dirPath;
        return session.workingDir === entry.path;
      }).length;
      const source = new Set<Array<'config' | 'plans' | 'sessions'>[number]>(existing?.source ?? []);
      source.add('config');
      if (planCount > 0) source.add('plans');
      if (sessionCount > 0) source.add('sessions');
      consolidated.set(dirPath, {
        dirPath,
        ...(projectId ? { projectId } : {}),
        name: existing?.name ?? entry.name,
        source: [...source],
        planCount: Math.max(existing?.planCount ?? 0, planCount),
        sessionCount: Math.max(existing?.sessionCount ?? 0, sessionCount),
      });
    }

    return [...consolidated.values()]
      .sort((a, b) => a.dirPath.localeCompare(b.dirPath));
  }

  listClis(): CliSummary[] {
    const supportedDirPaths = this.configLoader.getWorkingDirectories().map((entry) => entry.path);
    return this.configLoader.getCliTypes().map((cliType) => {
      const entry = this.requireCliEntry(cliType);
      return {
        cliType,
        name: entry.name,
        command: entry.spawnCommand ?? '',
        supportsResume: Boolean(entry.spawnCommand || entry.resumeCommand || entry.continueCommand),
        supportedDirPaths,
      };
    });
  }

  private requireCliEntry(cliType: string) {
    const entry = this.configLoader.getCliTypeEntry(cliType);
    if (!entry) {
      throw new Error(`Unknown CLI type: ${cliType}`);
    }
    return entry;
  }
}
