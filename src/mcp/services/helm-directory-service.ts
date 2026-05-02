import type { ConfigLoader } from '../../config/loader.js';
import type { PlanManager } from '../../session/plan-manager.js';
import type { SessionManager } from '../../session/manager.js';
import type { DirectorySummary, CliSummary } from '../helm-control-service.js';

/**
 * Directory and CLI type listing for the MCP surface.
 */
export class HelmDirectoryService {
  constructor(
    private readonly configLoader: ConfigLoader,
    private readonly sessionManager: SessionManager,
    private readonly planManager: PlanManager,
  ) {}

  listDirectories(): DirectorySummary[] {
    const configured = this.configLoader.getWorkingDirectories();
    const sessions = this.sessionManager.getAllSessions();
    return configured
      .map((entry) => {
        const source: Array<'config' | 'plans' | 'sessions'> = ['config'];
        if (this.planManager.getForDirectory(entry.path).length > 0) source.push('plans');
        if (sessions.some((session) => session.workingDir === entry.path)) source.push('sessions');
        return {
          dirPath: entry.path,
          name: entry.name,
          source,
          planCount: this.planManager.getForDirectory(entry.path).length,
          sessionCount: sessions.filter((session) => session.workingDir === entry.path).length,
        };
      })
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
