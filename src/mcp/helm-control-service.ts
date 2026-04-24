import { randomUUID } from 'node:crypto';
import { parseCliArgs, type ConfigLoader } from '../config/loader.js';
import type { PlanManager } from '../session/plan-manager.js';
import type { SessionManager } from '../session/manager.js';
import type { PtyManager } from '../session/pty-manager.js';
import type { PlanItem, PlanStatus } from '../types/plan.js';
import type { SessionInfo } from '../types/session.js';

export interface SessionSummary {
  id: string;
  name: string;
  cliType: string;
  workingDir?: string;
  state?: string;
  questionPending?: boolean;
  cliSessionName?: string;
  windowId?: number;
}

export interface DirectorySummary {
  dirPath: string;
  name?: string;
  source: Array<'config' | 'plans' | 'sessions'>;
  planCount: number;
  sessionCount: number;
}

export interface CliSummary {
  cliType: string;
  name: string;
  command: string;
  args?: string;
  supportsResume: boolean;
  supportedDirPaths: string[];
}

export class HelmControlService {
  constructor(
    private readonly planManager: PlanManager,
    private readonly sessionManager: SessionManager,
    private readonly ptyManager: PtyManager,
    private readonly configLoader: ConfigLoader,
  ) {}

  listPlans(dirPath: string): PlanItem[] {
    return this.planManager.getForDirectory(dirPath);
  }

  listClis(): CliSummary[] {
    const supportedDirPaths = this.configLoader.getWorkingDirectories().map((entry) => entry.path);
    return this.configLoader.getCliTypes().map((cliType) => {
      const entry = this.requireCliEntry(cliType);
      return {
        cliType,
        name: entry.name,
        command: entry.command,
        ...(entry.args ? { args: entry.args } : {}),
        supportsResume: Boolean(entry.spawnCommand || entry.resumeCommand || entry.continueCommand),
        supportedDirPaths,
      };
    });
  }

  getPlan(id: string): PlanItem | null {
    return this.planManager.getItem(id);
  }

  createPlan(dirPath: string, title: string, description: string): PlanItem {
    return this.planManager.create(dirPath, title, description);
  }

  updatePlan(id: string, updates: { title?: string; description?: string }): PlanItem | null {
    return this.planManager.update(id, updates);
  }

  deletePlan(id: string): boolean {
    return this.planManager.delete(id);
  }

  completePlan(id: string): PlanItem | null {
    return this.planManager.completeItem(id);
  }

  setPlanState(
    id: string,
    status: Exclude<PlanStatus, 'done'>,
    stateInfo?: string,
    sessionId?: string,
  ): PlanItem | null {
    return this.planManager.setState(id, status, stateInfo, sessionId);
  }

  linkPlans(fromId: string, toId: string): void {
    if (fromId === toId) {
      throw new Error('Cannot link a plan to itself');
    }
    const from = this.planManager.getItem(fromId);
    const to = this.planManager.getItem(toId);
    if (!from) {
      throw new Error(`Source plan not found: ${fromId}`);
    }
    if (!to) {
      throw new Error(`Target plan not found: ${toId}`);
    }
    if (from.dirPath !== to.dirPath) {
      throw new Error('Cannot link plans across different directories');
    }

    const exported = this.planManager.exportDirectory(from.dirPath);
    const existing = exported?.dependencies.some((d) => d.fromId === fromId && d.toId === toId);
    if (existing) {
      throw new Error('Link already exists between these plans');
    }

    // Check for cycle: adding fromId→toId would create a cycle if toId can already reach fromId
    const deps = exported?.dependencies ?? [];
    const visited = new Set<string>();
    const stack = [toId];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current === fromId) {
        throw new Error('Link would create a cycle (circular ordering is not allowed)');
      }
      if (visited.has(current)) continue;
      visited.add(current);
      for (const dep of deps) {
        if (dep.fromId === current) {
          stack.push(dep.toId);
        }
      }
    }

    const success = this.planManager.addDependency(fromId, toId);
    if (!success) {
      throw new Error('Failed to link plans');
    }
  }

  unlinkPlans(fromId: string, toId: string): void {
    const success = this.planManager.removeDependency(fromId, toId);
    if (!success) {
      throw new Error('Link not found between these plans');
    }
  }

  exportDirectory(dirPath: string): { dirPath: string; items: PlanItem[]; dependencies: { fromId: string; toId: string }[] } | null {
    return this.planManager.exportDirectory(dirPath);
  }

  exportItem(id: string): { item: PlanItem; dependencies: { fromId: string; toId: string }[] } | null {
    return this.planManager.exportItem(id);
  }

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

  listSessions(dirPath?: string): SessionSummary[] {
    return this.sessionManager
      .getAllSessions()
      .filter((session) => !dirPath || session.workingDir === dirPath)
      .map((session) => this.toSessionSummary(session));
  }

  getSession(sessionRef: string): SessionSummary | null {
    const session = this.findSession(sessionRef);
    return session ? this.toSessionSummary(session) : null;
  }

  spawnCli(cliType: string, dirPath: string, name: string, prompt?: string): SessionSummary {
    const workingDir = this.requireWorkingDirectory(dirPath);
    const cliEntry = this.requireCliEntry(cliType);
    const sessionId = randomUUID();
    const cliSessionName = randomUUID();
    const toolEnv = this.resolveToolEnv(cliType);
    let rawCommand: string | undefined;
    let command: string | undefined;
    let args: string[] | undefined;

    if (cliEntry.spawnCommand) {
      rawCommand = cliEntry.spawnCommand.replaceAll('{cliSessionName}', cliSessionName);
    } else {
      command = cliEntry.command || cliType;
      args = parseCliArgs(cliEntry.args);
    }

    const pty = this.ptyManager.spawn({
      sessionId,
      rawCommand,
      command,
      args,
      cwd: workingDir.path,
      ...(toolEnv ? { env: toolEnv } : {}),
    });

    this.sessionManager.addSession({
      id: sessionId,
      name: name.trim(),
      cliType,
      processId: pty.pid,
      workingDir: workingDir.path,
      cliSessionName,
    });

    if (prompt && prompt.trim()) {
      void this.ptyManager.deliverText(sessionId, prompt);
    }

    return this.toSessionSummary(requireResult(this.sessionManager.getSession(sessionId), `Session not found: ${sessionId}`));
  }

  async sendTextToSession(
    sessionRef: string,
    text: string,
    options?: { submit?: boolean; senderSessionId?: string; senderSessionName?: string },
  ): Promise<{ success: true; sessionId: string; name: string }> {
    const session = this.findSession(sessionRef);
    if (!session) {
      throw new Error(`Session not found: ${sessionRef}`);
    }
    if (!this.ptyManager.has(session.id)) {
      throw new Error(`Session PTY is not running: ${session.id}`);
    }

    let message = text;
    if (options?.senderSessionId || options?.senderSessionName) {
      const envelope = JSON.stringify({
        fromSessionId: options.senderSessionId ?? undefined,
        fromSessionName: options.senderSessionName ?? undefined,
      });
      message = `[HELM_MSG]${envelope}\n${text}`;
    }

    if (options?.submit !== false) {
      message += '\r';
    }

    await this.ptyManager.deliverText(session.id, message);
    return { success: true, sessionId: session.id, name: session.name };
  }

  private toSessionSummary(session: SessionInfo): SessionSummary {
    return {
      id: session.id,
      name: session.name,
      cliType: session.cliType,
      workingDir: session.workingDir,
      state: session.state,
      questionPending: session.questionPending,
      cliSessionName: session.cliSessionName,
      windowId: session.windowId,
    };
  }

  private findSession(sessionRef: string): SessionInfo | null {
    const byId = this.sessionManager.getSession(sessionRef);
    if (byId) return byId;
    const matches = this.sessionManager.getAllSessions().filter((session) => session.name === sessionRef);
    if (matches.length > 1) {
      throw new Error(`Multiple sessions found with name: ${sessionRef}. Use sessionId instead.`);
    }
    return matches[0] ?? null;
  }

  private requireCliEntry(cliType: string) {
    const entry = this.configLoader.getCliTypeEntry(cliType);
    if (!entry) {
      throw new Error(`Unknown CLI type: ${cliType}`);
    }
    return entry;
  }

  private requireWorkingDirectory(dirPath: string) {
    const workingDir = this.configLoader.getWorkingDirectories().find((entry) => entry.path === dirPath);
    if (!workingDir) {
      throw new Error(`Working directory is not configured in Helm: ${dirPath}`);
    }
    return workingDir;
  }

  private resolveToolEnv(cliType: string): Record<string, string> | undefined {
    const envEntries = this.requireCliEntry(cliType).env;
    if (!envEntries?.length) return undefined;
    const env = Object.fromEntries(
      envEntries
        .filter((entry) => typeof entry?.name === 'string' && entry.name.trim().length > 0)
        .map((entry) => [entry.name.trim(), this.resolveEnvValue(typeof entry?.value === 'string' ? entry.value : '')]),
    );
    return Object.keys(env).length > 0 ? env : undefined;
  }

  private resolveEnvValue(value: string): string {
    return value
      .replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, envName: string) => process.env[envName] ?? '')
      .replace(/%([A-Za-z_][A-Za-z0-9_]*)%/g, (_match, envName: string) => process.env[envName] ?? '');
  }
}

function requireResult<T>(value: T | null, message: string): T {
  if (value === null) {
    throw new Error(message);
  }
  return value;
}
